import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class RentalPropertyModel {
  static get db() {
    return opsDb;
  }

  static async listProperties({ limit = 100, offset = 0, search = "", propertyType = null, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(property_name LIKE ? OR property_location LIKE ? OR owner_name LIKE ?)");
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (propertyType) {
      conditions.push("property_type = ?");
      params.push(propertyType);
    }

    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 500) : 100;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;

    try {
      const [rows] = await db.query(
        `SELECT * FROM rental_properties
         ${whereClause}
         ORDER BY property_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM rental_properties ${whereClause}`,
        params,
      );
      const total = countRows?.[0]?.total || 0;

      return { success: true, properties: rows, total };
    } catch (error) {
      console.error("RentalPropertyModel.listProperties error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getPropertyById(propertyId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM rental_properties WHERE id = ?", [propertyId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Property not found" };
      }
      return { success: true, property: rows[0] };
    } catch (error) {
      console.error("RentalPropertyModel.getPropertyById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createProperty(propertyData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        property_name,
        property_type,
        property_location,
        monthly_rent,
        owner_name,
        owner_contact,
        lease_start_date,
        lease_end_date,
        status = "active",
        notes,
      } = propertyData;

      const [result] = await db.query(
        `INSERT INTO rental_properties
         (property_name, property_type, property_location, monthly_rent, owner_name, owner_contact,
          lease_start_date, lease_end_date, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          property_name,
          property_type || "other",
          property_location || null,
          toNumber(monthly_rent),
          owner_name || null,
          owner_contact || null,
          lease_start_date || null,
          lease_end_date || null,
          status,
          notes || null,
        ],
      );
      return this.getPropertyById(result.insertId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return { success: false, error: "Property with this name already exists" };
      }
      console.error("RentalPropertyModel.createProperty error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateProperty(propertyId, propertyData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = [];
      const params = [];

      if (propertyData.property_name !== undefined) {
        updates.push("property_name = ?");
        params.push(propertyData.property_name);
      }
      if (propertyData.property_type !== undefined) {
        updates.push("property_type = ?");
        params.push(propertyData.property_type);
      }
      if (propertyData.property_location !== undefined) {
        updates.push("property_location = ?");
        params.push(propertyData.property_location || null);
      }
      if (propertyData.monthly_rent !== undefined) {
        updates.push("monthly_rent = ?");
        params.push(toNumber(propertyData.monthly_rent));
      }
      if (propertyData.owner_name !== undefined) {
        updates.push("owner_name = ?");
        params.push(propertyData.owner_name || null);
      }
      if (propertyData.owner_contact !== undefined) {
        updates.push("owner_contact = ?");
        params.push(propertyData.owner_contact || null);
      }
      if (propertyData.lease_start_date !== undefined) {
        updates.push("lease_start_date = ?");
        params.push(propertyData.lease_start_date || null);
      }
      if (propertyData.lease_end_date !== undefined) {
        updates.push("lease_end_date = ?");
        params.push(propertyData.lease_end_date || null);
      }
      if (propertyData.status !== undefined) {
        updates.push("status = ?");
        params.push(propertyData.status);
      }
      if (propertyData.notes !== undefined) {
        updates.push("notes = ?");
        params.push(propertyData.notes || null);
      }

      if (updates.length === 0) {
        return this.getPropertyById(propertyId);
      }

      updates.push("updated_at = NOW()");
      params.push(propertyId);

      await db.query(
        `UPDATE rental_properties SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );
      return this.getPropertyById(propertyId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return { success: false, error: "Property with this name already exists" };
      }
      console.error("RentalPropertyModel.updateProperty error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteProperty(propertyId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM rental_properties WHERE id = ?", [propertyId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Property not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("RentalPropertyModel.deleteProperty error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getSummaryStats() {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT
          COUNT(*) AS total_properties,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_properties,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_properties,
          SUM(CASE WHEN status = 'terminated' THEN 1 ELSE 0 END) AS terminated_properties,
          SUM(monthly_rent) AS total_monthly_rent
        FROM rental_properties`
      );

      return {
        success: true,
        stats: {
          total: rows[0]?.total_properties || 0,
          active: rows[0]?.active_properties || 0,
          inactive: rows[0]?.inactive_properties || 0,
          terminated: rows[0]?.terminated_properties || 0,
          totalMonthlyRent: toNumber(rows[0]?.total_monthly_rent || 0),
        },
      };
    } catch (error) {
      console.error("RentalPropertyModel.getSummaryStats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default RentalPropertyModel;

