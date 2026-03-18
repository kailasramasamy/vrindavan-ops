import pool from "../../../db/pool.js";

export class MaterialTransactionModel {
  // Generate unique transaction number
  static async generateTransactionNumber(prefix = "MT") {
    if (!pool) return `${prefix}${Date.now()}`;

    const [rows] = await pool.query(
      `
      SELECT COUNT(*) as count 
      FROM material_transactions 
      WHERE transaction_number LIKE ?
    `,
      [`${prefix}%`],
    );

    const count = rows[0].count + 1;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `${prefix}${date}${count.toString().padStart(4, "0")}`;
  }

  // Create transaction
  static async createTransaction(transactionData) {
    if (!pool) return null;

    const { transaction_type_id, material_id, location_id, quantity, unit_price = 0, reference_number, lot_number, department, job_order, machine_id, reason, notes, user_id } = transactionData;

    // Generate transaction number
    const transaction_number = await this.generateTransactionNumber();

    const [result] = await pool.query(
      `
      INSERT INTO material_transactions (
        transaction_number, transaction_type_id, material_id, location_id, 
        quantity, unit_price, reference_number, lot_number, department, 
        job_order, machine_id, reason, notes, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [transaction_number, transaction_type_id, material_id, location_id, quantity, unit_price, reference_number, lot_number, department, job_order, machine_id, reason, notes, user_id],
    );

    return { id: result.insertId, transaction_number };
  }

  // Get transaction by ID
  static async getById(id) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT 
        mt.*,
        mtt.name as transaction_type_name,
        mtt.stock_impact,
        m.sku_code,
        m.name as material_name,
        ml.name as location_name,
        u.name as user_name
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      LEFT JOIN materials m ON mt.material_id = m.id
      LEFT JOIN material_locations ml ON mt.location_id = ml.id
      LEFT JOIN users u ON mt.user_id = u.id
      WHERE mt.id = ?
    `,
      [id],
    );

    return rows[0] || null;
  }

  // Get all transactions with filters
  static async getAll(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "1=1";
    let params = [];

    if (filters.material_id) {
      whereClause += " AND mt.material_id = ?";
      params.push(filters.material_id);
    }

    if (filters.location_id) {
      whereClause += " AND mt.location_id = ?";
      params.push(filters.location_id);
    }

    if (filters.transaction_type_id) {
      whereClause += " AND mt.transaction_type_id = ?";
      params.push(filters.transaction_type_id);
    }

    if (filters.date_from) {
      whereClause += " AND mt.transaction_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += " AND mt.transaction_date <= ?";
      params.push(filters.date_to);
    }

    if (filters.reference_number) {
      whereClause += " AND mt.reference_number LIKE ?";
      params.push(`%${filters.reference_number}%`);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        mt.*,
        mtt.name as transaction_type_name,
        mtt.stock_impact,
        m.sku_code,
        m.name as material_name,
        ml.name as location_name,
        u.name as user_name
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      LEFT JOIN materials m ON mt.material_id = m.id
      LEFT JOIN material_locations ml ON mt.location_id = ml.id
      LEFT JOIN users u ON mt.user_id = u.id
      WHERE ${whereClause}
      ORDER BY mt.transaction_date DESC, mt.id DESC
      LIMIT 1000
    `,
      params,
    );

    return { rows };
  }

  // Get transaction types
  static async getTransactionTypes() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT * FROM material_transaction_types 
      WHERE is_active = true
      ORDER BY name ASC
    `);

    return { rows };
  }

  // Get recent transactions
  static async getRecentTransactions(limit = 50) {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(
      `
      SELECT 
        mt.*,
        mtt.name as transaction_type_name,
        mtt.stock_impact,
        m.sku_code,
        m.name as material_name,
        m.default_uom_id,
        uom.symbol as default_uom_symbol,
        ml.name as location_name,
        u.name as user_name
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      LEFT JOIN materials m ON mt.material_id = m.id
      LEFT JOIN material_uom uom ON m.default_uom_id = uom.id
      LEFT JOIN material_locations ml ON mt.location_id = ml.id
      LEFT JOIN users u ON mt.user_id = u.id
      ORDER BY mt.transaction_date DESC, mt.id DESC
      LIMIT ?
    `,
      [limit],
    );

    return { rows };
  }

  // Get transaction summary by type
  static async getTransactionSummary(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "1=1";
    let params = [];

    if (filters.date_from) {
      whereClause += " AND mt.transaction_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += " AND mt.transaction_date <= ?";
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        mtt.name as transaction_type_name,
        mtt.stock_impact,
        COUNT(*) as transaction_count,
        SUM(mt.quantity) as total_quantity,
        SUM(mt.total_value) as total_value,
        COUNT(DISTINCT mt.material_id) as unique_materials,
        COUNT(DISTINCT mt.location_id) as unique_locations
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE ${whereClause}
      GROUP BY mtt.id, mtt.name, mtt.stock_impact
      ORDER BY transaction_count DESC
    `,
      params,
    );

    return { rows };
  }

  // Get daily transaction trends
  static async getDailyTrends(days = 30) {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(
      `
      SELECT 
        DATE(mt.transaction_date) as date,
        mtt.stock_impact,
        COUNT(*) as transaction_count,
        SUM(mt.quantity) as total_quantity,
        SUM(mt.total_value) as total_value
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE mt.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(mt.transaction_date), mtt.stock_impact
      ORDER BY date DESC
    `,
      [days],
    );

    return { rows };
  }

  // Get department-wise usage
  static async getDepartmentUsage(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "mt.department IS NOT NULL AND mtt.stock_impact = 'negative'";
    let params = [];

    if (filters.date_from) {
      whereClause += " AND mt.transaction_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += " AND mt.transaction_date <= ?";
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        mt.department,
        COUNT(*) as transaction_count,
        SUM(mt.quantity) as total_quantity,
        SUM(mt.total_value) as total_value,
        COUNT(DISTINCT mt.material_id) as unique_materials
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE ${whereClause}
      GROUP BY mt.department
      ORDER BY total_quantity DESC
    `,
      params,
    );

    return { rows };
  }

  // Get machine-wise usage
  static async getMachineUsage(filters = {}) {
    if (!pool) return { rows: [] };

    let whereClause = "mt.machine_id IS NOT NULL AND mtt.stock_impact = 'negative'";
    let params = [];

    if (filters.date_from) {
      whereClause += " AND mt.transaction_date >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += " AND mt.transaction_date <= ?";
      params.push(filters.date_to);
    }

    const [rows] = await pool.query(
      `
      SELECT 
        mt.machine_id,
        COUNT(*) as transaction_count,
        SUM(mt.quantity) as total_quantity,
        SUM(mt.total_value) as total_value,
        COUNT(DISTINCT mt.material_id) as unique_materials
      FROM material_transactions mt
      LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
      WHERE ${whereClause}
      GROUP BY mt.machine_id
      ORDER BY total_quantity DESC
    `,
      params,
    );

    return { rows };
  }
}
