import pool from "../../../db/pool.js";

export class ProductionModel {
  // Get daily production for a specific date
  static async getDailyProduction(date, filters = {}) {
    const { product_id, category_id } = filters;

    let sql = `
      SELECT dp.*, p.name as product_name, p.unit_size, p.milk_type, p.milk_per_unit, p.auto_calculate_milk,
             pc.name as category_name
      FROM daily_production dp
      LEFT JOIN products p ON dp.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE dp.production_date = ?
    `;

    const params = [date];

    if (product_id) {
      sql += ` AND dp.product_id = ?`;
      params.push(product_id);
    }

    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    sql += ` ORDER BY pc.name, p.name`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching daily production:", error);
      return { success: false, error: error.message };
    }
  }

  // Get production for a date range
  static async getProductionRange(startDate, endDate, filters = {}) {
    const { product_id, category_id, milk_type } = filters;

    let sql = `
      SELECT dp.*, p.name as product_name, p.unit_size, p.milk_type, p.milk_per_unit, p.auto_calculate_milk,
             pc.name as category_name
      FROM daily_production dp
      LEFT JOIN products p ON dp.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE dp.production_date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (product_id) {
      sql += ` AND dp.product_id = ?`;
      params.push(product_id);
    }

    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (milk_type) {
      sql += ` AND p.milk_type = ?`;
      params.push(milk_type);
    }

    sql += ` ORDER BY dp.production_date DESC, pc.name, p.name`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching production range:", error);
      return { success: false, error: error.message };
    }
  }

  // Create or update daily production entry
  static async upsertDailyProduction(productionData) {
    const { production_date, product_id, quantity_produced, milk_used, notes, created_by } = productionData;

    const sql = `
      INSERT INTO daily_production (production_date, product_id, quantity_produced, milk_used, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      quantity_produced = VALUES(quantity_produced),
      milk_used = VALUES(milk_used),
      notes = VALUES(notes),
      created_by = VALUES(created_by),
      updated_at = CURRENT_TIMESTAMP
    `;

    const params = [production_date, product_id, quantity_produced, milk_used, notes, created_by];

    try {
      const [result] = await pool.execute(sql, params);
      return { success: true, id: result.insertId || result.affectedRows };
    } catch (error) {
      console.error("Error upserting daily production:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete daily production entry
  static async deleteDailyProduction(product_id, production_date) {
    const sql = `DELETE FROM daily_production WHERE product_id = ? AND production_date = ?`;

    try {
      const [result] = await pool.execute(sql, [product_id, production_date]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting daily production:", error);
      return { success: false, error: error.message };
    }
  }

  // Get production summary for a date
  static async getProductionSummary(date) {
    const sql = `
      SELECT 
        dp.production_date,
        COUNT(DISTINCT dp.product_id) as total_products_produced,
        SUM(dp.milk_used) as total_milk_used,
        SUM(dp.quantity_produced) as total_quantity_produced,
        SUM(CASE WHEN p.milk_type = 'A1' THEN dp.milk_used ELSE 0 END) as a1_milk_used,
        SUM(CASE WHEN p.milk_type = 'A2' THEN dp.milk_used ELSE 0 END) as a2_milk_used,
        SUM(CASE WHEN p.milk_type = 'Buffalo' THEN dp.milk_used ELSE 0 END) as buffalo_milk_used
      FROM daily_production dp
      LEFT JOIN products p ON dp.product_id = p.id
      WHERE dp.production_date = ?
      GROUP BY dp.production_date
    `;

    try {
      const [rows] = await pool.execute(sql, [date]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching production summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get production analytics for a date range
  static async getProductionAnalytics(startDate, endDate, groupBy = "day") {
    let dateFormat = "%Y-%m-%d";
    if (groupBy === "week") {
      dateFormat = "%Y-%u";
    } else if (groupBy === "month") {
      dateFormat = "%Y-%m";
    }

    // Get production data
    const productionSql = `
      SELECT 
        DATE_FORMAT(dp.production_date, '${dateFormat}') as period,
        MIN(DATE_FORMAT(dp.production_date, '%Y-%m-%d')) as production_date,
        COUNT(DISTINCT dp.product_id) as total_products_produced,
        SUM(dp.quantity_produced) as total_quantity_produced,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'A1' THEN dp.product_id END) as a1_products_count,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'A2' THEN dp.product_id END) as a2_products_count,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'Buffalo' THEN dp.product_id END) as buffalo_products_count
      FROM daily_production dp
      LEFT JOIN products p ON dp.product_id = p.id
      WHERE DATE_FORMAT(dp.production_date, '%Y-%m-%d') BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(dp.production_date, '${dateFormat}')
      ORDER BY production_date
    `;

    // Get milk inventory data
    const milkSql = `
      SELECT 
        DATE_FORMAT(created_at, '${dateFormat}') as period,
        MIN(DATE_FORMAT(created_at, '%Y-%m-%d')) as usage_date,
        SUM(quantity_used) as total_milk_used,
        SUM(CASE WHEN milk_type = 'A1' THEN quantity_used ELSE 0 END) as a1_milk_used,
        SUM(CASE WHEN milk_type = 'A2' THEN quantity_used ELSE 0 END) as a2_milk_used,
        SUM(CASE WHEN milk_type = 'Buffalo' THEN quantity_used ELSE 0 END) as buffalo_milk_used
      FROM daily_milk_inventory
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(created_at, '${dateFormat}')
      ORDER BY usage_date
    `;

    try {
      // Execute both queries
      const [productionRows] = await pool.execute(productionSql, [startDate, endDate]);
      const [milkRows] = await pool.execute(milkSql, [startDate, endDate]);

      // Combine the results
      const combinedRows = productionRows.map((prodRow) => {
        const milkRow = milkRows.find((m) => m.period === prodRow.period);
        return {
          ...prodRow,
          total_milk_used: milkRow?.total_milk_used || 0,
          a1_milk_used: milkRow?.a1_milk_used || 0,
          a2_milk_used: milkRow?.a2_milk_used || 0,
          buffalo_milk_used: milkRow?.buffalo_milk_used || 0,
        };
      });

      return { success: true, rows: combinedRows };
    } catch (error) {
      console.error("Error fetching production analytics:", error);
      return { success: false, error: error.message };
    }
  }

  // Get top products by production quantity
  static async getTopProducts(startDate, endDate, limit = 10) {
    try {
      // Ensure all parameters are valid
      if (!startDate || !endDate) {
        throw new Error("Start date and end date are required");
      }

      // Validate and sanitize limit value (must be a positive integer)
      const limitValue = Math.max(1, Math.min(1000, parseInt(limit) || 10));

      // Use DATE_FORMAT to handle timestamp dates properly
      // Note: LIMIT value is directly inserted (after validation) instead of using placeholder
      // because MySQL prepared statements don't handle LIMIT ? well in some configurations
      const sql = `
        SELECT 
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          pc.name as category_name,
          SUM(dp.quantity_produced) as total_quantity,
          SUM(dp.milk_used) as total_milk_used,
          COUNT(DISTINCT DATE_FORMAT(dp.production_date, '%Y-%m-%d')) as production_days
        FROM daily_production dp
        LEFT JOIN products p ON dp.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE DATE_FORMAT(dp.production_date, '%Y-%m-%d') >= ? AND DATE_FORMAT(dp.production_date, '%Y-%m-%d') <= ?
        GROUP BY dp.product_id, p.name, p.unit_size, p.milk_type, pc.name
        ORDER BY total_quantity DESC
        LIMIT ${limitValue}
      `;

      // Execute query with date parameters only
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching top products:", error);
      return { success: false, error: error.message };
    }
  }

  // Get milk usage by type for a date range
  static async getMilkUsageByType(startDate, endDate) {
    const sql = `
      SELECT 
        milk_type,
        SUM(quantity_used) as total_milk_used,
        COUNT(*) as entries_count,
        COUNT(DISTINCT DATE_FORMAT(created_at, '%Y-%m-%d')) as usage_days
      FROM daily_milk_inventory
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN ? AND ?
      GROUP BY milk_type
      ORDER BY total_milk_used DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk usage by type:", error);
      return { success: false, error: error.message };
    }
  }

  // Get production data with product details for dashboard cards
  static async getProductionDataForDashboard(date = null) {
    const targetDate = date || new Date().toISOString().split("T")[0];

    const sql = `
      SELECT 
        p.id as product_id,
        p.name,
        p.unit_size,
        p.milk_type,
        p.image_url,
        p.category_id,
        pc.name as category_name,
        COALESCE(SUM(dp.quantity_produced), 0) as total_produced,
        COALESCE(SUM(dp.milk_used), 0) as total_milk_used,
        COUNT(DISTINCT dp.production_date) as production_days
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN daily_production dp ON p.id = dp.product_id 
        AND dp.production_date = ?
      WHERE p.is_active = 1
      GROUP BY p.id, p.name, p.unit_size, p.milk_type, p.image_url, p.category_id, pc.name
      ORDER BY p.milk_type, p.id, p.name
    `;

    try {
      const [rows] = await pool.execute(sql, [targetDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching production data for dashboard:", error);
      return { success: false, error: error.message };
    }
  }

  // Get comprehensive analytics summary
  static async getAnalyticsSummary(startDate, endDate) {
    // Get production data
    const productionSql = `
      SELECT 
        COUNT(DISTINCT DATE_FORMAT(dp.production_date, '%Y-%m-%d')) as total_production_days,
        COUNT(DISTINCT dp.product_id) as total_unique_products,
        SUM(dp.quantity_produced) as total_quantity_produced,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'A1' THEN dp.product_id END) as a1_products_count,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'A2' THEN dp.product_id END) as a2_products_count,
        COUNT(DISTINCT CASE WHEN p.milk_type = 'Buffalo' THEN dp.product_id END) as buffalo_products_count,
        AVG(dp.quantity_produced) as avg_daily_production,
        MAX(dp.quantity_produced) as peak_daily_production
      FROM daily_production dp
      LEFT JOIN products p ON dp.product_id = p.id
      WHERE DATE_FORMAT(dp.production_date, '%Y-%m-%d') BETWEEN ? AND ?
    `;

    // Get milk inventory data
    const milkSql = `
      SELECT 
        SUM(quantity_used) as total_milk_used,
        SUM(CASE WHEN milk_type = 'A1' THEN quantity_used ELSE 0 END) as total_a1_milk_used,
        SUM(CASE WHEN milk_type = 'A2' THEN quantity_used ELSE 0 END) as total_a2_milk_used,
        SUM(CASE WHEN milk_type = 'Buffalo' THEN quantity_used ELSE 0 END) as total_buffalo_milk_used,
        AVG(quantity_used) as avg_daily_milk_usage,
        MAX(quantity_used) as peak_daily_milk_usage
      FROM daily_milk_inventory
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN ? AND ?
    `;

    try {
      // Execute both queries
      const [productionRows] = await pool.execute(productionSql, [startDate, endDate]);
      const [milkRows] = await pool.execute(milkSql, [startDate, endDate]);

      // Combine the results
      const productionData = productionRows[0] || {};
      const milkData = milkRows[0] || {};

      // Calculate correct peak values
      const peakDailyProductionTotal = await this.calculatePeakDailyProduction(startDate, endDate);
      const peakDailyMilkUsageTotal = await this.calculatePeakDailyMilkUsage(startDate, endDate);

      const combinedData = {
        ...productionData,
        ...milkData,
        peak_daily_production: peakDailyProductionTotal,
        peak_daily_milk_usage: peakDailyMilkUsageTotal,
      };

      return { success: true, rows: combinedData };
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Calculate peak daily production (total production per day)
  static async calculatePeakDailyProduction(startDate, endDate) {
    const sql = `
      SELECT 
        DATE_FORMAT(dp.production_date, '%Y-%m-%d') as production_date,
        SUM(dp.quantity_produced) as daily_total
      FROM daily_production dp
      WHERE DATE_FORMAT(dp.production_date, '%Y-%m-%d') BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(dp.production_date, '%Y-%m-%d')
      ORDER BY daily_total DESC
      LIMIT 1
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return rows[0]?.daily_total || 0;
    } catch (error) {
      console.error("Error calculating peak daily production:", error);
      return 0;
    }
  }

  // Calculate peak daily milk usage (total milk usage per day)
  static async calculatePeakDailyMilkUsage(startDate, endDate) {
    const sql = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d') as usage_date,
        SUM(quantity_used) as daily_total
      FROM daily_milk_inventory
      WHERE DATE_FORMAT(created_at, '%Y-%m-%d') BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY daily_total DESC
      LIMIT 1
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return rows[0]?.daily_total || 0;
    } catch (error) {
      console.error("Error calculating peak daily milk usage:", error);
      return 0;
    }
  }

  // Get milk volume trends for chart
  static async getMilkVolumeTrends(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1); // Include one more day to ensure we get all data

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get all available data first to see what we have
    const [allData] = await pool.execute(`
      SELECT inventory_date, milk_type, quantity_available
      FROM daily_milk_inventory
      WHERE milk_type IS NOT NULL
        AND quantity_available > 0
      ORDER BY inventory_date DESC
    `);

    const sql = `
      SELECT 
        DATE_FORMAT(inventory_date, '%Y-%m-%d') as production_date,
        milk_type,
        quantity_available as daily_milk_volume,
        1 as products_count
      FROM daily_milk_inventory
      WHERE DATE(inventory_date) >= ?
        AND DATE(inventory_date) <= ?
        AND milk_type IS NOT NULL
        AND quantity_available > 0
      ORDER BY inventory_date ASC, milk_type
    `;

    try {
      const [rows] = await pool.execute(sql, [startDateStr, endDateStr]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk volume trends:", error);
      return { success: false, error: error.message };
    }
  }
}
