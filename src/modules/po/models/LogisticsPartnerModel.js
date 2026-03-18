import pool from "../../../db/pool.js";

export default class LogisticsPartnerModel {
  // Get all logistics partners
  static async getAllLogisticsPartners() {
    try {
      const [partners] = await pool.execute(
        `SELECT * FROM logistics_partners 
         WHERE is_active = TRUE 
         ORDER BY company_name ASC`,
      );
      return { success: true, data: partners };
    } catch (error) {
      console.error("Error fetching logistics partners:", error);
      return { success: false, error: error.message };
    }
  }

  // Get logistics partner by ID
  static async getLogisticsPartnerById(id) {
    try {
      const [partners] = await pool.execute(`SELECT * FROM logistics_partners WHERE id = ?`, [id]);

      if (partners.length === 0) {
        return { success: false, error: "Logistics partner not found" };
      }

      return { success: true, data: partners[0] };
    } catch (error) {
      console.error("Error fetching logistics partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new logistics partner
  static async createLogisticsPartner(partnerData) {
    try {
      const { company_name, contact_person, phone, email, address, city, state, pincode, gstin, service_type, delivery_areas, pricing_model, base_rate, currency, payment_terms, tracking_url, notes, created_by } = partnerData;

      const [result] = await pool.execute(
        `INSERT INTO logistics_partners 
        (company_name, contact_person, phone, email, address, city, state, pincode, gstin, 
         service_type, delivery_areas, pricing_model, base_rate, currency, payment_terms, 
         tracking_url, notes, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [company_name, contact_person || null, phone || null, email || null, address || null, city || null, state || null, pincode || null, gstin || null, service_type || "domestic", delivery_areas || null, pricing_model || "per_kg", base_rate || null, currency || "INR", payment_terms || null, tracking_url || null, notes || null, created_by || null],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error creating logistics partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Update logistics partner
  static async updateLogisticsPartner(id, partnerData) {
    try {
      const { company_name, contact_person, phone, email, address, city, state, pincode, gstin, service_type, delivery_areas, pricing_model, base_rate, currency, payment_terms, tracking_url, is_active, notes } = partnerData;

      const [result] = await pool.execute(
        `UPDATE logistics_partners 
        SET company_name = ?, contact_person = ?, phone = ?, email = ?, address = ?, 
            city = ?, state = ?, pincode = ?, gstin = ?, service_type = ?, 
            delivery_areas = ?, pricing_model = ?, base_rate = ?, currency = ?, 
            payment_terms = ?, tracking_url = ?, is_active = ?, notes = ?, 
            updated_at = NOW()
        WHERE id = ?`,
        [company_name, contact_person || null, phone || null, email || null, address || null, city || null, state || null, pincode || null, gstin || null, service_type || "domestic", delivery_areas || null, pricing_model || "per_kg", base_rate || null, currency || "INR", payment_terms || null, tracking_url || null, is_active !== undefined ? is_active : true, notes || null, id],
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Logistics partner not found" };
      }

      return { success: true, data: { id } };
    } catch (error) {
      console.error("Error updating logistics partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete logistics partner (soft delete by setting is_active to false)
  static async deleteLogisticsPartner(id) {
    try {
      const [result] = await pool.execute(`UPDATE logistics_partners SET is_active = FALSE, updated_at = NOW() WHERE id = ?`, [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Logistics partner not found" };
      }

      return { success: true, data: { id } };
    } catch (error) {
      console.error("Error deleting logistics partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Get logistics partners for dropdown (simplified data)
  static async getLogisticsPartnersForDropdown() {
    try {
      const [partners] = await pool.execute(
        `SELECT id, company_name, service_type, base_rate, currency 
         FROM logistics_partners 
         WHERE is_active = TRUE 
         ORDER BY company_name ASC`,
      );
      return { success: true, data: partners };
    } catch (error) {
      console.error("Error fetching logistics partners for dropdown:", error);
      return { success: false, error: error.message };
    }
  }

  // Get logistics partners statistics
  static async getLogisticsPartnerStats() {
    try {
      const [stats] = await pool.execute(
        `SELECT 
           COUNT(*) as total_partners,
           COUNT(CASE WHEN service_type = 'domestic' THEN 1 END) as domestic_partners,
           COUNT(CASE WHEN service_type = 'international' THEN 1 END) as international_partners,
           COUNT(CASE WHEN service_type = 'both' THEN 1 END) as both_service_partners
         FROM logistics_partners 
         WHERE is_active = TRUE`,
      );
      return { success: true, data: stats[0] };
    } catch (error) {
      console.error("Error fetching logistics partner stats:", error);
      return { success: false, error: error.message };
    }
  }
}
