// src/modules/procurement/models/ProcurementModels.js
// Stubs for Phase 1 models; wire to src/db/pool.js when USE_DB=true
import pool from "../../../db/pool.js";

export const ProcurementModels = {
  async createMilkEntries(entries = [], context = {}) {
    if (!entries || entries.length === 0) return { inserted: 0 };
    if (!pool) return { inserted: entries.length, note: "DB disabled (USE_DB=false). Dry-run only." };
    const cppId = context.cpp_id || null;
    let rccId = context.rcc_id || null;
    let mpId = context.mp_id || null;

    // Try to resolve rcc/mp from cpp
    if (!rccId && cppId) {
      try {
        const [rows] = await pool.query("SELECT rcc_id FROM cpp WHERE id = ? LIMIT 1", [cppId]);
        rccId = rows?.[0]?.rcc_id || null;
      } catch (_) {}
    }

    // Build insert
    const values = [];
    const params = [];
    for (const it of entries) {
      values.push("(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      // Use cppId from the entry if available (for RCC-level entries), otherwise use context cppId
      const entryCppId = it.cppId || cppId;
      // Use rccId from the entry if available (for MP-level entries), otherwise use context rccId
      const entryRccId = it.rccId || rccId;
      const status = it.role === "rcc" || it.role === "mp" ? "accepted" : "pending";
      params.push(it.role || "cpp", status, it.date, it.time, it.farmerId || null, entryCppId, entryRccId, mpId, it.milkType || "A2", Number(it.qty || 0), it.fat != null ? Number(it.fat) : null, it.snf != null ? Number(it.snf) : null, it.water != null ? Number(it.water) : null, it.clr != null ? Number(it.clr) : null);
    }

    const sql = `INSERT INTO milk_entries 
      (role, status, date, time, farmer_id, cpp_id, rcc_id, mp_id, milk_type, qty_litres, fat, snf, water_pct, clr)
      VALUES ${values.join(",")}`;

    const [result] = await pool.query(sql, params);
    return { inserted: result.affectedRows || entries.length };
  },
  async listMilkEntries({ cpp_id, date, time }) {
    if (!pool) return { rows: [] };
    if (!cpp_id || !date || !time) return { rows: [] };
    const sql = `
      SELECT e.id, e.date, e.time, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr,
             f.name AS farmer_name, e.farmer_id
      FROM milk_entries e
      LEFT JOIN farmers f ON f.id = e.farmer_id
      WHERE e.cpp_id = ? AND e.date = ? AND e.time = ?
      ORDER BY e.id DESC
    `;
    const [rows] = await pool.query(sql, [Number(cpp_id), date, time]);
    return { rows };
  },
  async updateMilkEntry(id, fields = {}) {
    if (!pool) return { updated: 0 };
    const allowed = {
      milk_type: "milk_type",
      qty: "qty_litres",
      qty_litres: "qty_litres",
      fat: "fat",
      snf: "snf",
      clr: "clr",
      water: "water_pct",
      water_pct: "water_pct",
    };
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields || {})) {
      const col = allowed[k];
      if (!col) continue;
      sets.push(`${col} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return { updated: 0 };
    params.push(Number(id));
    const sql = `UPDATE milk_entries SET ${sets.join(", ")} WHERE id = ?`;
    const [res] = await pool.query(sql, params);
    return { updated: res.affectedRows || 0 };
  },
  async deleteMilkEntry(id) {
    if (!pool) return { deleted: 0 };
    const [res] = await pool.query("DELETE FROM milk_entries WHERE id = ? LIMIT 1", [Number(id)]);
    return { deleted: res.affectedRows || 0 };
  },
  async deleteMilkEntriesByFilter({ cpp_id, date, time }) {
    if (!pool) return { deleted: 0 };
    if (!cpp_id || !date || !time) return { deleted: 0 };
    const [res] = await pool.query("DELETE FROM milk_entries WHERE cpp_id = ? AND date = ? AND time = ?", [Number(cpp_id), date, time]);
    return { deleted: res.affectedRows || 0 };
  },
  async listRccEntries({ rcc_id, date, time }) {
    if (!pool) return { rows: [] };
    if (!rcc_id || !date || !time) return { rows: [] };
    const sql = `
      SELECT e.id, e.cpp_id, e.rcc_id, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr, e.status,
             cp.name AS cpp_name, r.name AS rcc_name
      FROM milk_entries e
      LEFT JOIN cpp cp ON cp.id = e.cpp_id
      LEFT JOIN rcc r ON r.id = e.rcc_id
      WHERE e.rcc_id = ? AND e.date = ? AND e.time = ? AND e.role = 'rcc'
      ORDER BY e.id DESC
    `;
    const [rows] = await pool.query(sql, [Number(rcc_id), date, time]);
    return { rows };
  },

  async listMpEntries({ date, time }) {
    if (!pool) return { rows: [] };
    if (!date) return { rows: [] };
    // Ignore time filter for MP entries - aggregate daily data
    const sql = `
      SELECT e.id, e.rcc_id, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr, e.status,
             r.name AS rcc_name
      FROM milk_entries e
      LEFT JOIN rcc r ON r.id = e.rcc_id
      WHERE e.date = ? AND e.role = 'mp'
      ORDER BY e.id DESC
    `;
    const [rows] = await pool.query(sql, [date]);
    return { rows };
  },

  async listRccSummaryForMp({ date, time }) {
    if (!pool) return { rows: [] };
    if (!date) return { rows: [] };
    // Show RCC-level data (both aggregated and individual CPP entries) that hasn't been processed by MP yet
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
      FROM milk_entries e
      LEFT JOIN rcc r ON r.id = e.rcc_id
      WHERE e.date = ? AND e.role = 'rcc'
        AND NOT EXISTS (
          SELECT 1 FROM milk_entries mp 
          WHERE mp.date = e.date 
            AND mp.role = 'mp' 
            AND mp.rcc_id = e.rcc_id
        )
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
      UPDATE milk_entries 
      SET milk_type = ?, qty_litres = ?, fat = ?, snf = ?, water_pct = ?, clr = ?, status = 'accepted'
      WHERE id = ? AND (role = 'rcc' OR role = 'mp')
    `;

    const [result] = await pool.query(sql, [milkType, qty, fat, snf, water, clr, Number(id)]);
    return { updated: result.affectedRows > 0 };
  },

  async listMilkEntriesByRccSummary({ rcc_id = null, date, time }) {
    if (!pool) return { rows: [] };
    if (!date || !time) return { rows: [] };
    const where = [];
    const params = [];
    where.push("e.date = ?");
    params.push(date);
    where.push("e.time = ?");
    params.push(time);
    where.push("e.role IN ('cpp', 'rcc')"); // Only include CPP and RCC level data, not MP
    if (rcc_id) {
      where.push("e.rcc_id = ?");
      params.push(Number(rcc_id));
    }
    const sql = `
      SELECT
        c.id AS cpp_id,
        c.name AS cpp_name,
        CASE WHEN COUNT(DISTINCT e.milk_type) = 1 THEN MAX(e.milk_type) ELSE 'Mixed' END AS milk_type,
        COALESCE(SUM(e.qty_litres), 0) AS total_qty,
        CAST(SUM(COALESCE(e.fat,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_fat,
        CAST(SUM(COALESCE(e.snf,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_snf,
        CAST(SUM(COALESCE(e.clr,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_clr,
        CAST(SUM(COALESCE(e.water_pct,0) * e.qty_litres) / NULLIF(SUM(e.qty_litres), 0) AS DECIMAL(5,1)) AS avg_water
      FROM milk_entries e
      LEFT JOIN cpp c ON c.id = e.cpp_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY c.id, c.name
      ORDER BY c.id ASC
    `;
    const [rows] = await pool.query(sql, params);
    return { rows };
  },
};
