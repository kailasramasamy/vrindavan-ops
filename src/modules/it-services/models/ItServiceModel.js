import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

export class ItServiceModel {
  static get db() {
    return opsDb;
  }

  static async listServices({ limit = 100, offset = 0, search = "", serviceType = null, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(service_name LIKE ? OR vendor_name LIKE ? OR vendor_contact LIKE ?)");
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (serviceType) {
      conditions.push("service_type = ?");
      params.push(serviceType);
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
        `SELECT * FROM it_services
         ${whereClause}
         ORDER BY service_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM it_services ${whereClause}`,
        params,
      );
      const total = countRows?.[0]?.total || 0;

      return { success: true, services: rows, total };
    } catch (error) {
      console.error("ItServiceModel.listServices error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getServiceById(serviceId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM it_services WHERE id = ?", [serviceId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "IT service not found" };
      }
      return { success: true, service: rows[0] };
    } catch (error) {
      console.error("ItServiceModel.getServiceById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createService(serviceData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        service_name,
        service_type = 'other',
        vendor_name,
        vendor_contact,
        vendor_email,
        vendor_phone,
        description,
        status = 'active',
        notes,
      } = serviceData;

      if (!service_name) {
        return { success: false, error: "Service name is required" };
      }

      const [result] = await db.query(
        `INSERT INTO it_services
         (service_name, service_type, vendor_name, vendor_contact, vendor_email, vendor_phone, description, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          service_name,
          service_type,
          vendor_name || null,
          vendor_contact || null,
          vendor_email || null,
          vendor_phone || null,
          description || null,
          status,
          notes || null,
        ],
      );

      return this.getServiceById(result.insertId);
    } catch (error) {
      console.error("ItServiceModel.createService error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateService(serviceId, serviceData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = [];
      const params = [];

      if (serviceData.service_name !== undefined) {
        updates.push("service_name = ?");
        params.push(serviceData.service_name);
      }
      if (serviceData.service_type !== undefined) {
        updates.push("service_type = ?");
        params.push(serviceData.service_type);
      }
      if (serviceData.vendor_name !== undefined) {
        updates.push("vendor_name = ?");
        params.push(serviceData.vendor_name || null);
      }
      if (serviceData.vendor_contact !== undefined) {
        updates.push("vendor_contact = ?");
        params.push(serviceData.vendor_contact || null);
      }
      if (serviceData.vendor_email !== undefined) {
        updates.push("vendor_email = ?");
        params.push(serviceData.vendor_email || null);
      }
      if (serviceData.vendor_phone !== undefined) {
        updates.push("vendor_phone = ?");
        params.push(serviceData.vendor_phone || null);
      }
      if (serviceData.description !== undefined) {
        updates.push("description = ?");
        params.push(serviceData.description || null);
      }
      if (serviceData.status !== undefined) {
        updates.push("status = ?");
        params.push(serviceData.status);
      }
      if (serviceData.notes !== undefined) {
        updates.push("notes = ?");
        params.push(serviceData.notes || null);
      }

      if (updates.length === 0) {
        return this.getServiceById(serviceId);
      }

      updates.push("updated_at = NOW()");
      params.push(serviceId);

      await db.query(
        `UPDATE it_services SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getServiceById(serviceId);
    } catch (error) {
      console.error("ItServiceModel.updateService error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteService(serviceId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM it_services WHERE id = ?", [serviceId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "IT service not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("ItServiceModel.deleteService error:", error);
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
          COUNT(*) AS total_services,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_services,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_services,
          SUM(CASE WHEN status = 'discontinued' THEN 1 ELSE 0 END) AS discontinued_services,
          COUNT(DISTINCT service_type) AS total_types
        FROM it_services`
      );

      return {
        success: true,
        stats: {
          total: rows[0]?.total_services || 0,
          active: rows[0]?.active_services || 0,
          inactive: rows[0]?.inactive_services || 0,
          discontinued: rows[0]?.discontinued_services || 0,
          totalTypes: rows[0]?.total_types || 0,
        },
      };
    } catch (error) {
      console.error("ItServiceModel.getSummaryStats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default ItServiceModel;

