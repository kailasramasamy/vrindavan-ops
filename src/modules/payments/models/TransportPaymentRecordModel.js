import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class TransportPaymentRecordModel {
  static get db() {
    return opsDb;
  }

  static async getRecordById(recordId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM transport_payment_records WHERE id = ?", [recordId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Transport payment record not found" };
      }
      return { success: true, record: rows[0] };
    } catch (error) {
      console.error("TransportPaymentRecordModel.getRecordById error:", error);
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
                COALESCE(entry_counts.entry_count, 0) AS entry_count
         FROM transport_payment_records r
         LEFT JOIN (
           SELECT record_id,
                  COUNT(*) AS entry_count
           FROM transport_payment_entries
           GROUP BY record_id
         ) entry_counts ON entry_counts.record_id = r.id
         ${whereClause}
         ORDER BY r.vehicle_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      return { success: true, records: rows };
    } catch (error) {
      console.error("TransportPaymentRecordModel.listRecords error:", error);
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
        vehicle_name,
        vehicle_type,
        vehicle_number,
        monthly_cost,
        total_adjustments,
        net_pay,
      } = recordData;

      const [result] = await db.query(
        `INSERT INTO transport_payment_records
         (cycle_id, vehicle_name, vehicle_type, vehicle_number, monthly_cost, total_adjustments, net_pay, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          cycle_id,
          vehicle_name,
          vehicle_type || 'other',
          vehicle_number || null,
          toNumber(monthly_cost),
          toNumber(total_adjustments),
          toNumber(net_pay),
        ],
      );
      return this.getRecordById(result.insertId, connection);
    } catch (error) {
      console.error("TransportPaymentRecordModel.createRecord error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRecordStatus(recordId, status, paymentDate = null) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = ["payment_status = ?", "updated_at = NOW()"];
      const params = [status];

      if (paymentDate) {
        updates.push("payment_date = ?");
        params.push(paymentDate);
      }

      await db.query(
        `UPDATE transport_payment_records SET ${updates.join(", ")} WHERE id = ?`,
        [...params, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("TransportPaymentRecordModel.updateRecordStatus error:", error);
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
        "UPDATE transport_payment_records SET remarks = ?, updated_at = NOW() WHERE id = ?",
        [remarks || null, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("TransportPaymentRecordModel.updateRecordRemarks error:", error);
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
          SUM(amount) AS total_adjustments
         FROM transport_payment_entries
         WHERE record_id = ?`,
        [recordId],
      );

      const totalAdjustments = toNumber(entryRows[0]?.total_adjustments || 0);

      const [recordRows] = await db.query(
        "SELECT monthly_cost FROM transport_payment_records WHERE id = ?",
        [recordId],
      );
      const record = recordRows[0];
      const monthlyCost = toNumber(record.monthly_cost);
      const netPay = monthlyCost + totalAdjustments;

      await db.query(
        `UPDATE transport_payment_records 
         SET total_adjustments = ?,
             net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [totalAdjustments, netPay, recordId],
      );

      return this.getRecordById(recordId, connection);
    } catch (error) {
      console.error("TransportPaymentRecordModel.refreshRecordAggregates error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default TransportPaymentRecordModel;

