import pool from "../../../db/pool.js";

export class SalesPartnerModel {
  // Get all sales partners
  static async getAllPartners(includeInactive = false) {
    try {
      let sql = `
        SELECT 
          sp.*,
          COUNT(DISTINCT spp.product_id) as product_count
        FROM sales_partners sp
        LEFT JOIN sales_partner_products spp ON sp.id = spp.partner_id AND spp.is_active = 1
      `;

      if (!includeInactive) {
        sql += ` WHERE sp.is_active = 1`;
      }

      sql += `
        GROUP BY sp.id
        ORDER BY sp.partner_name ASC
      `;

      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales partners:", error);
      return { success: false, error: error.message };
    }
  }

  // Get partner by ID
  static async getPartnerById(id) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM sales_partners WHERE id = ?`, [id]);
      return { success: true, rows: rows[0] };
    } catch (error) {
      console.error("Error fetching partner by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Get partner by code
  static async getPartnerByCode(code) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM sales_partners WHERE partner_code = ?`, [code]);
      return { success: true, rows: rows[0] };
    } catch (error) {
      console.error("Error fetching partner by code:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new partner
  static async createPartner(data) {
    try {
      const { partner_name, partner_code, contact_person, contact_email, contact_phone, address, is_active = 1, notes } = data;

      const [result] = await pool.execute(
        `INSERT INTO sales_partners 
        (partner_name, partner_code, contact_person, contact_email, contact_phone, address, is_active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [partner_name, partner_code, contact_person || null, contact_email || null, contact_phone || null, address || null, is_active, notes || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Update partner
  static async updatePartner(id, data) {
    try {
      const { partner_name, partner_code, contact_person, contact_email, contact_phone, address, is_active, notes } = data;

      await pool.execute(
        `UPDATE sales_partners 
        SET partner_name = ?, partner_code = ?, contact_person = ?, contact_email = ?, 
            contact_phone = ?, address = ?, is_active = ?, notes = ?
        WHERE id = ?`,
        [partner_name, partner_code, contact_person || null, contact_email || null, contact_phone || null, address || null, is_active, notes || null, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete partner
  static async deletePartner(id) {
    try {
      await pool.execute(`DELETE FROM sales_partners WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Get partner products
  static async getPartnerProducts(partnerId) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          spp.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name
        FROM sales_partner_products spp
        JOIN products p ON spp.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE spp.partner_id = ? AND spp.is_active = 1
        ORDER BY p.name ASC`,
        [partnerId],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching partner products:", error);
      return { success: false, error: error.message };
    }
  }

  // Add product to partner
  static async addPartnerProduct(partnerId, productId) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO sales_partner_products (partner_id, product_id, is_active)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE is_active = 1`,
        [partnerId, productId],
      );
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error adding partner product:", error);
      return { success: false, error: error.message };
    }
  }

  // Remove product from partner
  static async removePartnerProduct(partnerId, productId) {
    try {
      await pool.execute(
        `UPDATE sales_partner_products 
        SET is_active = 0 
        WHERE partner_id = ? AND product_id = ?`,
        [partnerId, productId],
      );
      return { success: true };
    } catch (error) {
      console.error("Error removing partner product:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk update partner products
  static async updatePartnerProducts(partnerId, productIds) {
    try {
      // First, deactivate all existing products
      await pool.execute(`UPDATE sales_partner_products SET is_active = 0 WHERE partner_id = ?`, [partnerId]);

      // Then, add/activate selected products
      if (productIds && productIds.length > 0) {
        const values = productIds.map((productId) => `(${partnerId}, ${productId}, 1)`).join(",");
        await pool.execute(
          `INSERT INTO sales_partner_products (partner_id, product_id, is_active)
          VALUES ${values}
          ON DUPLICATE KEY UPDATE is_active = 1`,
        );
      }

      return { success: true };
    } catch (error) {
      console.error("Error updating partner products:", error);
      return { success: false, error: error.message };
    }
  }
}
