import pool from "../../../db/pool.js";
import { stageCopyPool } from "../../../db/pool.js";

export class ProductCategoryModel {
  // Get all categories
  static async getAllCategories() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(`
        SELECT 
          c.*,
          COUNT(DISTINCT sc.id) as subcategory_count,
          COUNT(DISTINCT p.id) as product_count
        FROM product_categories c
        LEFT JOIN product_subcategories sc ON c.id = sc.category_id
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id
        ORDER BY c.name ASC
      `);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching product categories:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category by ID
  static async getCategoryById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute("SELECT * FROM product_categories WHERE id = ?", [id]);

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

      const { name, description } = categoryData;

      const [result] = await pool.execute(
        "INSERT INTO product_categories (name, description) VALUES (?, ?)",
        [name, description || null]
      );

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

      const { name, description } = categoryData;

      const [result] = await pool.execute(
        "UPDATE product_categories SET name = ?, description = ?, updated_at = NOW() WHERE id = ?",
        [name, description || null, id]
      );

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
      const [products] = await pool.execute("SELECT COUNT(*) as count FROM products WHERE category_id = ?", [id]);

      if (products[0].count > 0) {
        return {
          success: false,
          error: "Cannot delete category. It is being used by existing products.",
        };
      }

      // Check if category has subcategories
      const [subcategories] = await pool.execute(
        "SELECT COUNT(*) as count FROM product_subcategories WHERE category_id = ?",
        [id]
      );

      if (subcategories[0].count > 0) {
        return {
          success: false,
          error: "Cannot delete category. It has subcategories. Please delete subcategories first.",
        };
      }

      const [result] = await pool.execute("DELETE FROM product_categories WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Category not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting category:", error);
      return { success: false, error: error.message };
    }
  }

  // Sync categories from APP_DB.categories
  static async syncCategories() {
    try {
      if (!pool) {
        return { success: false, error: "Operations database connection not available" };
      }
      if (!stageCopyPool) {
        return { success: false, error: "Stage copy database connection not available" };
      }

      // Fetch categories from stage copy database
      const [sourceCategories] = await stageCopyPool.execute(
        "SELECT id, name, description, created_at, updated_at FROM categories ORDER BY id"
      );

      if (!sourceCategories || sourceCategories.length === 0) {
        return { success: true, summary: { total: 0, created: 0, updated: 0, skipped: 0 } };
      }

      // Get existing categories from ops database
      const [existingCategories] = await pool.execute("SELECT id, name FROM product_categories");
      const existingMap = new Map(existingCategories.map(c => [c.id, c.name]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Process each category
      for (const sourceCat of sourceCategories) {
        const existingCategory = existingMap.get(sourceCat.id);
        
        if (existingCategory) {
          // Update if name changed
          if (existingCategory !== sourceCat.name) {
            await pool.execute(
              "UPDATE product_categories SET name = ?, description = ?, updated_at = ? WHERE id = ?",
              [sourceCat.name, sourceCat.description || null, sourceCat.updated_at || new Date(), sourceCat.id]
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Insert new category
          await pool.execute(
            "INSERT INTO product_categories (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            [
              sourceCat.id,
              sourceCat.name,
              sourceCat.description || null,
              sourceCat.created_at || new Date(),
              sourceCat.updated_at || new Date()
            ]
          );
          created++;
        }
      }

      return {
        success: true,
        summary: {
          total: sourceCategories.length,
          created,
          updated,
          skipped
        }
      };
    } catch (error) {
      console.error("Error syncing categories:", error);
      return { success: false, error: error.message };
    }
  }
}


