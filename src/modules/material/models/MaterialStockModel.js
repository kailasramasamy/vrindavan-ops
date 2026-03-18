import pool from "../../../db/pool.js";

export class MaterialStockModel {
  // Get stock by material and location
  static async getStock(materialId, locationId) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT * FROM material_stock 
      WHERE material_id = ? AND location_id = ?
    `,
      [materialId, locationId],
    );

    return rows[0] || null;
  }

  // Get stock by location for a material
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

  // Create or update stock
  static async upsertStock(materialId, locationId, onHandQty, reservedQty = 0) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      INSERT INTO material_stock (material_id, location_id, on_hand_qty, reserved_qty, last_movement_date)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        on_hand_qty = on_hand_qty + ?,
        reserved_qty = ?,
        last_movement_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
      [materialId, locationId, onHandQty, reservedQty, onHandQty, reservedQty],
    );

    return result.affectedRows > 0;
  }

  // Update stock quantity
  static async updateStock(materialId, locationId, quantityChange) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      INSERT INTO material_stock (material_id, location_id, on_hand_qty, last_movement_date)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        on_hand_qty = on_hand_qty + ?,
        last_movement_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
      [materialId, locationId, quantityChange, quantityChange],
    );

    return result.affectedRows > 0;
  }

  // Reserve stock
  static async reserveStock(materialId, locationId, quantity) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      UPDATE material_stock 
      SET reserved_qty = reserved_qty + ?
      WHERE material_id = ? AND location_id = ? 
        AND (on_hand_qty - reserved_qty) >= ?
    `,
      [quantity, materialId, locationId, quantity],
    );

    return result.affectedRows > 0;
  }

  // Release reserved stock
  static async releaseReservedStock(materialId, locationId, quantity) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      UPDATE material_stock 
      SET reserved_qty = GREATEST(0, reserved_qty - ?)
      WHERE material_id = ? AND location_id = ?
    `,
      [quantity, materialId, locationId],
    );

    return result.affectedRows > 0;
  }

  // Get all stock levels
  static async getAllStock(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "m.is_active = true";
    let params = [];

    if (filters.material_id) {
      whereClause += " AND ms.material_id = ?";
      params.push(filters.material_id);
    }

    if (filters.location_id) {
      whereClause += " AND ms.location_id = ?";
      params.push(filters.location_id);
    }

    if (filters.category_id) {
      whereClause += " AND m.category_id = ?";
      params.push(filters.category_id);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        ms.*,
        m.sku_code,
        m.name as material_name,
        m.min_stock,
        m.max_stock,
        m.stock_policy,
        mc.name as category_name,
        ml.name as location_name,
        ml.location_type,
        uom.name as uom_name,
        uom.symbol as uom_symbol,
        CASE 
          WHEN ms.on_hand_qty <= m.min_stock THEN 'Low'
          WHEN ms.on_hand_qty >= m.max_stock THEN 'High'
          ELSE 'Normal'
        END as stock_status
      FROM material_stock ms
      LEFT JOIN materials m ON ms.material_id = m.id
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_locations ml ON ms.location_id = ml.id
      LEFT JOIN material_uom uom ON m.default_uom_id = uom.id
      WHERE ${whereClause}
      ORDER BY m.name ASC, ml.name ASC
    `,
      params,
    );

    return { rows };
  }

  // Get stock summary by location
  static async getStockSummaryByLocation() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT 
        ml.id,
        ml.name as location_name,
        ml.location_type,
        COUNT(ms.id) as material_count,
        SUM(ms.on_hand_qty) as total_quantity,
        COUNT(CASE WHEN ms.on_hand_qty <= m.min_stock THEN 1 END) as low_stock_count
      FROM material_locations ml
      LEFT JOIN material_stock ms ON ml.id = ms.location_id
      LEFT JOIN materials m ON ms.material_id = m.id
      WHERE ml.is_active = true
      GROUP BY ml.id, ml.name, ml.location_type
      ORDER BY ml.name ASC
    `);

    return { rows };
  }

  // Get stock summary by category
  static async getStockSummaryByCategory() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT 
        mc.id,
        mc.name as category_name,
        COUNT(DISTINCT ms.material_id) as material_count,
        SUM(ms.on_hand_qty) as total_quantity,
        COUNT(CASE WHEN ms.on_hand_qty <= m.min_stock THEN 1 END) as low_stock_count
      FROM material_categories mc
      LEFT JOIN materials m ON mc.id = m.category_id
      LEFT JOIN material_stock ms ON m.id = ms.material_id
      WHERE mc.is_active = true AND m.is_active = true
      GROUP BY mc.id, mc.name
      ORDER BY mc.name ASC
    `);

    return { rows };
  }

  // Get low stock alerts
  static async getLowStockAlerts() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT 
        ms.*,
        m.sku_code,
        m.name as material_name,
        m.min_stock,
        m.max_stock,
        m.reorder_qty,
        m.reorder_point,
        m.stock_policy,
        m.lead_time_days,
        ml.name as location_name,
        mc.name as category_name,
        uom.name as uom_name,
        uom.symbol as uom_symbol,
        CASE 
          WHEN m.stock_policy = 'min_max' THEN m.max_stock - ms.on_hand_qty
          ELSE m.reorder_qty
        END as suggested_qty,
        CASE 
          WHEN m.lead_time_days <= 3 THEN 'Critical'
          WHEN m.lead_time_days <= 7 THEN 'Warning'
          ELSE 'Normal'
        END as urgency
      FROM material_stock ms
      LEFT JOIN materials m ON ms.material_id = m.id
      LEFT JOIN material_locations ml ON ms.location_id = ml.id
      LEFT JOIN material_categories mc ON m.category_id = mc.id
      LEFT JOIN material_uom uom ON m.default_uom_id = uom.id
      WHERE m.is_active = true AND ml.is_active = true
        AND (
          (m.stock_policy = 'min_max' AND ms.on_hand_qty <= m.min_stock) OR
          (m.stock_policy = 'rop' AND ms.on_hand_qty <= m.reorder_point)
        )
      ORDER BY urgency ASC, m.lead_time_days ASC, ms.on_hand_qty ASC
    `);

    return { rows };
  }

  // Get stock movement history
  static async getStockMovementHistory(materialId, locationId = null, days = 30) {
    if (!pool) return { rows: [] };

    let whereClause = "mt.material_id = ? AND mt.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)";
    let params = [materialId, days];

    if (locationId) {
      whereClause += " AND mt.location_id = ?";
      params.push(locationId);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        mt.*,
        mtt.name as transaction_type_name,
        mtt.stock_impact,
        ml.name as location_name,
        u.name as user_name
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      LEFT JOIN material_locations ml ON mt.location_id = ml.id
      LEFT JOIN users u ON mt.user_id = u.id
      WHERE ${whereClause}
      ORDER BY mt.transaction_date DESC
    `,
      params,
    );

    return { rows };
  }
}
