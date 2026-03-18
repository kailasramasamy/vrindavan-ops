// src/modules/procurement/models/RccMilkModel.js
import pool from "../../../db/pool.js";

export const RccMilkModel = {
  async createMilkEntries(entries, context) {
    if (!pool) return { inserted: 0 };
    if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0 };

    const values = [];
    const params = [];

    const normalizeMilkType = (mt) => {
      if (!mt) return "A2";
      const v = String(mt).trim();
      const lc = v.toLowerCase();
      if (lc.startsWith("buff")) return "Buffalo"; // Persist as Buffalo (schema will allow)
      if (v === "A1" || v === "A2") return v;
      return v;
    };

    for (const entry of entries) {
      values.push("(?,?,?,?,?,?,?,?,?,?,?)");
      params.push(entry.cppId, context.rcc_id, entry.date, entry.time, normalizeMilkType(entry.milkType || "A2"), Number(entry.qty || 0), entry.fat != null ? Number(entry.fat) : null, entry.snf != null ? Number(entry.snf) : null, entry.water != null ? Number(entry.water) : null, entry.clr != null ? Number(entry.clr) : null, "accepted");
    }

    const sql = `INSERT INTO milk_entries_rcc 
      (cpp_id, rcc_id, date, time, milk_type, qty_litres, fat, snf, water_pct, clr, status)
      VALUES ${values.join(",")}`;

    const [result] = await pool.query(sql, params);
    return { inserted: result.affectedRows };
  },

  async listMilkEntries({ rcc_id, date, time }) {
    if (!pool) return { rows: [] };
    if (!rcc_id || !date || !time) return { rows: [] };

    let whereClause;
    let params;

    if (time === "day") {
      whereClause = "e.rcc_id = ? AND e.date = ? AND e.time IN ('morning', 'evening')";
      params = [Number(rcc_id), date];
    } else {
      whereClause = "e.rcc_id = ? AND e.date = ? AND e.time = ?";
      params = [Number(rcc_id), date, time];
    }

    const sql = `
      SELECT e.id, e.cpp_id, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr, e.status, e.time AS entry_time,
             cp.name AS cpp_name
      FROM milk_entries_rcc e
      LEFT JOIN cpp cp ON cp.id = e.cpp_id
      WHERE ${whereClause}
      ORDER BY e.cpp_id, e.time, e.id DESC
    `;
    const [rows] = await pool.query(sql, params);
    return { rows };
  },

  async listRccSummary({ rcc_id, date, time }) {
    if (!pool) return { rows: [] };
    if (!date || !time) return { rows: [] };

    const where = [];
    const params = [];
    where.push("e.date = ?");
    params.push(date);

    // Handle day aggregation - include both morning and evening data
    if (time === "day") {
      where.push("e.time IN ('morning', 'evening')");
    } else {
      where.push("e.time = ?");
      params.push(time);
    }

    if (rcc_id) {
      where.push("e.rcc_id = ?");
      params.push(Number(rcc_id));
    }

    const sql = `
      SELECT
        cp.id AS cpp_id,
        cp.name AS cpp_name,
        CASE WHEN COUNT(DISTINCT e.milk_type) = 1 THEN MAX(e.milk_type) ELSE 'Mixed' END AS milk_type,
        COALESCE(SUM(e.qty_litres), 0) AS total_qty,
        CAST(SUM(COALESCE(e.fat,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_fat,
        CAST(SUM(COALESCE(e.snf,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_snf,
        CAST(SUM(COALESCE(e.clr,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_clr,
        CAST(SUM(COALESCE(e.water_pct,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_water
      FROM milk_entries_rcc e
      LEFT JOIN cpp cp ON cp.id = e.cpp_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY cp.id, cp.name
      ORDER BY cp.id ASC
    `;
    const [rows] = await pool.query(sql, params);
    return { rows };
  },

  async listRccSummaryForMp({ date }) {
    if (!pool) return { rows: [] };
    if (!date) return { rows: [] };

    const sql = `
      SELECT
        r.id AS rcc_id,
        r.name AS rcc_name,
        CASE WHEN COUNT(DISTINCT e.milk_type) = 1 THEN MAX(e.milk_type) ELSE 'Mixed' END AS milk_type,
        COALESCE(SUM(e.qty_litres), 0) AS total_qty,
        CAST(SUM(COALESCE(e.fat,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_fat,
        CAST(SUM(COALESCE(e.snf,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_snf,
        CAST(SUM(COALESCE(e.clr,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_clr,
        CAST(SUM(COALESCE(e.water_pct,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_water
      FROM milk_entries_rcc e
      LEFT JOIN rcc r ON r.id = e.rcc_id
      WHERE e.date = ?
      GROUP BY r.id, r.name
      ORDER BY r.name
    `;
    const [rows] = await pool.query(sql, [date]);
    return { rows };
  },

  async updateMilkEntry({ id, milkType, qty, fat, snf, clr, water }) {
    if (!pool) return { updated: false };
    if (!id) return { updated: false };

    const sql = `
      UPDATE milk_entries_rcc
      SET milk_type = ?, qty_litres = ?, fat = ?, snf = ?, water_pct = ?, clr = ?, status = 'accepted'
      WHERE id = ?
    `;
    const mt = (function (m) {
      if (!m) return "A2";
      const v = String(m).trim();
      const lc = v.toLowerCase();
      if (lc.startsWith("buff")) return "Buffalo";
      if (v === "A1" || v === "A2") return v;
      return v;
    })(milkType);
    const [result] = await pool.query(sql, [mt, qty, fat, snf, water, clr, Number(id)]);
    return { updated: result.affectedRows > 0 };
  },

  async deleteMilkEntries({ rcc_id, date, time }) {
    if (!pool) return { deleted: 0 };
    if (!rcc_id || !date || !time) return { deleted: 0 };
    const [res] = await pool.query("DELETE FROM milk_entries_rcc WHERE rcc_id = ? AND date = ? AND time = ?", [Number(rcc_id), date, time]);
    return { deleted: res.affectedRows || 0 };
  },
};
