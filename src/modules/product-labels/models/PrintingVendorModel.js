import { opsPool } from "../../../db/pool.js";

export class PrintingVendorModel {
  static async listVendors({ limit = 100, offset = 0, search = "", active = null } = {}) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      let query = "SELECT * FROM printing_vendors WHERE 1=1";
      const params = [];

      if (search) {
        query += " AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?)";
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (active !== null) {
        query += " AND active = ?";
        params.push(active ? 1 : 0);
      }

      query += " ORDER BY name ASC LIMIT ? OFFSET ?";
      params.push(Number(limit), Number(offset));

      const [vendors] = await opsPool.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) as total FROM printing_vendors WHERE 1=1";
      const countParams = [];

      if (search) {
        countQuery += " AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?)";
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (active !== null) {
        countQuery += " AND active = ?";
        countParams.push(active ? 1 : 0);
      }

      const [countResult] = await opsPool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      return { success: true, vendors, total };
    } catch (error) {
      console.error("PrintingVendorModel.listVendors error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getVendorById(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await opsPool.query("SELECT * FROM printing_vendors WHERE id = ?", [id]);
      if (rows.length === 0) {
        return { success: false, error: "Vendor not found" };
      }

      return { success: true, vendor: rows[0] };
    } catch (error) {
      console.error("PrintingVendorModel.getVendorById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createVendor(vendorData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        pincode,
        gst_number,
        notes,
        active = 1,
      } = vendorData;

      const [result] = await opsPool.query(
        `INSERT INTO printing_vendors 
        (name, contact_person, email, phone, address, city, state, pincode, gst_number, notes, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, contact_person || null, email || null, phone || null, address || null, city || null, state || null, pincode || null, gst_number || null, notes || null, active]
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("PrintingVendorModel.createVendor error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateVendor(id, vendorData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        name,
        contact_person,
        email,
        phone,
        address,
        city,
        state,
        pincode,
        gst_number,
        notes,
        active,
      } = vendorData;

      const fields = [];
      const values = [];

      if (name !== undefined) {
        fields.push("name = ?");
        values.push(name);
      }
      if (contact_person !== undefined) {
        fields.push("contact_person = ?");
        values.push(contact_person);
      }
      if (email !== undefined) {
        fields.push("email = ?");
        values.push(email);
      }
      if (phone !== undefined) {
        fields.push("phone = ?");
        values.push(phone);
      }
      if (address !== undefined) {
        fields.push("address = ?");
        values.push(address);
      }
      if (city !== undefined) {
        fields.push("city = ?");
        values.push(city);
      }
      if (state !== undefined) {
        fields.push("state = ?");
        values.push(state);
      }
      if (pincode !== undefined) {
        fields.push("pincode = ?");
        values.push(pincode);
      }
      if (gst_number !== undefined) {
        fields.push("gst_number = ?");
        values.push(gst_number);
      }
      if (notes !== undefined) {
        fields.push("notes = ?");
        values.push(notes);
      }
      if (active !== undefined) {
        fields.push("active = ?");
        values.push(active ? 1 : 0);
      }

      if (fields.length === 0) {
        return { success: false, error: "No fields to update" };
      }

      values.push(id);

      const [result] = await opsPool.query(
        `UPDATE printing_vendors SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Vendor not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("PrintingVendorModel.updateVendor error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteVendor(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await opsPool.query("DELETE FROM printing_vendors WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Vendor not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("PrintingVendorModel.deleteVendor error:", error);
      return { success: false, error: error.message };
    }
  }
}


