import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

export class ElectricityMeterModel {
  static get db() {
    return opsDb;
  }

  static async listMeters({ limit = 100, offset = 0, search = "", meterType = null, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(meter_name LIKE ? OR location LIKE ? OR meter_number LIKE ? OR supplier_name LIKE ?)");
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (meterType) {
      conditions.push("meter_type = ?");
      params.push(meterType);
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
        `SELECT * FROM electricity_meters
         ${whereClause}
         ORDER BY meter_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM electricity_meters ${whereClause}`,
        params,
      );
      const total = countRows?.[0]?.total || 0;

      return { success: true, meters: rows, total };
    } catch (error) {
      console.error("ElectricityMeterModel.listMeters error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getMeterById(meterId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM electricity_meters WHERE id = ?", [meterId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Electricity meter not found" };
      }
      return { success: true, meter: rows[0] };
    } catch (error) {
      console.error("ElectricityMeterModel.getMeterById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createMeter(meterData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        meter_name,
        meter_type = 'commercial',
        location,
        meter_number,
        supplier_name,
        supplier_contact,
        supplier_email,
        supplier_phone,
        description,
        status = 'active',
        notes,
      } = meterData;

      if (!meter_name) {
        return { success: false, error: "Meter name is required" };
      }

      const [result] = await db.query(
        `INSERT INTO electricity_meters
         (meter_name, meter_type, location, meter_number, supplier_name, supplier_contact, supplier_email, supplier_phone, description, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          meter_name,
          meter_type,
          location || null,
          meter_number || null,
          supplier_name || null,
          supplier_contact || null,
          supplier_email || null,
          supplier_phone || null,
          description || null,
          status,
          notes || null,
        ],
      );

      return this.getMeterById(result.insertId);
    } catch (error) {
      console.error("ElectricityMeterModel.createMeter error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateMeter(meterId, meterData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = [];
      const params = [];

      if (meterData.meter_name !== undefined) {
        updates.push("meter_name = ?");
        params.push(meterData.meter_name);
      }
      if (meterData.meter_type !== undefined) {
        updates.push("meter_type = ?");
        params.push(meterData.meter_type);
      }
      if (meterData.location !== undefined) {
        updates.push("location = ?");
        params.push(meterData.location || null);
      }
      if (meterData.meter_number !== undefined) {
        updates.push("meter_number = ?");
        params.push(meterData.meter_number || null);
      }
      if (meterData.supplier_name !== undefined) {
        updates.push("supplier_name = ?");
        params.push(meterData.supplier_name || null);
      }
      if (meterData.supplier_contact !== undefined) {
        updates.push("supplier_contact = ?");
        params.push(meterData.supplier_contact || null);
      }
      if (meterData.supplier_email !== undefined) {
        updates.push("supplier_email = ?");
        params.push(meterData.supplier_email || null);
      }
      if (meterData.supplier_phone !== undefined) {
        updates.push("supplier_phone = ?");
        params.push(meterData.supplier_phone || null);
      }
      if (meterData.description !== undefined) {
        updates.push("description = ?");
        params.push(meterData.description || null);
      }
      if (meterData.status !== undefined) {
        updates.push("status = ?");
        params.push(meterData.status);
      }
      if (meterData.notes !== undefined) {
        updates.push("notes = ?");
        params.push(meterData.notes || null);
      }

      if (updates.length === 0) {
        return this.getMeterById(meterId);
      }

      updates.push("updated_at = NOW()");
      params.push(meterId);

      await db.query(
        `UPDATE electricity_meters SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getMeterById(meterId);
    } catch (error) {
      console.error("ElectricityMeterModel.updateMeter error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteMeter(meterId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM electricity_meters WHERE id = ?", [meterId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Electricity meter not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("ElectricityMeterModel.deleteMeter error:", error);
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
          COUNT(*) AS total_meters,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_meters,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_meters,
          SUM(CASE WHEN status = 'disconnected' THEN 1 ELSE 0 END) AS disconnected_meters,
          COUNT(DISTINCT meter_type) AS total_types
        FROM electricity_meters`
      );

      return {
        success: true,
        stats: {
          total: rows[0]?.total_meters || 0,
          active: rows[0]?.active_meters || 0,
          inactive: rows[0]?.inactive_meters || 0,
          disconnected: rows[0]?.disconnected_meters || 0,
          totalTypes: rows[0]?.total_types || 0,
        },
      };
    } catch (error) {
      console.error("ElectricityMeterModel.getSummaryStats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default ElectricityMeterModel;


