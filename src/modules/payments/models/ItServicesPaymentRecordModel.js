import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class ItServicesPaymentRecordModel {
  static get db() {
    return opsDb;
  }

  static async getRecordById(recordId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM it_services_payment_records WHERE id = ?", [recordId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "IT services payment record not found" };
      }
      return { success: true, record: rows[0] };
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.getRecordById error:", error);
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
         FROM it_services_payment_records r
         LEFT JOIN (
           SELECT record_id,
                  COUNT(*) AS entry_count
           FROM it_services_payment_entries
           GROUP BY record_id
         ) entry_counts ON entry_counts.record_id = r.id
         ${whereClause}
         ORDER BY r.invoice_date DESC, r.service_name ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );

      return { success: true, records: rows };
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.listRecords error:", error);
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
        service_name,
        service_type,
        invoice_number,
        invoice_date,
        invoice_amount,
        total_adjustments,
        net_pay,
      } = recordData;

      const [result] = await db.query(
        `INSERT INTO it_services_payment_records
         (cycle_id, service_name, service_type, invoice_number, invoice_date, invoice_amount, total_adjustments, net_pay, payment_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [
          cycle_id,
          service_name,
          service_type || 'other',
          invoice_number || null,
          invoice_date || null,
          toNumber(invoice_amount),
          toNumber(total_adjustments),
          toNumber(net_pay),
        ],
      );
      return this.getRecordById(result.insertId, connection);
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.createRecord error:", error);
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
        `UPDATE it_services_payment_records SET ${updates.join(", ")} WHERE id = ?`,
        [...params, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.updateRecordStatus error:", error);
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
        "UPDATE it_services_payment_records SET remarks = ?, updated_at = NOW() WHERE id = ?",
        [remarks || null, recordId],
      );
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.updateRecordRemarks error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateInvoiceDetails(recordId, invoiceData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const updates = [];
      const params = [];

      if (invoiceData.invoice_amount !== undefined) {
        updates.push("invoice_amount = ?");
        params.push(toNumber(invoiceData.invoice_amount));
      }
      if (invoiceData.invoice_number !== undefined) {
        updates.push("invoice_number = ?");
        params.push(invoiceData.invoice_number || null);
      }
      if (invoiceData.invoice_date !== undefined) {
        updates.push("invoice_date = ?");
        params.push(invoiceData.invoice_date || null);
      }

      if (updates.length === 0) {
        return this.getRecordById(recordId);
      }

      updates.push("updated_at = NOW()");
      params.push(recordId);

      await db.query(
        `UPDATE it_services_payment_records SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      // Refresh aggregates after updating invoice amount
      return this.refreshRecordAggregates(recordId);
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.updateInvoiceDetails error:", error);
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
         FROM it_services_payment_entries
         WHERE record_id = ?`,
        [recordId],
      );

      const totalAdjustments = toNumber(entryRows[0]?.total_adjustments || 0);

      const [recordRows] = await db.query(
        "SELECT invoice_amount FROM it_services_payment_records WHERE id = ?",
        [recordId],
      );
      const record = recordRows[0];
      const invoiceAmount = toNumber(record.invoice_amount);
      const netPay = invoiceAmount + totalAdjustments;

      await db.query(
        `UPDATE it_services_payment_records 
         SET total_adjustments = ?,
             net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [totalAdjustments, netPay, recordId],
      );

      return this.getRecordById(recordId, connection);
    } catch (error) {
      console.error("ItServicesPaymentRecordModel.refreshRecordAggregates error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default ItServicesPaymentRecordModel;

