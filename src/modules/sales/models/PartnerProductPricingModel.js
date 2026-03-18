import pool from "../../../db/pool.js";

export class PartnerProductPricingModel {
  // Get all pricing for a partner
  static async getPricingByPartner(partnerId) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          ppp.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name
        FROM partner_product_pricing ppp
        JOIN products p ON ppp.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE ppp.partner_id = ?
        ORDER BY p.name ASC`,
        [partnerId]
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching partner product pricing:", error);
      return { success: false, error: error.message };
    }
  }

  // Get pricing for a specific partner-product combination
  static async getPricing(partnerId, productId) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM partner_product_pricing 
        WHERE partner_id = ? AND product_id = ?`,
        [partnerId, productId]
      );
      return { success: true, row: rows[0] || null };
    } catch (error) {
      console.error("Error fetching pricing:", error);
      return { success: false, error: error.message };
    }
  }

  // Get pricing by ID
  static async getPricingById(id) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          ppp.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          pc.name as category_name
        FROM partner_product_pricing ppp
        JOIN products p ON ppp.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE ppp.id = ?`,
        [id]
      );
      return { success: true, row: rows[0] || null };
    } catch (error) {
      console.error("Error fetching pricing by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Create or update pricing
  static async savePricing(data) {
    try {
      const { partner_id, product_id, basic_price, gst_percentage, gst_amount, landing_price, basic_cost } = data;

      // Calculate values if not provided
      let calculatedGstAmount = gst_amount;
      let calculatedBasicCost = basic_cost || basic_price;

      // If basic_price (unit_price) and gst_percentage provided, calculate GST amount
      if (basic_price && gst_percentage !== null && gst_percentage !== undefined && gst_percentage > 0) {
        calculatedGstAmount = (basic_price * gst_percentage) / 100;
      } else {
        calculatedGstAmount = 0; // Default to 0 if no GST
      }

      // Basic cost is same as unit price (basic_price)
      if (basic_price) {
        calculatedBasicCost = basic_price;
      }

      // Calculate landing price for storage (unit_price + GST_amount)
      // If no GST, landing price is same as basic price
      const calculatedLandingPrice = parseFloat(basic_price) + parseFloat(calculatedGstAmount || 0);

      // Check if pricing already exists
      const existing = await this.getPricing(partner_id, product_id);
      
      if (existing.row) {
        // Update existing pricing
        await pool.execute(
          `UPDATE partner_product_pricing 
          SET basic_price = ?, 
              gst_percentage = ?, 
              gst_amount = ?, 
              landing_price = ?, 
              basic_cost = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE partner_id = ? AND product_id = ?`,
          [
            basic_price,
            gst_percentage || 0,
            calculatedGstAmount || 0,
            calculatedLandingPrice,
            calculatedBasicCost,
            partner_id,
            product_id
          ]
        );
        return { success: true, id: existing.row.id, isUpdate: true };
      } else {
        // Create new pricing
        const [result] = await pool.execute(
          `INSERT INTO partner_product_pricing 
          (partner_id, product_id, basic_price, gst_percentage, gst_amount, landing_price, basic_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            partner_id,
            product_id,
            basic_price,
            gst_percentage || 0,
            calculatedGstAmount || 0,
            calculatedLandingPrice,
            calculatedBasicCost
          ]
        );
        return { success: true, id: result.insertId, isUpdate: false };
      }
    } catch (error) {
      console.error("Error saving pricing:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete pricing
  static async deletePricing(id) {
    try {
      await pool.execute(`DELETE FROM partner_product_pricing WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting pricing:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete pricing by partner and product
  static async deletePricingByPartnerProduct(partnerId, productId) {
    try {
      await pool.execute(
        `DELETE FROM partner_product_pricing 
        WHERE partner_id = ? AND product_id = ?`,
        [partnerId, productId]
      );
      return { success: true };
    } catch (error) {
      console.error("Error deleting pricing:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all pricing across all partners
  static async getAllPricing() {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          ppp.*,
          sp.partner_name,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          pc.name as category_name
        FROM partner_product_pricing ppp
        JOIN sales_partners sp ON ppp.partner_id = sp.id
        JOIN products p ON ppp.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        ORDER BY sp.partner_name, p.name ASC`
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching all pricing:", error);
      return { success: false, error: error.message };
    }
  }
}

