import pool from "../../../db/pool.js";

export class CategoryModel {
  // Get all categories
  static async getAllCategories() {
    const sql = `
      SELECT pc.*, COUNT(p.id) as product_count
      FROM product_categories pc
      LEFT JOIN products p ON pc.id = p.category_id AND p.is_active = true
      GROUP BY pc.id
      ORDER BY pc.name
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching categories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category by ID
  static async getCategoryById(id) {
    const sql = `SELECT * FROM product_categories WHERE id = ?`;

    try {
      const [rows] = await pool.execute(sql, [id]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching category:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new category
  static async createCategory(categoryData) {
    const { name, description } = categoryData;

    const sql = `
      INSERT INTO product_categories (name, description)
      VALUES (?, ?)
    `;

    const params = [name, description];

    try {
      const [result] = await pool.execute(sql, params);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Update category
  static async updateCategory(id, categoryData) {
    const { name, description } = categoryData;

    const sql = `
      UPDATE product_categories 
      SET name = ?, description = ?
      WHERE id = ?
    `;

    const params = [name, description, id];

    try {
      const [result] = await pool.execute(sql, params);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete category (only if no products are associated)
  static async deleteCategory(id) {
    // First check if any products are associated with this category
    const checkSql = `SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = true`;

    try {
      const [checkResult] = await pool.execute(checkSql, [id]);

      if (checkResult[0].count > 0) {
        return { success: false, error: "Cannot delete category with active products" };
      }

      const sql = `DELETE FROM product_categories WHERE id = ?`;
      const [result] = await pool.execute(sql, [id]);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting category:", error);
      return { success: false, error: error.message };
    }
  }
}

