import pool from "../../../db/pool.js";

export class AccountingCategoryModel {
  // Get all categories
  static async getAllCategories() {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM acc_categories 
         WHERE is_active = 1 
         ORDER BY category_name ASC`,
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching categories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category by ID
  static async getCategoryById(id) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM acc_categories WHERE id = ?`, [id]);
      return { success: true, category: rows[0] || null };
    } catch (error) {
      console.error("Error fetching category:", error);
      return { success: false, error: error.message };
    }
  }

  // Create category
  static async createCategory(data) {
    try {
      const { category_name, category_code, description, color_code, icon } = data;

      const [result] = await pool.execute(
        `INSERT INTO acc_categories 
        (category_name, category_code, description, color_code, icon)
        VALUES (?, ?, ?, ?, ?)`,
        [category_name, category_code, description || null, color_code || "#3B82F6", icon || "folder"],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Update category
  static async updateCategory(id, data) {
    try {
      const { category_name, category_code, description, color_code, icon, is_active } = data;

      await pool.execute(
        `UPDATE acc_categories 
        SET category_name = ?, category_code = ?, description = ?, 
            color_code = ?, icon = ?, is_active = ?
        WHERE id = ?`,
        [category_name, category_code, description || null, color_code || "#3B82F6", icon || "folder", is_active !== undefined ? is_active : 1, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete category
  static async deleteCategory(id) {
    try {
      await pool.execute(`DELETE FROM acc_categories WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting category:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category statistics
  static async getCategoryStats() {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          c.id,
          c.category_name,
          c.category_code,
          c.color_code,
          COUNT(DISTINCT b.id) as beneficiary_count,
          COUNT(DISTINCT t.id) as transaction_count,
          COALESCE(SUM(t.debit_amount), 0) as total_debit,
          COALESCE(SUM(t.credit_amount), 0) as total_credit
        FROM acc_categories c
        LEFT JOIN acc_beneficiaries b ON c.id = b.category_id AND b.status = 'active'
        LEFT JOIN acc_transactions t ON c.id = t.category_id
        WHERE c.is_active = 1
        GROUP BY c.id, c.category_name, c.category_code, c.color_code
        ORDER BY total_debit DESC`,
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching category stats:", error);
      return { success: false, error: error.message };
    }
  }
}
