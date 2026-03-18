import pool, { opsPool } from "../../../db/pool.js";

const db = opsPool || pool;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_REGEX = /^\d{4}-\d{2}$/;

function toDateString(date) {
  if (!date) {
    return null;
  }
  if (typeof date === "string" && ISO_DATE_REGEX.test(date)) {
    return date;
  }
  if (typeof date === "string" && ISO_MONTH_REGEX.test(date)) {
    return `${date}-01`;
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartString(input) {
  if (!input) {
    const now = new Date();
    return toDateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  }
  if (typeof input === "string" && ISO_MONTH_REGEX.test(input)) {
    return `${input}-01`;
  }
  const date = typeof input === "string" ? new Date(input) : input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return toDateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  }
  return toDateString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export class EmployeePaymentCycleModel {
  static get db() {
    return db;
  }

  static normalizePeriod(monthLike) {
    let periodMonth = null;
    let startDate = null;
    let endDate = null;
    
    if (!monthLike) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
      periodMonth = `${year}-${month}`;
    } else if (typeof monthLike === "string" && ISO_MONTH_REGEX.test(monthLike)) {
      // Already in YYYY-MM format
      periodMonth = monthLike;
    } else {
      // Parse from date string or Date object
      const date = typeof monthLike === "string" ? new Date(monthLike) : monthLike instanceof Date ? monthLike : new Date(monthLike);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
        periodMonth = `${year}-${month}`;
      }
    }
    
    if (periodMonth) {
      // Extract year and month from YYYY-MM format
      const parts = periodMonth.split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      startDate = toDateString(start);
      endDate = toDateString(end);
    }
    
    return { periodMonth, startDate, endDate };
  }

  static async getCycleById(id, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM employee_payment_cycles WHERE id = ?", [id]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Employee payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("EmployeePaymentCycleModel.getCycleById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getCycleByMonth(monthLike) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const normalized = this.normalizePeriod(monthLike);
    const periodMonth = normalized.periodMonth;
    if (!periodMonth) {
      return { success: false, error: "Invalid month format" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM employee_payment_cycles WHERE period_month = ?", [periodMonth]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Employee payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("EmployeePaymentCycleModel.getCycleByMonth error:", error);
      return { success: false, error: error.message };
    }
  }

  static async listCycles({ limit = 12, offset = 0 } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 100) : 12;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;
    try {
      const [rows] = await db.query(
        `SELECT c.*,
                COALESCE(r.record_count, 0) AS record_count,
                COALESCE(r.pending_count, 0) AS pending_count,
                COALESCE(r.ready_count, 0) AS ready_count,
                COALESCE(r.paid_count, 0) AS paid_count
         FROM employee_payment_cycles c
         LEFT JOIN (
           SELECT cycle_id,
                  COUNT(*) AS record_count,
                  SUM(payment_status = 'pending') AS pending_count,
                  SUM(payment_status = 'ready') AS ready_count,
                  SUM(payment_status = 'paid') AS paid_count
           FROM employee_payment_records
           GROUP BY cycle_id
         ) r ON r.cycle_id = c.id
         ORDER BY c.period_month DESC
         LIMIT ? OFFSET ?`,
        [l, o],
      );
      return { success: true, cycles: rows };
    } catch (error) {
      console.error("EmployeePaymentCycleModel.listCycles error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createCycle({ monthLike, startDate, endDate } = {}, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const normalized = this.normalizePeriod(monthLike);
    const periodMonth = normalized.periodMonth;
    if (!periodMonth) {
      return { success: false, error: "Invalid month format" };
    }
    const start = toDateString(startDate) || normalized.startDate;
    const end = toDateString(endDate) || normalized.endDate;
    try {
      const [result] = await db.query(
        `INSERT INTO employee_payment_cycles
         (period_month, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', NOW(), NOW())`,
        [periodMonth, start, end],
      );
      return this.getCycleById(result.insertId, connection);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return this.getCycleByMonth(periodMonth);
      }
      console.error("EmployeePaymentCycleModel.createCycle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getOrCreateCycle({ monthLike, startDate, endDate } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const normalized = this.normalizePeriod(monthLike);
    const existing = await this.getCycleByMonth(normalized.periodMonth);
    if (existing.success && existing.cycle) {
      return existing;
    }
    return this.createCycle({ monthLike, startDate, endDate });
  }

  static async updateCycleStatus(cycleId, status) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      await db.query(
        "UPDATE employee_payment_cycles SET status = ?, updated_at = NOW() WHERE id = ?",
        [status, cycleId],
      );
      return this.getCycleById(cycleId);
    } catch (error) {
      console.error("EmployeePaymentCycleModel.updateCycleStatus error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateCycleAggregates(cycleId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT 
          COUNT(*) AS total_employees,
          COALESCE(SUM(gross_salary), 0) AS total_gross_pay,
          COALESCE(SUM(total_deductions), 0) AS total_deductions,
          COALESCE(SUM(total_additions), 0) AS total_additions,
          COALESCE(SUM(net_pay), 0) AS total_net_pay
         FROM employee_payment_records
         WHERE cycle_id = ?`,
        [cycleId],
      );
      const aggregates = rows[0] || {};
      await db.query(
        `UPDATE employee_payment_cycles 
         SET total_employees = ?,
             total_gross_pay = ?,
             total_deductions = ?,
             total_net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          aggregates.total_employees || 0,
          aggregates.total_gross_pay || 0,
          aggregates.total_deductions || 0,
          (Number(aggregates.total_net_pay) || 0) + (Number(aggregates.total_additions) || 0),
          cycleId,
        ],
      );
      return this.getCycleById(cycleId, connection);
    } catch (error) {
      console.error("EmployeePaymentCycleModel.updateCycleAggregates error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeePaymentCycleModel;

