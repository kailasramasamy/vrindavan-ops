import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeeSalaryPackageModel {
  static get db() {
    return opsDb;
  }

  static async getSalaryPackageByEmployeeId(employeeId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_salary_packages WHERE employee_id = ? ORDER BY effective_from DESC LIMIT 1",
        [employeeId],
      );
      if (!rows || rows.length === 0) {
        return { success: true, salaryPackage: null };
      }
      return { success: true, salaryPackage: rows[0] };
    } catch (error) {
      console.error("EmployeeSalaryPackageModel.getSalaryPackageByEmployeeId error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getSalaryPackageHistory(employeeId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_salary_packages WHERE employee_id = ? ORDER BY effective_from DESC",
        [employeeId],
      );
      return { success: true, salaryPackages: rows || [] };
    } catch (error) {
      console.error("EmployeeSalaryPackageModel.getSalaryPackageHistory error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createSalaryPackage(salaryData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { employee_id, base_salary, food_allowance, fuel_allowance, effective_from } = salaryData;

      const [result] = await db.query(
        `INSERT INTO employee_salary_packages 
         (employee_id, base_salary, food_allowance, fuel_allowance, effective_from, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          employee_id,
          toNumber(base_salary),
          toNumber(food_allowance),
          toNumber(fuel_allowance),
          effective_from || new Date().toISOString().slice(0, 10),
        ],
      );

      const [rows] = await db.query(
        "SELECT * FROM employee_salary_packages WHERE id = ?",
        [result.insertId],
      );

      return { success: true, salaryPackage: rows[0] };
    } catch (error) {
      console.error("EmployeeSalaryPackageModel.createSalaryPackage error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateSalaryPackage(salaryPackageId, salaryData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { base_salary, food_allowance, fuel_allowance, effective_from } = salaryData;

      const updates = [];
      const params = [];

      if (base_salary !== undefined) {
        updates.push("base_salary = ?");
        params.push(toNumber(base_salary));
      }
      if (food_allowance !== undefined) {
        updates.push("food_allowance = ?");
        params.push(toNumber(food_allowance));
      }
      if (fuel_allowance !== undefined) {
        updates.push("fuel_allowance = ?");
        params.push(toNumber(fuel_allowance));
      }
      if (effective_from !== undefined) {
        updates.push("effective_from = ?");
        params.push(effective_from);
      }

      if (updates.length === 0) {
        const [rows] = await db.query(
          "SELECT * FROM employee_salary_packages WHERE id = ?",
          [salaryPackageId],
        );
        return { success: true, salaryPackage: rows[0] };
      }

      updates.push("updated_at = NOW()");
      params.push(salaryPackageId);

      await db.query(
        `UPDATE employee_salary_packages SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      const [rows] = await db.query(
        "SELECT * FROM employee_salary_packages WHERE id = ?",
        [salaryPackageId],
      );

      return { success: true, salaryPackage: rows[0] };
    } catch (error) {
      console.error("EmployeeSalaryPackageModel.updateSalaryPackage error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteSalaryPackage(salaryPackageId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query(
        "DELETE FROM employee_salary_packages WHERE id = ?",
        [salaryPackageId],
      );
      if (result.affectedRows === 0) {
        return { success: false, error: "Salary package not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("EmployeeSalaryPackageModel.deleteSalaryPackage error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeeSalaryPackageModel;

