import pool from "../../../db/pool.js";

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

export class DeliveryPaymentCycleModel {
  static normalizePeriod(monthLike) {
    const periodMonth = monthStartString(monthLike);
    const startDate = periodMonth;
    let endDate = null;
    if (periodMonth) {
      const parts = periodMonth.split("-");
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const end = new Date(Date.UTC(year, month + 1, 0));
      endDate = toDateString(end);
    }
    return { periodMonth, startDate, endDate };
  }

  static async getCycleById(id) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await pool.query("SELECT * FROM delivery_payment_cycles WHERE id = ?", [id]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Delivery payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("DeliveryPaymentCycleModel.getCycleById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getCycleByMonth(monthLike) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    const { periodMonth } = this.normalizePeriod(monthLike);
    try {
      const [rows] = await pool.query("SELECT * FROM delivery_payment_cycles WHERE period_month = ?", [periodMonth]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Delivery payment cycle not found" };
      }
      return { success: true, cycle: rows[0] };
    } catch (error) {
      console.error("DeliveryPaymentCycleModel.getCycleByMonth error:", error);
      return { success: false, error: error.message };
    }
  }

  static async listCycles({ limit = 12, offset = 0 } = {}) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 100) : 12;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;
    try {
      const [rows] = await pool.query(
        `SELECT c.*,
                COALESCE(r.record_count, 0) AS record_count,
                COALESCE(r.pending_count, 0) AS pending_count,
                COALESCE(r.ready_count, 0) AS ready_count,
                COALESCE(r.paid_count, 0) AS paid_count
         FROM delivery_payment_cycles c
         LEFT JOIN (
           SELECT cycle_id,
                  COUNT(*) AS record_count,
                  SUM(payment_status = 'pending') AS pending_count,
                  SUM(payment_status = 'ready') AS ready_count,
                  SUM(payment_status = 'paid') AS paid_count
           FROM delivery_payment_records
           GROUP BY cycle_id
         ) r ON r.cycle_id = c.id
         ORDER BY c.period_month DESC
         LIMIT ? OFFSET ?`,
        [l, o],
      );
      return { success: true, cycles: rows };
    } catch (error) {
      console.error("DeliveryPaymentCycleModel.listCycles error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createCycle({ monthLike, startDate, endDate, createdBy }) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    const normalized = this.normalizePeriod(monthLike);
    const periodMonth = normalized.periodMonth;
    const start = toDateString(startDate) || normalized.startDate;
    const end = toDateString(endDate) || normalized.endDate;
    try {
      const [result] = await pool.query(
        `INSERT INTO delivery_payment_cycles
         (period_month, start_date, end_date, status, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, NOW(), NOW())`,
        [periodMonth, start, end, createdBy || null, createdBy || null],
      );
      return this.getCycleById(result.insertId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        return this.getCycleByMonth(periodMonth);
      }
      console.error("DeliveryPaymentCycleModel.createCycle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getOrCreateCycle({ monthLike, startDate, endDate, userId } = {}) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    const normalized = this.normalizePeriod(monthLike);
    const periodMonth = normalized.periodMonth;
    const start = toDateString(startDate) || normalized.startDate;
    const end = toDateString(endDate) || normalized.endDate;

    try {
      const [rows] = await pool.query("SELECT * FROM delivery_payment_cycles WHERE period_month = ?", [periodMonth]);
      if (rows && rows.length > 0) {
        return { success: true, cycle: rows[0] };
      }
      const createResult = await this.createCycle({ monthLike: periodMonth, startDate: start, endDate: end, createdBy: userId });
      return createResult;
    } catch (error) {
      console.error("DeliveryPaymentCycleModel.getOrCreateCycle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateCycle(cycleId, fields = {}) {
    if (!pool) {
      return { success: false, error: "Database connection not available" };
    }
    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return this.getCycleById(cycleId);
    }
    const assignments = [];
    const values = [];
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        assignments.push(`${key} = ?`);
        values.push(fields[key]);
      }
    });
    assignments.push("updated_at = NOW()");
    values.push(cycleId);
    const sql = `UPDATE delivery_payment_cycles SET ${assignments.join(", ")} WHERE id = ?`;
    try {
      await pool.query(sql, values);
      return this.getCycleById(cycleId);
    } catch (error) {
      console.error("DeliveryPaymentCycleModel.updateCycle error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateCycleTotals(cycleId, totals = {}, userId = null) {
    const fields = { ...totals };
    if (userId) {
      fields.updated_by = userId;
    }
    return this.updateCycle(cycleId, fields);
  }

  static async setStatus(cycleId, status, userId = null) {
    const allowed = new Set(["draft", "in_review", "approved", "locked", "paid", "archived"]);
    if (!allowed.has(status)) {
      return { success: false, error: `Invalid cycle status: ${status}` };
    }
    const fields = { status };
    fields.locked_at = status === "locked" ? new Date() : null;
    if (userId) {
      fields.updated_by = userId;
    }
    return this.updateCycle(cycleId, fields);
  }
}

export default DeliveryPaymentCycleModel;

