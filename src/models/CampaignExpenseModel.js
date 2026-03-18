import { marketingPool } from "../db/marketingPool.js";

class CampaignExpenseModel {
  // Create a new expense
  static async create(expenseData) {
    const { campaign_id, category, description, amount, vendor_name, expense_date, receipt_path, created_by } = expenseData;

    const query = `
      INSERT INTO campaign_expenses (
        campaign_id, category, description, amount, vendor_name, 
        expense_date, receipt_path, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Convert undefined values to null for MySQL
    const values = [campaign_id, category, description, amount, vendor_name || null, expense_date, receipt_path || null, created_by];

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Error creating expense:", error);
      throw error;
    }
  }

  // Get all expenses for a campaign
  static async getByCampaignId(campaignId) {
    const query = `
      SELECT ce.*, u.name as created_by_name
      FROM campaign_expenses ce
      LEFT JOIN users u ON ce.created_by = u.id
      WHERE ce.campaign_id = ?
      ORDER BY ce.expense_date DESC, ce.created_at DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, [campaignId]);
      return rows;
    } catch (error) {
      console.error("Error getting expenses by campaign ID:", error);
      throw error;
    }
  }

  // Get expense by ID
  static async getById(id) {
    const query = `
      SELECT ce.*, u.name as created_by_name, c.name as campaign_name
      FROM campaign_expenses ce
      LEFT JOIN users u ON ce.created_by = u.id
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
      WHERE ce.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error("Error getting expense by ID:", error);
      throw error;
    }
  }

  // Update expense
  static async update(id, updateData) {
    const allowedFields = ["category", "description", "amount", "vendor_name", "expense_date", "receipt_path"];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);

    const query = `
      UPDATE campaign_expenses 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating expense:", error);
      throw error;
    }
  }

  // Delete expense
  static async delete(id) {
    const query = "DELETE FROM campaign_expenses WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting expense:", error);
      throw error;
    }
  }

  // Get expenses by category
  static async getByCategory(category, filters = {}) {
    let query = `
      SELECT ce.*, u.name as created_by_name, c.name as campaign_name
      FROM campaign_expenses ce
      LEFT JOIN users u ON ce.created_by = u.id
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
      WHERE ce.category = ?
    `;

    const values = [category];

    if (filters.date_from) {
      query += " AND ce.expense_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND ce.expense_date <= ?";
      values.push(filters.date_to);
    }

    query += " ORDER BY ce.expense_date DESC";

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting expenses by category:", error);
      throw error;
    }
  }

  // Get expense summary by campaign
  static async getExpenseSummary(campaignId) {
    const query = `
      SELECT 
        category,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        MIN(expense_date) as first_expense,
        MAX(expense_date) as last_expense
      FROM campaign_expenses 
      WHERE campaign_id = ?
      GROUP BY category
      ORDER BY total_amount DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, [campaignId]);
      return rows;
    } catch (error) {
      console.error("Error getting expense summary:", error);
      throw error;
    }
  }

  // Get monthly expense breakdown
  static async getMonthlyBreakdown(filters = {}) {
    let query = `
      SELECT 
        DATE_FORMAT(ce.expense_date, '%Y-%m') as month,
        ce.category,
        COUNT(*) as count,
        SUM(ce.amount) as total_amount,
        c.type as campaign_type,
        c.channel
      FROM campaign_expenses ce
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
      WHERE 1=1
    `;

    const values = [];

    if (filters.date_from) {
      query += " AND ce.expense_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND ce.expense_date <= ?";
      values.push(filters.date_to);
    }

    if (filters.campaign_type) {
      query += " AND c.type = ?";
      values.push(filters.campaign_type);
    }

    query += `
      GROUP BY DATE_FORMAT(ce.expense_date, '%Y-%m'), ce.category, c.type, c.channel
      ORDER BY month DESC, total_amount DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting monthly expense breakdown:", error);
      throw error;
    }
  }

  // Get total expenses by date range
  static async getTotalExpenses(filters = {}) {
    let query = `
      SELECT 
        COALESCE(SUM(ce.amount), 0) as total_amount,
        COUNT(ce.id) as total_count,
        COALESCE(AVG(ce.amount), 0) as avg_amount
      FROM campaign_expenses ce
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
      WHERE 1=1
    `;

    const values = [];

    if (filters.date_from) {
      query += " AND ce.expense_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND ce.expense_date <= ?";
      values.push(filters.date_to);
    }

    if (filters.campaign_id) {
      query += " AND ce.campaign_id = ?";
      values.push(filters.campaign_id);
    }

    if (filters.category) {
      query += " AND ce.category = ?";
      values.push(filters.category);
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows[0];
    } catch (error) {
      console.error("Error getting total expenses:", error);
      throw error;
    }
  }

  // Get expense analytics
  static async getExpenseAnalytics(filters = {}) {
    // If no date filters provided, get all expenses
    let query = `
      SELECT 
        ce.category,
        COUNT(*) as expense_count,
        SUM(ce.amount) as total_amount,
        AVG(ce.amount) as avg_amount,
        MIN(ce.amount) as min_amount,
        MAX(ce.amount) as max_amount,
        c.type as campaign_type,
        c.channel
      FROM campaign_expenses ce
      LEFT JOIN campaigns c ON ce.campaign_id = c.id
    `;

    const values = [];

    // Only add date filter if both dates are provided
    if (filters.date_from && filters.date_to) {
      query += ` WHERE ce.expense_date >= ? AND ce.expense_date <= ?`;
      values.push(filters.date_from, filters.date_to);
    }

    query += `
      GROUP BY ce.category, c.type, c.channel
      ORDER BY total_amount DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting expense analytics:", error);
      throw error;
    }
  }
}

export default CampaignExpenseModel;
