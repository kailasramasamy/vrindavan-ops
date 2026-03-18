import pool from "../../../db/pool.js";

export class MachineCategoryModel {
  // Get all machine categories
  static async getAllCategories() {
    const sql = `
      SELECT 
        mc.*,
        COUNT(m.id) as machine_count
      FROM machine_categories mc
      LEFT JOIN machines m ON mc.id = m.category_id AND m.is_active = true
      WHERE mc.is_active = true
      GROUP BY mc.id
      ORDER BY mc.name
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching machine categories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category by ID
  static async getCategoryById(id) {
    const sql = `
      SELECT 
        mc.*,
        COUNT(m.id) as machine_count
      FROM machine_categories mc
      LEFT JOIN machines m ON mc.id = m.category_id AND m.is_active = true
      WHERE mc.id = ? AND mc.is_active = true
      GROUP BY mc.id
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching machine category:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new category
  static async createCategory(categoryData) {
    const { name, description, icon, color } = categoryData;

    const sql = `
      INSERT INTO machine_categories (name, description, icon, color)
      VALUES (?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [name, description, icon, color]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating machine category:", error);
      return { success: false, error: error.message };
    }
  }

  // Update category
  static async updateCategory(id, categoryData) {
    const { name, description, icon, color } = categoryData;

    const sql = `
      UPDATE machine_categories 
      SET name = ?, description = ?, icon = ?, color = ?
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [name, description, icon, color, parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating machine category:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete category (soft delete)
  static async deleteCategory(id) {
    const sql = `UPDATE machine_categories SET is_active = false WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting machine category:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category statistics
  static async getCategoryStats() {
    const sql = `
      SELECT 
        mc.id,
        mc.name,
        mc.color,
        COUNT(m.id) as total_machines,
        COUNT(CASE WHEN m.status = 'active' THEN 1 END) as active_machines,
        COUNT(CASE WHEN m.status = 'maintenance' THEN 1 END) as maintenance_machines,
        COUNT(CASE WHEN m.status = 'inactive' THEN 1 END) as inactive_machines,
        COUNT(CASE WHEN m.status = 'retired' THEN 1 END) as retired_machines
      FROM machine_categories mc
      LEFT JOIN machines m ON mc.id = m.category_id AND m.is_active = true
      WHERE mc.is_active = true
      GROUP BY mc.id, mc.name, mc.color
      ORDER BY mc.name
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching category statistics:", error);
      return { success: false, error: error.message };
    }
  }
}
