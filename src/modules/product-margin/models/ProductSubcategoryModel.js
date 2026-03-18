import pool from "../../../db/pool.js";
import { stageCopyPool } from "../../../db/pool.js";

export class ProductSubcategoryModel {
  // Get all subcategories (optionally filtered by category)
  static async getAllSubcategories(categoryId = null) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      let sql = `
        SELECT 
          sc.*,
          c.name as category_name,
          COUNT(DISTINCT p.id) as product_count
        FROM product_subcategories sc
        LEFT JOIN product_categories c ON sc.category_id = c.id
        LEFT JOIN products p ON sc.id = p.subcategory_id
      `;

      const params = [];
      if (categoryId) {
        sql += " WHERE sc.category_id = ?";
        params.push(categoryId);
      }

      sql += " GROUP BY sc.id ORDER BY c.name ASC, sc.name ASC";

      const [rows] = await pool.execute(sql, params);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get subcategory by ID
  static async getSubcategoryById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT sc.*, c.name as category_name 
         FROM product_subcategories sc
         LEFT JOIN product_categories c ON sc.category_id = c.id
         WHERE sc.id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return { success: false, error: "Subcategory not found" };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching subcategory:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new subcategory
  static async createSubcategory(subcategoryData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { category_id, name, description } = subcategoryData;

      const [result] = await pool.execute(
        "INSERT INTO product_subcategories (category_id, name, description) VALUES (?, ?, ?)",
        [category_id, name, description || null]
      );

      return { success: true, data: { id: result.insertId, ...subcategoryData } };
    } catch (error) {
      console.error("Error creating subcategory:", error);
      return { success: false, error: error.message };
    }
  }

  // Update subcategory
  static async updateSubcategory(id, subcategoryData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { category_id, name, description } = subcategoryData;

      const [result] = await pool.execute(
        "UPDATE product_subcategories SET category_id = ?, name = ?, description = ?, updated_at = NOW() WHERE id = ?",
        [category_id, name, description || null, id]
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Subcategory not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating subcategory:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete subcategory
  static async deleteSubcategory(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Check if subcategory is being used by any products
      const [products] = await pool.execute(
        "SELECT COUNT(*) as count FROM products WHERE subcategory_id = ?",
        [id]
      );

      if (products[0].count > 0) {
        return {
          success: false,
          error: "Cannot delete subcategory. It is being used by existing products.",
        };
      }

      const [result] = await pool.execute("DELETE FROM product_subcategories WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Subcategory not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting subcategory:", error);
      return { success: false, error: error.message };
    }
  }

  // Sync subcategories from APP_DB.sub_categories
  static async syncSubcategories() {
    try {
      if (!pool) {
        return { success: false, error: "Operations database connection not available" };
      }
      if (!stageCopyPool) {
        return { success: false, error: "Stage copy database connection not available" };
      }

      // Fetch subcategories from stage copy database
      const [sourceSubcategories] = await stageCopyPool.execute(
        "SELECT id, category_id, name, description, created_at, updated_at FROM sub_categories ORDER BY id"
      );

      if (!sourceSubcategories || sourceSubcategories.length === 0) {
        return { success: true, summary: { total: 0, created: 0, updated: 0, skipped: 0 } };
      }

      // Get existing subcategories from ops database
      const [existingSubcategories] = await pool.execute("SELECT id, name, category_id FROM product_subcategories");
      const existingMap = new Map(existingSubcategories.map(sc => [sc.id, { name: sc.name, category_id: sc.category_id }]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Process each subcategory
      for (const sourceSubcat of sourceSubcategories) {
        const existingSubcat = existingMap.get(sourceSubcat.id);
        
        if (existingSubcat) {
          // Update if name or category_id changed
          if (existingSubcat.name !== sourceSubcat.name || existingSubcat.category_id !== sourceSubcat.category_id) {
            await pool.execute(
              "UPDATE product_subcategories SET category_id = ?, name = ?, description = ?, updated_at = ? WHERE id = ?",
              [
                sourceSubcat.category_id,
                sourceSubcat.name,
                sourceSubcat.description || null,
                sourceSubcat.updated_at || new Date(),
                sourceSubcat.id
              ]
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new subcategory
          await pool.execute(
            "INSERT INTO product_subcategories (id, category_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              sourceSubcat.id,
              sourceSubcat.category_id,
              sourceSubcat.name,
              sourceSubcat.description || null,
              sourceSubcat.created_at || new Date(),
              sourceSubcat.updated_at || new Date()
            ]
          );
          created++;
        }
      }

      return {
        success: true,
        summary: {
          total: sourceSubcategories.length,
          created,
          updated,
          skipped
        }
      };
    } catch (error) {
      console.error("Error syncing subcategories:", error);
      return { success: false, error: error.message };
    }
  }
}


