import pool from "../../../db/pool.js";

export class SellerProductMarginModel {
  // Get all seller-specific margins (overrides)
  static async getAllSellerMargins(sellerId = null, productId = null, productActiveOnly = false) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      let sql = `
        SELECT 
          spm.*,
          sp.partner_name as seller_name,
          sp.partner_code as seller_code,
          p.name as product_name,
          p.name_alias as product_display_name,
          p.brand_name,
          p.grammage,
          pc.name as category_name,
          sc.name as subcategory_name
        FROM seller_product_margins spm
        JOIN sales_partners sp ON spm.seller_id = sp.id
        JOIN products p ON spm.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_subcategories sc ON p.subcategory_id = sc.id
        WHERE spm.is_active = 1
      `;

      const params = [];
      if (sellerId) {
        sql += " AND spm.seller_id = ?";
        params.push(sellerId);
      }
      if (productId) {
        sql += " AND spm.product_id = ?";
        params.push(productId);
      }
      if (productActiveOnly) {
        sql += " AND spm.product_active = 1";
      }

      sql += " ORDER BY sp.partner_name ASC, p.name ASC, spm.effective_from DESC";

      const [rows] = await pool.execute(sql, params);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching seller product margins:", error);
      return { success: false, error: error.message };
    }
  }

  // Get active seller margin for a product (most recent active override)
  static async getActiveSellerMargin(sellerId, productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT * FROM seller_product_margins 
         WHERE seller_id = ? AND product_id = ? 
         AND is_active = 1 
         AND (effective_to IS NULL OR effective_to >= CURDATE())
         ORDER BY effective_from DESC 
         LIMIT 1`,
        [sellerId, productId]
      );

      if (rows.length === 0) {
        return { success: false, error: "No active seller margin found" };
      }

      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching active seller margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Get effective margin for a product (seller override if exists, otherwise product defaults)
  static async getEffectiveMargin(sellerId, productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // First check for seller-specific override
      const sellerMarginResult = await this.getActiveSellerMargin(sellerId, productId);
      if (sellerMarginResult.success) {
        return {
          success: true,
          data: sellerMarginResult.data,
          source: "seller_override",
        };
      }

      // If no seller override, get product defaults (common margin from products table)
      const [products] = await pool.execute(
        `SELECT 
          id,
          cost_price,
          margin_percentage,
          mrp,
          seller_commission as seller_margin_value,
          landing_price,
          basic_price,
          gst_value,
          gst_percentage
         FROM products 
         WHERE id = ?`,
        [productId]
      );

      if (products.length > 0) {
        return {
          success: true,
          data: products[0],
          source: "product_default",
        };
      }

      return { success: false, error: "No margin found for this product" };
    } catch (error) {
      console.error("Error fetching effective margin:", error);
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
        `SELECT spm.*, sp.partner_name as seller_name, p.name as product_name, p.name_alias as product_display_name
         FROM seller_product_margins spm
         JOIN sales_partners sp ON spm.seller_id = sp.id
         JOIN products p ON spm.product_id = p.id
         WHERE spm.id = ?`,
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

  // Create new seller margin override
  static async createSellerMargin(marginData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        seller_id,
        product_id,
        cost_price,
        margin_percentage,
        mrp,
        seller_margin_value,
        landing_price,
        basic_price,
        gst_value,
        gst_percentage,
        effective_from,
        effective_to,
        is_active = 1,
        product_active = 1,
        notes,
        created_by,
      } = marginData;

      // If this is a new active margin, deactivate previous active margins for this seller-product combination
      if (is_active === 1) {
        await pool.execute(
          `UPDATE seller_product_margins 
           SET is_active = 0 
           WHERE seller_id = ? AND product_id = ? AND is_active = 1`,
          [seller_id, product_id]
        );
      }

      const [result] = await pool.execute(
        `INSERT INTO seller_product_margins 
         (seller_id, product_id, cost_price, margin_percentage, mrp, seller_margin_value, landing_price, 
          basic_price, gst_value, gst_percentage, effective_from, effective_to, is_active, product_active, notes, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          seller_id,
          product_id,
          cost_price !== undefined && cost_price !== null ? cost_price : null,
          margin_percentage || null,
          mrp || null,
          seller_margin_value || null,
          landing_price || null,
          basic_price || null,
          gst_value || null,
          gst_percentage || null,
          effective_from || new Date().toISOString().split("T")[0],
          effective_to || null,
          is_active,
          product_active,
          notes || null,
          created_by || null,
        ]
      );

      return { success: true, data: { id: result.insertId, ...marginData } };
    } catch (error) {
      console.error("Error creating seller margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Update seller margin
  static async updateSellerMargin(id, marginData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        seller_id,
        product_id,
        cost_price,
        margin_percentage,
        mrp,
        seller_margin_value,
        landing_price,
        basic_price,
        gst_value,
        gst_percentage,
        effective_from,
        effective_to,
        is_active,
        product_active,
        notes,
      } = marginData;

      // If activating this margin, deactivate other active margins for the same seller-product combination
      if (is_active === 1 && seller_id && product_id) {
        await pool.execute(
          `UPDATE seller_product_margins 
           SET is_active = 0 
           WHERE seller_id = ? AND product_id = ? AND is_active = 1 AND id != ?`,
          [seller_id, product_id, id]
        );
      }

      const [result] = await pool.execute(
        `UPDATE seller_product_margins 
         SET seller_id = ?, product_id = ?, cost_price = ?, margin_percentage = ?, mrp = ?, seller_margin_value = ?, 
             landing_price = ?, basic_price = ?, gst_value = ?, gst_percentage = ?, 
             effective_from = ?, effective_to = ?, is_active = ?, product_active = ?, notes = ?, updated_at = NOW() 
         WHERE id = ?`,
        [
          seller_id,
          product_id,
          cost_price !== undefined && cost_price !== null ? cost_price : null,
          margin_percentage || null,
          mrp || null,
          seller_margin_value || null,
          landing_price || null,
          basic_price || null,
          gst_value || null,
          gst_percentage || null,
          effective_from,
          effective_to || null,
          is_active,
          product_active !== undefined ? product_active : 1,
          notes || null,
          id,
        ]
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Margin not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating seller margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete seller margin
  static async deleteSellerMargin(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute("DELETE FROM seller_product_margins WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Margin not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting seller margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Get margin history for a seller-product combination
  static async getMarginHistory(sellerId, productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT * FROM seller_product_margins 
         WHERE seller_id = ? AND product_id = ? 
         ORDER BY effective_from DESC, created_at DESC`,
        [sellerId, productId]
      );

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching margin history:", error);
      return { success: false, error: error.message };
    }
  }

  // Toggle product_active status for a seller margin
  static async toggleProductActive(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // First get current status
      const [rows] = await pool.execute(
        `SELECT product_active FROM seller_product_margins WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return { success: false, error: "Margin not found" };
      }

      const newStatus = rows[0].product_active === 1 ? 0 : 1;

      // Update the status
      const [result] = await pool.execute(
        `UPDATE seller_product_margins 
         SET product_active = ?, updated_at = NOW() 
         WHERE id = ?`,
        [newStatus, id]
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Failed to update product active status" };
      }

      return { success: true, data: { product_active: newStatus } };
    } catch (error) {
      console.error("Error toggling product active status:", error);
      return { success: false, error: error.message };
    }
  }
}

