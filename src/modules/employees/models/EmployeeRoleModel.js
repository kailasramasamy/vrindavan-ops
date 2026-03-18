import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

export class EmployeeRoleModel {
  static get db() {
    return opsDb;
  }

  static async listRoles() {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_roles ORDER BY name ASC",
      );
      return { success: true, roles: rows || [] };
    } catch (error) {
      console.error("EmployeeRoleModel.listRoles error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getRoleById(roleId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_roles WHERE id = ?",
        [roleId],
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Role not found" };
      }
      return { success: true, role: rows[0] };
    } catch (error) {
      console.error("EmployeeRoleModel.getRoleById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createRole(roleData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { name, description } = roleData;
      const [result] = await db.query(
        "INSERT INTO employee_roles (name, description, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [name, description || null],
      );
      return this.getRoleById(result.insertId);
    } catch (error) {
      console.error("EmployeeRoleModel.createRole error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRole(roleId, roleData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { name, description } = roleData;
      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }
      if (description !== undefined) {
        updates.push("description = ?");
        params.push(description || null);
      }

      if (updates.length === 0) {
        return this.getRoleById(roleId);
      }

      updates.push("updated_at = NOW()");
      params.push(roleId);

      await db.query(
        `UPDATE employee_roles SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getRoleById(roleId);
    } catch (error) {
      console.error("EmployeeRoleModel.updateRole error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteRole(roleId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      // Check if role is used by any employees
      const [employees] = await db.query(
        "SELECT COUNT(*) as count FROM employees WHERE role_id = ?",
        [roleId],
      );
      if (employees[0]?.count > 0) {
        return { success: false, error: "Cannot delete role that is assigned to employees" };
      }

      const [result] = await db.query("DELETE FROM employee_roles WHERE id = ?", [roleId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Role not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("EmployeeRoleModel.deleteRole error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeeRoleModel;

