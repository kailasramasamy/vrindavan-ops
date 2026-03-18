import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class TransportVehicleModel {
  static get db() {
    return opsDb;
  }

  static async listVehicles({ limit = 100, offset = 0, search = "", vehicleType = null, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(vehicle_name LIKE ? OR vehicle_number LIKE ? OR owner_name LIKE ?)");
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (vehicleType) {
      conditions.push("vehicle_type = ?");
      params.push(vehicleType);
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
        `SELECT * FROM transport_vehicles
         ${whereClause}
         ORDER BY vehicle_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM transport_vehicles ${whereClause}`,
        params,
      );
      const total = countRows?.[0]?.total || 0;

      return { success: true, vehicles: rows, total };
    } catch (error) {
      console.error("TransportVehicleModel.listVehicles error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getVehicleById(vehicleId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM transport_vehicles WHERE id = ?", [vehicleId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Vehicle not found" };
      }
      return { success: true, vehicle: rows[0] };
    } catch (error) {
      console.error("TransportVehicleModel.getVehicleById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createVehicle(vehicleData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        vehicle_name,
        vehicle_type = 'other',
        vehicle_number,
        monthly_cost,
        owner_name,
        owner_contact,
        status = 'active',
        notes,
      } = vehicleData;

      if (!vehicle_name) {
        return { success: false, error: "Vehicle name is required" };
      }

      const [result] = await db.query(
        `INSERT INTO transport_vehicles
         (vehicle_name, vehicle_type, vehicle_number, monthly_cost, owner_name, owner_contact, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          vehicle_name,
          vehicle_type,
          vehicle_number || null,
          toNumber(monthly_cost),
          owner_name || null,
          owner_contact || null,
          status,
          notes || null,
        ],
      );
      return this.getVehicleById(result.insertId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return { success: false, error: "Vehicle with this name already exists" };
      }
      console.error("TransportVehicleModel.createVehicle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateVehicle(vehicleId, vehicleData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = [];
      const params = [];

      if (vehicleData.vehicle_name !== undefined) {
        updates.push("vehicle_name = ?");
        params.push(vehicleData.vehicle_name);
      }
      if (vehicleData.vehicle_type !== undefined) {
        updates.push("vehicle_type = ?");
        params.push(vehicleData.vehicle_type);
      }
      if (vehicleData.vehicle_number !== undefined) {
        updates.push("vehicle_number = ?");
        params.push(vehicleData.vehicle_number || null);
      }
      if (vehicleData.monthly_cost !== undefined) {
        updates.push("monthly_cost = ?");
        params.push(toNumber(vehicleData.monthly_cost));
      }
      if (vehicleData.owner_name !== undefined) {
        updates.push("owner_name = ?");
        params.push(vehicleData.owner_name || null);
      }
      if (vehicleData.owner_contact !== undefined) {
        updates.push("owner_contact = ?");
        params.push(vehicleData.owner_contact || null);
      }
      if (vehicleData.status !== undefined) {
        updates.push("status = ?");
        params.push(vehicleData.status);
      }
      if (vehicleData.notes !== undefined) {
        updates.push("notes = ?");
        params.push(vehicleData.notes || null);
      }

      if (updates.length === 0) {
        return this.getVehicleById(vehicleId);
      }

      updates.push("updated_at = NOW()");
      params.push(vehicleId);

      await db.query(
        `UPDATE transport_vehicles SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );
      return this.getVehicleById(vehicleId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return { success: false, error: "Vehicle with this name already exists" };
      }
      console.error("TransportVehicleModel.updateVehicle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteVehicle(vehicleId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM transport_vehicles WHERE id = ?", [vehicleId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Vehicle not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("TransportVehicleModel.deleteVehicle error:", error);
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
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive,
          SUM(CASE WHEN status = 'retired' THEN 1 ELSE 0 END) AS retired,
          COALESCE(SUM(CASE WHEN status = 'active' THEN monthly_cost ELSE 0 END), 0) AS total_monthly_cost
         FROM transport_vehicles`
      );

      return {
        success: true,
        stats: {
          total: rows[0]?.total || 0,
          active: rows[0]?.active || 0,
          inactive: rows[0]?.inactive || 0,
          retired: rows[0]?.retired || 0,
          totalMonthlyCost: rows[0]?.total_monthly_cost || 0,
        },
      };
    } catch (error) {
      console.error("TransportVehicleModel.getSummaryStats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default TransportVehicleModel;

