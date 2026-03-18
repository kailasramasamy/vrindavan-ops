import pool, { opsPool } from "../../../db/pool.js";
import { DeliveryPaymentRecordModel } from "./DeliveryPaymentRecordModel.js";

const opsDb = opsPool || pool;

const ENTRY_TYPES = new Set(["fuel_allowance", "leave", "adjustment", "advance"]);
const DIRECTIONS = new Set(["credit", "debit"]);

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class DeliveryPaymentEntryModel {
  static get db() {
    return opsDb;
  }

  static validateEntry({ entry_type, direction, amount }) {
    if (!ENTRY_TYPES.has(entry_type)) {
      return { success: false, error: `Invalid entry type. Allowed values: ${Array.from(ENTRY_TYPES).join(", ")}` };
    }
    if (!DIRECTIONS.has(direction)) {
      return { success: false, error: `Invalid entry direction. Allowed values: ${Array.from(DIRECTIONS).join(", ")}` };
    }
    if (amount == null || Number.isNaN(Number(amount))) {
      return { success: false, error: "Amount is required for an entry" };
    }
    return { success: true };
  }

  static async listEntries(recordId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT *
         FROM delivery_payment_entries
         WHERE record_id = ?
         ORDER BY created_at DESC, id DESC`,
        [recordId],
      );
      return { success: true, entries: rows };
    } catch (error) {
      console.error("DeliveryPaymentEntryModel.listEntries error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createEntry(recordId, entryData = {}, { userId = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const validation = this.validateEntry(entryData);
    if (!validation.success) {
      return validation;
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const insertSql = `
        INSERT INTO delivery_payment_entries
        (record_id, entry_type, direction, amount, quantity, reason, notes, effective_date, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      const quantity = entryData.quantity != null ? toNumber(entryData.quantity, 3) : null;
      await connection.query(insertSql, [
        recordId,
        entryData.entry_type,
        entryData.direction,
        toNumber(entryData.amount),
        quantity,
        entryData.reason || null,
        entryData.notes || null,
        entryData.effective_date || null,
        userId || null,
        userId || null,
      ]);

      await DeliveryPaymentRecordModel.recalculateAggregates(recordId, connection);
      await connection.commit();

      const refreshedEntries = await this.listEntries(recordId);
      const recordResult = await DeliveryPaymentRecordModel.getRecordById(recordId, connection);
      return {
        success: true,
        entries: refreshedEntries.success ? refreshedEntries.entries : [],
        record: recordResult.success ? recordResult.record : null,
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("DeliveryPaymentEntryModel.createEntry error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  static async deleteEntry(entryId, { userId = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query("SELECT record_id FROM delivery_payment_entries WHERE id = ?", [entryId]);
      if (!rows || rows.length === 0) {
        await connection.rollback();
        return { success: false, error: "Delivery payment entry not found" };
      }
      const recordId = rows[0].record_id;
      await connection.query("DELETE FROM delivery_payment_entries WHERE id = ?", [entryId]);
      await DeliveryPaymentRecordModel.recalculateAggregates(recordId, connection);
      await connection.commit();

      const refreshedEntries = await this.listEntries(recordId);
      const recordResult = await DeliveryPaymentRecordModel.getRecordById(recordId, connection);
      return {
        success: true,
        recordId,
        entries: refreshedEntries.success ? refreshedEntries.entries : [],
        record: recordResult.success ? recordResult.record : null,
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("DeliveryPaymentEntryModel.deleteEntry error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

export default DeliveryPaymentEntryModel;

