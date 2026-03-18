import pool from "../../../db/pool.js";

class POVendorModel {
  // Get all vendors with filters
  static async getAllVendors(filters = {}) {
    try {
      let query = `
        SELECT 
          v.*,
          COUNT(DISTINCT po.id) as total_pos,
          SUM(CASE WHEN po.status = 'received' THEN po.total_amount ELSE 0 END) as total_purchase_value
        FROM po_vendors v
        LEFT JOIN purchase_orders po ON v.id = po.vendor_id
        WHERE 1=1
      `;

      const params = [];

      if (filters.search) {
        query += ` AND (v.name LIKE ? OR v.gstin LIKE ? OR v.contact_person_name LIKE ?)`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (filters.status) {
        query += ` AND v.status = ?`;
        params.push(filters.status);
      }

      query += ` GROUP BY v.id ORDER BY v.created_at DESC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching vendors:", error);
      return { success: false, error: error.message };
    }
  }

  // Get vendor by ID with full details
  static async getVendorById(id) {
    try {
      const [vendors] = await pool.execute(`SELECT * FROM po_vendors WHERE id = ?`, [id]);

      if (vendors.length === 0) {
        return { success: false, error: "Vendor not found" };
      }

      const vendor = vendors[0];

      // Get documents
      const [documents] = await pool.execute(`SELECT * FROM po_vendor_documents WHERE vendor_id = ? ORDER BY created_at DESC`, [id]);

      // Get recent POs
      const [recentPOs] = await pool.execute(`SELECT * FROM purchase_orders WHERE vendor_id = ? ORDER BY po_date DESC LIMIT 10`, [id]);

      // Get statistics
      const [stats] = await pool.execute(
        `SELECT 
          COUNT(*) as total_pos,
          SUM(total_amount) as total_purchase_value,
          AVG(DATEDIFF(actual_delivery_date, expected_delivery_date)) as avg_delivery_delay,
          SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as pending_payment
        FROM purchase_orders 
        WHERE vendor_id = ?`,
        [id],
      );

      return {
        success: true,
        data: {
          ...vendor,
          documents,
          recent_pos: recentPOs,
          statistics: stats[0] || {},
        },
      };
    } catch (error) {
      console.error("Error fetching vendor details:", error);
      return { success: false, error: error.message };
    }
  }

  // Create vendor
  static async createVendor(vendorData) {
    try {
      // Handle undefined values by converting them to null
      const { name, gstin = null, address = null, city = null, state = null, pincode = null, country = "India", contact_person_name, contact_person_phone, contact_person_email = null, secondary_contact_name = null, secondary_contact_phone = null, secondary_contact_email = null, preferred_shipping_provider = null, payment_terms = null, rating = 0, notes = null, status = "active", created_by } = vendorData;

      const [result] = await pool.execute(
        `INSERT INTO po_vendors 
        (name, gstin, address, city, state, pincode, country, 
         contact_person_name, contact_person_phone, contact_person_email,
         secondary_contact_name, secondary_contact_phone, secondary_contact_email,
         preferred_shipping_provider, payment_terms, rating, notes, status, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, gstin, address, city, state, pincode, country, contact_person_name, contact_person_phone, contact_person_email, secondary_contact_name, secondary_contact_phone, secondary_contact_email, preferred_shipping_provider, payment_terms, rating, notes, status, created_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error creating vendor:", error);
      return { success: false, error: error.message };
    }
  }

  // Update vendor
  static async updateVendor(id, vendorData) {
    try {
      // Handle undefined values by converting them to null
      const { name, gstin = null, address = null, city = null, state = null, pincode = null, country = "India", contact_person_name, contact_person_phone, contact_person_email = null, secondary_contact_name = null, secondary_contact_phone = null, secondary_contact_email = null, preferred_shipping_provider = null, payment_terms = null, rating = 0, notes = null, status = "active", updated_by } = vendorData;

      await pool.execute(
        `UPDATE po_vendors 
        SET name = ?, gstin = ?, address = ?, city = ?, state = ?, pincode = ?, country = ?,
            contact_person_name = ?, contact_person_phone = ?, contact_person_email = ?,
            secondary_contact_name = ?, secondary_contact_phone = ?, secondary_contact_email = ?,
            preferred_shipping_provider = ?, payment_terms = ?, rating = ?, notes = ?, 
            status = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
        [name, gstin, address, city, state, pincode, country, contact_person_name, contact_person_phone, contact_person_email, secondary_contact_name, secondary_contact_phone, secondary_contact_email, preferred_shipping_provider, payment_terms, rating, notes, status, updated_by, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating vendor:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete vendor
  static async deleteVendor(id) {
    try {
      const [result] = await pool.execute(`DELETE FROM po_vendors WHERE id = ?`, [id]);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting vendor:", error);
      return { success: false, error: error.message };
    }
  }

  // Add vendor document
  static async addDocument(documentData) {
    try {
      const { vendor_id, document_type, document_name, document_url, expiry_date, notes, uploaded_by } = documentData;

      const [result] = await pool.execute(
        `INSERT INTO po_vendor_documents 
        (vendor_id, document_type, document_name, document_url, expiry_date, notes, uploaded_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [vendor_id, document_type, document_name, document_url, expiry_date, notes, uploaded_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error adding vendor document:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete vendor document
  static async deleteDocument(id) {
    try {
      const [result] = await pool.execute(`DELETE FROM po_vendor_documents WHERE id = ?`, [id]);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting vendor document:", error);
      return { success: false, error: error.message };
    }
  }

  // Get vendor performance metrics
  static async getVendorPerformance(vendorId) {
    try {
      const [metrics] = await pool.execute(
        `SELECT 
          COUNT(*) as total_orders,
          AVG(total_amount) as avg_order_value,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          AVG(DATEDIFF(actual_delivery_date, expected_delivery_date)) as avg_delay_days,
          SUM(CASE WHEN actual_delivery_date <= expected_delivery_date THEN 1 ELSE 0 END) / COUNT(*) * 100 as on_time_delivery_percentage
        FROM purchase_orders 
        WHERE vendor_id = ? AND status IN ('received', 'closed')`,
        [vendorId],
      );

      return { success: true, data: metrics[0] || {} };
    } catch (error) {
      console.error("Error fetching vendor performance:", error);
      return { success: false, error: error.message };
    }
  }
}

export default POVendorModel;
