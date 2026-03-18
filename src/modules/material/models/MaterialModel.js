import pool from "../../../db/pool.js";

export class MaterialModel {
  // Get all materials with category and UOM info
  static async getAll(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "m.is_active = true";
    let params = [];

    if (filters.category_id) {
      whereClause += " AND m.category_id = ?";
      params.push(filters.category_id);
    }

    if (filters.location_id) {
      whereClause += " AND ms.location_id = ?";
      params.push(filters.location_id);
    }

    if (filters.search) {
      whereClause += " AND (m.sku_code LIKE ? OR m.name LIKE ?)";
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (filters.low_stock) {
      whereClause += " AND COALESCE(ms.on_hand_qty, 0) <= m.min_stock";
    }

    const [rows] = await pool.query(
      `
      SELECT 
        m.*,
        mc.name as category_name,
        uom1.name as default_uom_name,
        uom1.symbol as default_uom_symbol,
        uom2.name as alt_uom_name,
        uom2.symbol as alt_uom_symbol,
        COALESCE(ms.on_hand_qty, 0) as total_stock,
        ms.last_movement_date
      FROM materials m
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_uom uom1 ON m.default_uom_id = uom1.id
      LEFT JOIN material_uom uom2 ON m.alt_uom_id = uom2.id
      LEFT JOIN (
        SELECT material_id, SUM(on_hand_qty) as on_hand_qty, MAX(last_movement_date) as last_movement_date
        FROM material_stock
        GROUP BY material_id
      ) ms ON m.id = ms.material_id
      WHERE ${whereClause}
      ORDER BY m.name ASC
    `,
      params,
    );

    return { rows };
  }

  // Get material by ID
  static async getById(id) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT 
        m.*,
        mc.name as category_name,
        uom1.name as default_uom_name,
        uom1.symbol as default_uom_symbol,
        uom2.name as alt_uom_name,
        uom2.symbol as alt_uom_symbol,
        COALESCE(ms.on_hand_qty, 0) as total_stock
      FROM materials m
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_uom uom1 ON m.default_uom_id = uom1.id
      LEFT JOIN material_uom uom2 ON m.alt_uom_id = uom2.id
      LEFT JOIN (
        SELECT material_id, SUM(on_hand_qty) as on_hand_qty
        FROM material_stock
        GROUP BY material_id
      ) ms ON m.id = ms.material_id
      WHERE m.id = ? AND m.is_active = true
    `,
      [id],
    );

    return rows[0] || null;
  }

  // Get material by SKU
  static async getBySku(sku_code) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT * FROM materials 
      WHERE sku_code = ? AND is_active = true
    `,
      [sku_code],
    );

    return rows[0] || null;
  }

  // Create new material
  static async create(materialData) {
    if (!pool) return null;

    const { sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes, notes } = materialData;

    const [result] = await pool.query(
      `
      INSERT INTO materials (
        sku_code, name, category_id, description, image_url,
        default_uom_id, alt_uom_id, alt_uom_conversion, pack_size,
        supplier_reference, lead_time_days, min_stock, max_stock,
        reorder_qty, reorder_point, stock_policy, custom_attributes, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes ? JSON.stringify(custom_attributes) : null, notes],
    );

    return { id: result.insertId };
  }

  // Update material
  static async update(id, materialData) {
    if (!pool) return false;

    const { sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes, notes } = materialData;

    const [result] = await pool.query(
      `
      UPDATE materials 
      SET sku_code = ?, name = ?, category_id = ?, description = ?, image_url = ?,
          default_uom_id = ?, alt_uom_id = ?, alt_uom_conversion = ?, pack_size = ?,
          supplier_reference = ?, lead_time_days = ?, min_stock = ?, max_stock = ?,
          reorder_qty = ?, reorder_point = ?, stock_policy = ?, 
          custom_attributes = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = true
    `,
      [sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes ? JSON.stringify(custom_attributes) : null, notes, id],
    );

    return result.affectedRows > 0;
  }

  // Deactivate material
  static async deactivate(id) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      UPDATE materials 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [id],
    );

    return result.affectedRows > 0;
  }

  // Get stock by location
  static async getStockByLocation(materialId) {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(
      `
      SELECT 
        ms.*,
        ml.name as location_name,
        ml.location_type
      FROM material_stock ms
      LEFT JOIN material_locations ml ON ms.location_id = ml.id
      WHERE ms.material_id = ? AND ml.is_active = true
      ORDER BY ml.name ASC
    `,
      [materialId],
    );

    return { rows };
  }

  // Get total stock
  static async getTotalStock(materialId) {
    if (!pool) return 0;

    const [rows] = await pool.query(
      `
      SELECT SUM(on_hand_qty) as total_stock
      FROM material_stock
      WHERE material_id = ?
    `,
      [materialId],
    );

    return parseFloat(rows[0]?.total_stock || 0);
  }

  // Get low stock materials
  static async getLowStockMaterials() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT 
        m.*,
        mc.name as category_name,
        uom1.name as default_uom_name,
        uom1.symbol as default_uom_symbol,
        COALESCE(ms.on_hand_qty, 0) as total_stock,
        m.min_stock,
        m.max_stock,
        m.reorder_qty,
        m.reorder_point,
        m.stock_policy,
        CASE 
          WHEN m.stock_policy = 'min_max' THEN m.max_stock - COALESCE(ms.on_hand_qty, 0)
          ELSE m.reorder_qty
        END as suggested_qty,
        m.lead_time_days,
        CASE 
          WHEN m.lead_time_days <= 3 THEN 'Critical'
          WHEN m.lead_time_days <= 7 THEN 'Warning'
          ELSE 'Normal'
        END as urgency
      FROM materials m
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_uom uom1 ON m.default_uom_id = uom1.id
      LEFT JOIN (
        SELECT material_id, SUM(on_hand_qty) as on_hand_qty
        FROM material_stock
        GROUP BY material_id
      ) ms ON m.id = ms.material_id
      WHERE m.is_active = true 
        AND (
          (m.stock_policy = 'min_max' AND COALESCE(ms.on_hand_qty, 0) <= m.min_stock) OR
          (m.stock_policy = 'rop' AND COALESCE(ms.on_hand_qty, 0) <= m.reorder_point)
        )
      ORDER BY urgency ASC, m.lead_time_days ASC
    `);

    return { rows };
  }

  // Get usage trends (last 30 days)
  static async getUsageTrends(materialId, days = 30) {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(
      `
      SELECT 
        DATE(transaction_date) as date,
        SUM(CASE WHEN stock_impact = 'negative' THEN quantity ELSE 0 END) as usage_qty,
        COUNT(CASE WHEN stock_impact = 'negative' THEN 1 END) as issue_count
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE mt.material_id = ? 
        AND mt.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND mtt.stock_impact = 'negative'
      GROUP BY DATE(transaction_date)
      ORDER BY date ASC
    `,
      [materialId, days],
    );

    return { rows };
  }

  // Calculate days of cover
  static async calculateDaysOfCover(materialId, windowDays = 30) {
    if (!pool) return 0;

    const [rows] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN mtt.stock_impact = 'negative' THEN mt.quantity ELSE 0 END), 0) / ? as avg_daily_usage
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE mt.material_id = ? 
        AND mt.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND mtt.stock_impact = 'negative'
    `,
      [windowDays, materialId, windowDays],
    );

    const avgDailyUsage = parseFloat(rows[0]?.avg_daily_usage || 0);
    const totalStock = await this.getTotalStock(materialId);

    return avgDailyUsage > 0 ? Math.round(totalStock / avgDailyUsage) : 0;
  }
}
