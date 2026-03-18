import pool, { opsPool } from "../../../db/pool.js";
import { EmployeeModel } from "../../employees/models/EmployeeModel.js";
import { EmployeeSalaryPackageModel } from "../../employees/models/EmployeeSalaryPackageModel.js";
import { EmployeePaymentCycleModel } from "../models/EmployeePaymentCycleModel.js";
import { EmployeePaymentRecordModel } from "../models/EmployeePaymentRecordModel.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeePaymentsService {
  static async fetchActiveEmployees() {
    const db = opsDb;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT id, name, status, role_id
         FROM employees
         WHERE status = 'active'
         ORDER BY name ASC`
      );
      return { success: true, employees: rows || [] };
    } catch (error) {
      console.error("EmployeePaymentsService.fetchActiveEmployees error:", error);
      return { success: false, error: error.message };
    }
  }

  static async calculateEmployeePayments(cycleId, monthLike) {
    const db = opsDb;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }

    let connection;
    try {
      // Check if db has getConnection method (pool) or use db directly
      if (typeof db.getConnection === 'function') {
        connection = await db.getConnection();
        await connection.beginTransaction();
      } else {
        // If it's not a pool, use db directly and start transaction
        await db.query('START TRANSACTION');
        connection = db;
      }

      // Get or create cycle
      let cycleResult = await EmployeePaymentCycleModel.getCycleByMonth(monthLike);
      if (!cycleResult.success || !cycleResult.cycle) {
        const normalized = EmployeePaymentCycleModel.normalizePeriod(monthLike);
        cycleResult = await EmployeePaymentCycleModel.createCycle({
          monthLike: normalized.periodMonth,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
        }, connection);
      }

      if (!cycleResult.success || !cycleResult.cycle) {
        if (typeof connection.rollback === 'function') {
          await connection.rollback();
        } else {
          await db.query('ROLLBACK');
        }
        return { success: false, error: "Failed to get or create cycle" };
      }

      const cycle = cycleResult.cycle;
      const actualCycleId = cycle.id;

      // Fetch active employees
      const employeesResult = await this.fetchActiveEmployees();
      if (!employeesResult.success) {
        if (typeof connection.rollback === 'function') {
          await connection.rollback();
        } else {
          await db.query('ROLLBACK');
        }
        return { success: false, error: employeesResult.error };
      }

      const employees = employeesResult.employees;
      const records = [];

      // Process each employee
      for (const employee of employees) {
        // Get current salary package
        const salaryResult = await EmployeeSalaryPackageModel.getSalaryPackageByEmployeeId(employee.id);
        const salaryPackage = salaryResult.success ? salaryResult.salaryPackage : null;

        const baseSalary = toNumber(salaryPackage?.base_salary || 0);
        const foodAllowance = toNumber(salaryPackage?.food_allowance || 0);
        const fuelAllowance = toNumber(salaryPackage?.fuel_allowance || 0);
        const grossSalary = baseSalary + foodAllowance + fuelAllowance;

        // Create or update payment record
        const recordResult = await EmployeePaymentRecordModel.createRecord(
          {
            cycle_id: actualCycleId,
            employee_id: employee.id,
            employee_name: employee.name,
            employee_user_id: null, // Employees don't have user_id like delivery boys
            base_salary: baseSalary,
            food_allowance: foodAllowance,
            fuel_allowance: fuelAllowance,
            gross_salary: grossSalary,
            total_deductions: 0,
            total_additions: 0,
            net_pay: grossSalary,
          },
          connection,
        );

        if (recordResult.success) {
          records.push(recordResult.record);
        }
      }

      // Update cycle aggregates and get the updated cycle
      const updatedCycleResult = await EmployeePaymentCycleModel.updateCycleAggregates(actualCycleId, connection);
      const updatedCycle = updatedCycleResult.success ? updatedCycleResult.cycle : cycle;

      if (typeof connection.commit === 'function') {
        await connection.commit();
      } else {
        await db.query('COMMIT');
      }

      return {
        success: true,
        cycle: updatedCycle, // Use the updated cycle with fresh aggregates
        records: records,
      };
    } catch (error) {
      if (typeof connection?.rollback === 'function') {
        await connection.rollback();
      } else if (db) {
        await db.query('ROLLBACK');
      }
      console.error("EmployeePaymentsService.calculateEmployeePayments error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection && typeof connection.release === 'function') {
        connection.release();
      }
    }
  }
}

export default EmployeePaymentsService;

