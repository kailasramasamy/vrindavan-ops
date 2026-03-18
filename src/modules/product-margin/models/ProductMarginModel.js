import pool from "../../../db/pool.js";

export class ProductMarginModel {
  // Get all product margins (common margins - master data)
  static async getAllMargins(productId = null) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      let sql = `
        SELECT 
          pm.*,
          p.name as product_name,
          p.name_alias as product_display_name,
          p.brand_name,
          p.grammage,
          pc.name as category_name,
          sc.name as subcategory_name
        FROM product_margins pm
        JOIN products p ON pm.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_subcategories sc ON p.subcategory_id = sc.id
        WHERE pm.is_active = 1
      `;

      const params = [];
      if (productId) {
        sql += " AND pm.product_id = ?";
        params.push(productId);
      }

      sql += " ORDER BY p.name ASC, pm.effective_from DESC";

      const [rows] = await pool.execute(sql, params);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching product margins:", error);
      return { success: false, error: error.message };
    }
  }

  // Get active margin for a product (most recent active margin)
  static async getActiveMarginForProduct(productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT * FROM product_margins 
         WHERE product_id = ? 
         AND is_active = 1 
         AND (effective_to IS NULL OR effective_to >= CURDATE())
         ORDER BY effective_from DESC 
         LIMIT 1`,
        [productId]
      );

      if (rows.length === 0) {
        return { success: false, error: "No active margin found for this product" };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching active margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Get margin by ID
  static async getMarginById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT pm.*, p.name as product_name, p.name_alias as product_display_name
         FROM product_margins pm
         JOIN products p ON pm.product_id = p.id
         WHERE pm.id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return { success: false, error: "Margin not found" };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new margin
  static async createMargin(marginData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { product_id, margin_percentage, effective_from, effective_to, is_active = 1, notes, created_by } =
        marginData;

      // If this is a new active margin, deactivate previous active margins for this product
      if (is_active === 1) {
        await pool.execute(
          `UPDATE product_margins 
           SET is_active = 0 
           WHERE product_id = ? AND is_active = 1`,
          [product_id]
        );
      }

      const [result] = await pool.execute(
        `INSERT INTO product_margins 
         (product_id, margin_percentage, effective_from, effective_to, is_active, notes, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product_id, margin_percentage, effective_from || new Date().toISOString().split("T")[0], effective_to || null, is_active, notes || null, created_by || null]
      );

      return { success: true, data: { id: result.insertId, ...marginData } };
    } catch (error) {
      console.error("Error creating margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Update margin
  static async updateMargin(id, marginData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { product_id, margin_percentage, effective_from, effective_to, is_active, notes } = marginData;

      // If activating this margin, deactivate other active margins for the same product
      if (is_active === 1 && product_id) {
        await pool.execute(
          `UPDATE product_margins 
           SET is_active = 0 
           WHERE product_id = ? AND is_active = 1 AND id != ?`,
          [product_id, id]
        );
      }

      const [result] = await pool.execute(
        `UPDATE product_margins 
         SET product_id = ?, margin_percentage = ?, effective_from = ?, 
             effective_to = ?, is_active = ?, notes = ?, updated_at = NOW() 
         WHERE id = ?`,
        [product_id, margin_percentage, effective_from, effective_to || null, is_active, notes || null, id]
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Margin not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete margin
  static async deleteMargin(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute("DELETE FROM product_margins WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Margin not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Get margin history for a product
  static async getMarginHistory(productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT * FROM product_margins 
         WHERE product_id = ? 
         ORDER BY effective_from DESC, created_at DESC`,
        [productId]
      );

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching margin history:", error);
      return { success: false, error: error.message };
    }
  }
}


