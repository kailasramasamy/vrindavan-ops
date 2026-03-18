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

export class TransportPaymentCycleModel {
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
      periodMonth = monthLike;
    } else {
      const date = typeof monthLike === "string" ? new Date(monthLike) : monthLike instanceof Date ? monthLike : new Date(monthLike);
      if (!Number.isNaN(date.getTime())) {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
        periodMonth = `${year}-${month}`;
      }
    }
    
    if (periodMonth) {
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
      const [rows] = await db.query("SELECT * FROM transport_payment_cycles WHERE id = ?", [id]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Transport payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("TransportPaymentCycleModel.getCycleById error:", error);
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
      const [rows] = await db.query("SELECT * FROM transport_payment_cycles WHERE period_month = ?", [periodMonth]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Transport payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("TransportPaymentCycleModel.getCycleByMonth error:", error);
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
        `INSERT INTO transport_payment_cycles
         (period_month, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', NOW(), NOW())`,
        [periodMonth, start, end],
      );
      return this.getCycleById(result.insertId, connection);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return this.getCycleByMonth(periodMonth);
      }
      console.error("TransportPaymentCycleModel.createCycle error:", error);
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
          COUNT(*) AS total_vehicles,
          COALESCE(SUM(monthly_cost), 0) AS total_transport_cost,
          COALESCE(SUM(total_adjustments), 0) AS total_adjustments,
          COALESCE(SUM(net_pay), 0) AS total_net_pay
         FROM transport_payment_records
         WHERE cycle_id = ?`,
        [cycleId],
      );
      const aggregates = rows[0] || {};
      await db.query(
        `UPDATE transport_payment_cycles 
         SET total_vehicles = ?,
             total_transport_cost = ?,
             total_adjustments = ?,
             total_net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          aggregates.total_vehicles || 0,
          aggregates.total_transport_cost || 0,
          aggregates.total_adjustments || 0,
          aggregates.total_net_pay || 0,
          cycleId,
        ],
      );
      return this.getCycleById(cycleId, connection);
    } catch (error) {
      console.error("TransportPaymentCycleModel.updateCycleAggregates error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default TransportPaymentCycleModel;

