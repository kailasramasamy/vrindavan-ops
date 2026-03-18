import pool from "../../../db/pool.js";

export default class CategoryModel {
  // Get all categories
  static async getAllCategories() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(`
        SELECT 
          c.*,
          COUNT(p.id) as product_count,
          0 as total_value
        FROM po_product_categories c
        LEFT JOIN po_procurement_items p ON c.id = p.category_id AND p.status = 'active'
        GROUP BY c.id, c.name, c.description, c.is_active, c.created_at, c.updated_at
        ORDER BY c.name ASC
      `);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching categories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category by ID
  static async getCategoryById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute("SELECT * FROM po_product_categories WHERE id = ?", [id]);

      if (rows.length === 0) {
        return { success: false, error: "Category not found" };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching category:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new category
  static async createCategory(categoryData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { name, description, is_active = 1 } = categoryData;

      const [result] = await pool.execute("INSERT INTO po_product_categories (name, description, is_active) VALUES (?, ?, ?)", [name, description, is_active]);

      return { success: true, data: { id: result.insertId, ...categoryData } };
    } catch (error) {
      console.error("Error creating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Update category
  static async updateCategory(id, categoryData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { name, description, is_active } = categoryData;

      const [result] = await pool.execute("UPDATE po_product_categories SET name = ?, description = ?, is_active = ?, updated_at = NOW() WHERE id = ?", [name, description, is_active, id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Category not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating category:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete category
  static async deleteCategory(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Check if category is being used by any products
      const [products] = await pool.execute("SELECT COUNT(*) as count FROM po_procurement_items WHERE category_id = ?", [id]);

      if (products[0].count > 0) {
        return {
          success: false,
          error: "Cannot delete category. It is being used by existing products.",
        };
      }

      const [result] = await pool.execute("DELETE FROM po_product_categories WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Category not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting category:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category statistics
  static async getCategoryStats() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [stats] = await pool.execute(`
        SELECT 
          c.id,
          c.name,
          c.is_active,
          COUNT(p.id) as product_count,
          0 as total_value
        FROM po_product_categories c
        LEFT JOIN po_procurement_items p ON c.id = p.category_id AND p.status = 'active'
        GROUP BY c.id, c.name, c.is_active
        ORDER BY c.name
      `);

      return { success: true, data: stats };
    } catch (error) {
      console.error("Error fetching category stats:", error);
      return { success: false, error: error.message };
    }
  }
}
