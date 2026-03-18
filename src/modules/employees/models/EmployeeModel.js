import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeeModel {
  static get db() {
    return opsDb;
  }

  static async listEmployees({ limit = 100, offset = 0, search = "", roleId = null, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)");
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (roleId) {
      conditions.push("e.role_id = ?");
      params.push(roleId);
    }

    if (status) {
      conditions.push("e.status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 500) : 100;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;

    try {
      const [rows] = await db.query(
        `SELECT e.*, 
                r.name AS role_name,
                r.description AS role_description
         FROM employees e
         LEFT JOIN employee_roles r ON e.role_id = r.id
         ${whereClause}
         ORDER BY e.name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const [countRows] = await db.query(
        `SELECT COUNT(*) as total FROM employees e ${whereClause}`,
        params,
      );
      const total = countRows?.[0]?.total || 0;

      return { success: true, employees: rows, total };
    } catch (error) {
      console.error("EmployeeModel.listEmployees error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getEmployeeById(employeeId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT e.*, 
                r.name AS role_name,
                r.description AS role_description
         FROM employees e
         LEFT JOIN employee_roles r ON e.role_id = r.id
         WHERE e.id = ?`,
        [employeeId],
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Employee not found" };
      }
      return { success: true, employee: rows[0] };
    } catch (error) {
      console.error("EmployeeModel.getEmployeeById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createEmployee(employeeData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        name,
        age,
        gender,
        dob,
        role_id,
        profile_photo,
        start_date,
        phone,
        email,
        address,
        job_location,
        job_description,
        emergency_contact_name,
        emergency_contact_phone,
        status = "active",
      } = employeeData;

      const [result] = await db.query(
        `INSERT INTO employees 
         (name, age, gender, dob, role_id, profile_photo, start_date, phone, email, address, 
          job_location, job_description, emergency_contact_name, emergency_contact_phone, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          name,
          age || null,
          gender || null,
          dob || null,
          role_id || null,
          profile_photo || null,
          start_date || null,
          phone || null,
          email || null,
          address || null,
          job_location || null,
          job_description || null,
          emergency_contact_name || null,
          emergency_contact_phone || null,
          status,
        ],
      );

      return this.getEmployeeById(result.insertId);
    } catch (error) {
      console.error("EmployeeModel.createEmployee error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateEmployee(employeeId, employeeData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        name,
        age,
        gender,
        dob,
        role_id,
        profile_photo,
        start_date,
        phone,
        email,
        address,
        job_location,
        job_description,
        emergency_contact_name,
        emergency_contact_phone,
        status,
      } = employeeData;

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (age !== undefined) {
        updates.push("age = ?");
        params.push(age || null);
      }
      if (gender !== undefined) {
        updates.push("gender = ?");
        params.push(gender || null);
      }
      if (dob !== undefined) {
        updates.push("dob = ?");
        params.push(dob || null);
      }
      if (role_id !== undefined) {
        updates.push("role_id = ?");
        params.push(role_id || null);
      }
      if (profile_photo !== undefined) {
        updates.push("profile_photo = ?");
        params.push(profile_photo || null);
      }
      if (start_date !== undefined) {
        updates.push("start_date = ?");
        params.push(start_date || null);
      }
      if (phone !== undefined) {
        updates.push("phone = ?");
        params.push(phone || null);
      }
      if (email !== undefined) {
        updates.push("email = ?");
        params.push(email || null);
      }
      if (address !== undefined) {
        updates.push("address = ?");
        params.push(address || null);
      }
      if (job_location !== undefined) {
        updates.push("job_location = ?");
        params.push(job_location || null);
      }
      if (job_description !== undefined) {
        updates.push("job_description = ?");
        params.push(job_description || null);
      }
      if (emergency_contact_name !== undefined) {
        updates.push("emergency_contact_name = ?");
        params.push(emergency_contact_name || null);
      }
      if (emergency_contact_phone !== undefined) {
        updates.push("emergency_contact_phone = ?");
        params.push(emergency_contact_phone || null);
      }
      if (status !== undefined) {
        updates.push("status = ?");
        params.push(status);
      }

      if (updates.length === 0) {
        return this.getEmployeeById(employeeId);
      }

      updates.push("updated_at = NOW()");
      params.push(employeeId);

      await db.query(
        `UPDATE employees SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getEmployeeById(employeeId);
    } catch (error) {
      console.error("EmployeeModel.updateEmployee error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteEmployee(employeeId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM employees WHERE id = ?", [employeeId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Employee not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("EmployeeModel.deleteEmployee error:", error);
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
          COUNT(*) AS total_employees,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_employees,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_employees,
          COUNT(DISTINCT role_id) AS total_roles
        FROM employees`
      );

      return {
        success: true,
        stats: {
          total: rows[0]?.total_employees || 0,
          active: rows[0]?.active_employees || 0,
          inactive: rows[0]?.inactive_employees || 0,
          totalRoles: rows[0]?.total_roles || 0,
        },
      };
    } catch (error) {
      console.error("EmployeeModel.getSummaryStats error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default EmployeeModel;

