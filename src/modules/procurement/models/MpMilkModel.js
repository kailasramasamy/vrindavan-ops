// src/modules/procurement/models/MpMilkModel.js
import pool from "../../../db/pool.js";

export const MpMilkModel = {
  async createMilkEntries(entries, context) {
    if (!pool) return { inserted: 0 };
    if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0 };

    const values = [];
    const params = [];

    for (const entry of entries) {
      values.push("(?,?,?,?,?,?,?,?,?,?)");
      params.push(entry.rccId, context.mp_id, entry.date, entry.milkType || "A2", Number(entry.qty || 0), entry.fat != null ? Number(entry.fat) : null, entry.snf != null ? Number(entry.snf) : null, entry.clr != null ? Number(entry.clr) : null, entry.water != null ? Number(entry.water) : null, "accepted");
    }

    const sql = `INSERT INTO milk_entries_mp 
      (rcc_id, mp_id, date, milk_type, qty_litres, fat, snf, water_pct, clr, status)
      VALUES ${values.join(",")}`;

    const [result] = await pool.query(sql, params);
    return { inserted: result.affectedRows };
  },

  async listMilkEntries({ date }) {
    if (!pool) return { rows: [] };
    if (!date) return { rows: [] };

    const sql = `
      SELECT e.id, e.rcc_id, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr, e.status,
             r.name AS rcc_name
      FROM milk_entries_mp e
      LEFT JOIN rcc r ON r.id = e.rcc_id
      WHERE e.date = ?
      ORDER BY e.id DESC
    `;
    const [rows] = await pool.query(sql, [date]);
    return { rows };
  },

  async updateMilkEntry({ id, milkType, qty, fat, snf, clr, water }) {
    if (!pool) return { updated: false };
    if (!id) return { updated: false };

    const sql = `
      UPDATE milk_entries_mp
      SET milk_type = ?, qty_litres = ?, fat = ?, snf = ?, water_pct = ?, clr = ?, status = 'accepted'
      WHERE id = ?
    `;
    const [result] = await pool.query(sql, [milkType, qty, fat, snf, water, clr, Number(id)]);
    return { updated: result.affectedRows > 0 };
  },

  async deleteMilkEntries({ mp_id, date }) {
    if (!pool) return { deleted: 0 };
    if (!mp_id || !date) return { deleted: 0 };
    const [res] = await pool.query("DELETE FROM milk_entries_mp WHERE mp_id = ? AND date = ?", [Number(mp_id), date]);
    return { deleted: res.affectedRows || 0 };
  },
};
