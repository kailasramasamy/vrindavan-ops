import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeePaymentRecordModel {
  static get db() {
    return opsDb;
  }

  static async getRecordById(recordId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT r.*,
                COALESCE(e.name, r.employee_name) AS employee_name_current
         FROM employee_payment_records r
         LEFT JOIN employees e ON e.id = r.employee_id
         WHERE r.id = ?`,
        [recordId]
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Employee payment record not found" };
      }
      const { employee_name_current, ...recordData } = rows[0];
      const record = {
        ...recordData,
        employee_name: employee_name_current || recordData.employee_name,
      };
      return { success: true, record };
    } catch (error) {
      console.error("EmployeePaymentRecordModel.getRecordById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async listRecords({ cycleId, limit = 200, offset = 0, status = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];

    if (cycleId) {
      conditions.push("r.cycle_id = ?");
      params.push(cycleId);
    }

    if (status) {
      conditions.push("r.payment_status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 500) : 200;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;

    try {
      const [rows] = await db.query(
        `SELECT r.*,
                COALESCE(entry_counts.entry_count, 0) AS entry_count,
                COALESCE(entry_counts.allowance_count, 0) AS allowance_count,
                COALESCE(entry_counts.adjustment_count, 0) AS adjustment_count,
                COALESCE(entry_counts.advance_count, 0) AS advance_count,
                COALESCE(e.name, r.employee_name) AS employee_name_current
         FROM employee_payment_records r
         LEFT JOIN (
           SELECT record_id,
                  COUNT(*) AS entry_count,
                  SUM(entry_type = 'allowance') AS allowance_count,
                  SUM(entry_type = 'adjustment') AS adjustment_count,
                  SUM(entry_type = 'advance') AS advance_count
           FROM employee_payment_entries
           GROUP BY record_id
         ) entry_counts ON entry_counts.record_id = r.id
         LEFT JOIN employees e ON e.id = r.employee_id
         ${whereClause}
         ORDER BY COALESCE(e.name, r.employee_name) ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      const records = rows.map(row => {
        const { employee_name_current, ...recordData } = row;
        return {
          ...recordData,
          employee_name: employee_name_current || recordData.employee_name,
        };
      });

      return { success: true, records };
    } catch (error) {
      console.error("EmployeePaymentRecordModel.listRecords error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createRecord(recordData, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const {
        cycle_id,
        employee_id,
        employee_name,
        employee_user_id,
        base_salary,
        food_allowance,
        fuel_allowance,
        gross_salary,
        total_deductions,
        total_additions,
        net_pay,
      } = recordData;

      const [result] = await db.query(
        `INSERT INTO employee_payment_records
         (cycle_id, employee_id, employee_name, employee_user_id, base_salary, food_allowance, fuel_allowance,
          gross_salary, total_deductions, total_additions, net_pay, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          cycle_id,
          employee_id,
          employee_name,
          employee_user_id || null,
          toNumber(base_salary),
          toNumber(food_allowance),
          toNumber(fuel_allowance),
          toNumber(gross_salary),
          toNumber(total_deductions),
          toNumber(total_additions),
          toNumber(net_pay),
        ],
      );
      return this.getRecordById(result.insertId, connection);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        // Record already exists for this cycle and employee
        const [rows] = await db.query(
          "SELECT id FROM employee_payment_records WHERE cycle_id = ? AND employee_id = ?",
          [recordData.cycle_id, recordData.employee_id],
        );
        if (rows && rows.length > 0) {
          return this.getRecordById(rows[0].id, connection);
        }
      }
      console.error("EmployeePaymentRecordModel.createRecord error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRecordStatus(recordId, status, paymentDate = null) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      await db.query(
        "UPDATE employee_payment_records SET payment_status = ?, payment_date = ?, updated_at = NOW() WHERE id = ?",
        [status, paymentDate, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("EmployeePaymentRecordModel.updateRecordStatus error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRecordRemarks(recordId, remarks) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      await db.query(
        "UPDATE employee_payment_records SET remarks = ?, updated_at = NOW() WHERE id = ?",
        [remarks, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("EmployeePaymentRecordModel.updateRecordRemarks error:", error);
      return { success: false, error: error.message };
    }
  }

  static async refreshRecordAggregates(recordId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [entryRows] = await db.query(
        `SELECT 
          entry_type,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS total_positive,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_negative
         FROM employee_payment_entries
         WHERE record_id = ?
         GROUP BY entry_type`,
        [recordId],
      );

      let totalDeductions = 0;
      let totalAdditions = 0;

      entryRows.forEach((row) => {
        if (row.entry_type === "deduction" || row.entry_type === "leave" || row.entry_type === "advance" || row.entry_type === "loan") {
          totalDeductions += toNumber(row.total_negative);
        } else if (row.entry_type === "allowance" || row.entry_type === "bonus") {
          totalAdditions += toNumber(row.total_positive);
        } else if (row.entry_type === "adjustment") {
          // Adjustments can be positive (additions) or negative (deductions)
          const positiveAmount = toNumber(row.total_positive);
          const negativeAmount = toNumber(row.total_negative);
          if (positiveAmount > 0) {
            totalAdditions += positiveAmount;
          }
          if (negativeAmount > 0) {
            totalDeductions += negativeAmount;
          }
        }
      });

      const [recordRows] = await db.query(
        "SELECT base_salary, food_allowance, fuel_allowance FROM employee_payment_records WHERE id = ?",
        [recordId],
      );
      const record = recordRows[0];
      const grossSalary = toNumber(record.base_salary) + toNumber(record.food_allowance) + toNumber(record.fuel_allowance);
      const netPay = grossSalary - totalDeductions + totalAdditions;

      await db.query(
        `UPDATE employee_payment_records 
         SET gross_salary = ?,
             total_deductions = ?,
             total_additions = ?,
             net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [grossSalary, totalDeductions, totalAdditions, netPay, recordId],
      );

      return this.getRecordById(recordId, connection);
    } catch (error) {
      console.error("EmployeePaymentRecordModel.refreshRecordAggregates error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeePaymentRecordModel;

