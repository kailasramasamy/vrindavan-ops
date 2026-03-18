import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class RentPaymentEntryModel {
  static get db() {
    return opsDb;
  }

  static async listEntries(recordId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM rent_payment_entries WHERE record_id = ? ORDER BY entry_date DESC, created_at DESC",
        [recordId],
      );
      return { success: true, entries: rows || [] };
    } catch (error) {
      console.error("RentPaymentEntryModel.listEntries error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getEntryById(entryId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query("SELECT * FROM rent_payment_entries WHERE id = ?", [entryId]);
      if (!rows || rows.length === 0) {
        return { success: false, error: "Rent payment entry not found" };
      }
      return { success: true, entry: rows[0] };
    } catch (error) {
      console.error("RentPaymentEntryModel.getEntryById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createEntry(entryData, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { record_id, entry_type, amount, description, entry_date } = entryData;

      const [result] = await db.query(
        `INSERT INTO rent_payment_entries
         (record_id, entry_type, amount, description, entry_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          record_id,
          entry_type,
          toNumber(amount),
          description || null,
          entry_date || new Date().toISOString().slice(0, 10),
        ],
      );
      return this.getEntryById(result.insertId);
    } catch (error) {
      console.error("RentPaymentEntryModel.createEntry error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateEntry(entryId, entryData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { entry_type, amount, description, entry_date } = entryData;
      const updates = [];
      const params = [];

      if (entry_type !== undefined) {
        updates.push("entry_type = ?");
        params.push(entry_type);
      }
      if (amount !== undefined) {
        updates.push("amount = ?");
        params.push(toNumber(amount));
      }
      if (description !== undefined) {
        updates.push("description = ?");
        params.push(description || null);
      }
      if (entry_date !== undefined) {
        updates.push("entry_date = ?");
        params.push(entry_date || null);
      }

      if (updates.length === 0) {
        return this.getEntryById(entryId);
      }

      updates.push("updated_at = NOW()");
      params.push(entryId);

      await db.query(
        `UPDATE rent_payment_entries SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );
      return this.getEntryById(entryId);
    } catch (error) {
      console.error("RentPaymentEntryModel.updateEntry error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteEntry(entryId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query("DELETE FROM rent_payment_entries WHERE id = ?", [entryId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Rent payment entry not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("RentPaymentEntryModel.deleteEntry error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default RentPaymentEntryModel;

