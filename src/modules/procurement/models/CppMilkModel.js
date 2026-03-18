// src/modules/procurement/models/CppMilkModel.js
import pool from "../../../db/pool.js";

export const CppMilkModel = {
  async createMilkEntries(entries, context) {
    if (!pool) return { inserted: 0 };
    if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0 };

    const values = [];
    const params = [];

    for (const entry of entries) {
      values.push("(?,?,?,?,?,?,?,?,?,?,?)");
      params.push(entry.farmerId, context.cpp_id, entry.date, entry.time, entry.milkType || "A2", Number(entry.qty || 0), entry.fat != null ? Number(entry.fat) : null, entry.snf != null ? Number(entry.snf) : null, entry.water != null ? Number(entry.water) : null, entry.clr != null ? Number(entry.clr) : null, "accepted");
    }

    const sql = `INSERT INTO milk_entries_cpp 
      (farmer_id, cpp_id, date, time, milk_type, qty_litres, fat, snf, water_pct, clr, status)
      VALUES ${values.join(",")}`;

    const [result] = await pool.query(sql, params);
    return { inserted: result.affectedRows };
  },

  async upsertMilkEntries(entries, context) {
    if (!pool) return { inserted: 0, updated: 0 };
    if (!Array.isArray(entries) || entries.length === 0) return { inserted: 0, updated: 0 };

    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const farmerId = entry.farmerId ? Number(entry.farmerId) : null;
      if (!farmerId || !context.cpp_id || !entry.date || !entry.time) continue;

      // Check if an entry exists for the same farmer, cpp, date, time (and milk_type)
      const [existingRows] = await pool.query(
        `SELECT id FROM milk_entries_cpp 
         WHERE farmer_id = ? AND cpp_id = ? AND date = ? AND time = ? AND COALESCE(milk_type, 'A2') = COALESCE(?, 'A2')
         ORDER BY id DESC LIMIT 1`,
        [farmerId, context.cpp_id, entry.date, entry.time, entry.milkType || "A2"],
      );

      if (existingRows && existingRows.length > 0) {
        // Update existing record
        const id = existingRows[0].id;
        await pool.query(
          `UPDATE milk_entries_cpp
           SET milk_type = ?, qty_litres = ?, fat = ?, snf = ?, water_pct = ?, clr = ?, status = 'accepted'
           WHERE id = ?`,
          [
            entry.milkType || "A2",
            Number(entry.qty || 0),
            entry.fat != null ? Number(entry.fat) : null,
            entry.snf != null ? Number(entry.snf) : null,
            entry.water != null ? Number(entry.water) : null,
            entry.clr != null ? Number(entry.clr) : null,
            Number(id),
          ],
        );
        updated += 1;
      } else {
        // Insert new record
        await pool.query(
          `INSERT INTO milk_entries_cpp
           (farmer_id, cpp_id, date, time, milk_type, qty_litres, fat, snf, water_pct, clr, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`,
          [
            farmerId,
            context.cpp_id,
            entry.date,
            entry.time,
            entry.milkType || "A2",
            Number(entry.qty || 0),
            entry.fat != null ? Number(entry.fat) : null,
            entry.snf != null ? Number(entry.snf) : null,
            entry.water != null ? Number(entry.water) : null,
            entry.clr != null ? Number(entry.clr) : null,
          ],
        );
        inserted += 1;
      }
    }

    return { inserted, updated };
  },

  async listMilkEntries({ cpp_id, date, time }) {
    if (!pool) return { rows: [] };
    if (!cpp_id || !date || !time) return { rows: [] };

    const sql = `
      SELECT e.id, e.farmer_id, e.milk_type, e.qty_litres AS qty, e.fat, e.snf, e.water_pct AS water, e.clr, e.status,
             f.name AS farmer_name
      FROM milk_entries_cpp e
      LEFT JOIN farmers f ON f.id = e.farmer_id
      WHERE e.cpp_id = ? AND e.date = ? AND e.time = ?
      ORDER BY e.id DESC
    `;
    const [rows] = await pool.query(sql, [Number(cpp_id), date, time]);
    return { rows };
  },

  async listCppSummary({ rcc_id, date, time }) {
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
      where.push("cp.rcc_id = ?");
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
      FROM milk_entries_cpp e
      LEFT JOIN cpp cp ON cp.id = e.cpp_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY cp.id, cp.name
      ORDER BY cp.id ASC
    `;
    const [rows] = await pool.query(sql, params);
    return { rows };
  },

  async updateMilkEntry({ id, milkType, qty, fat, snf, clr, water }) {
    if (!pool) return { updated: false };
    if (!id) return { updated: false };

    const sql = `
      UPDATE milk_entries_cpp
      SET milk_type = ?, qty_litres = ?, fat = ?, snf = ?, water_pct = ?, clr = ?, status = 'accepted'
      WHERE id = ?
    `;
    const [result] = await pool.query(sql, [milkType, qty, fat, snf, water, clr, Number(id)]);
    return { updated: result.affectedRows > 0 };
  },

  async deleteMilkEntry({ id }) {
    if (!pool) return { deleted: false };
    if (!id) return { deleted: false };
    const [res] = await pool.query("DELETE FROM milk_entries_cpp WHERE id = ?", [Number(id)]);
    return { deleted: res.affectedRows > 0 };
  },

  async updateEntriesStatus({ cpp_id, date, time, status }) {
    if (!pool) return { updated: false };
    if (!cpp_id || !date || !time || !status) return { updated: false };
    const allowed = ["accepted", "editing"];
    if (!allowed.includes(status)) return { updated: false };
    const [result] = await pool.query(
      `UPDATE milk_entries_cpp SET status = ? WHERE cpp_id = ? AND date = ? AND time = ?`,
      [status, Number(cpp_id), date, time],
    );
    return { updated: result.affectedRows > 0 };
  },

  async deleteMilkEntries({ cpp_id, date, time }) {
    if (!pool) return { deleted: 0 };
    if (!cpp_id || !date || !time) return { deleted: 0 };
    const [res] = await pool.query("DELETE FROM milk_entries_cpp WHERE cpp_id = ? AND date = ? AND time = ?", [Number(cpp_id), date, time]);
    return { deleted: res.affectedRows || 0 };
  },

  async getMonthlyData({ cpp_id, month, year, period }) {
    if (!pool) return [];
    if (!cpp_id || !month || !year || !period) return [];

    // Calculate date range based on period
    const startDay = period === "H1" ? 1 : 16;
    const endDay = period === "H1" ? 15 : new Date(year, month, 0).getDate();

    const startDate = `${year}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

    // Get all dates in the period
    const dates = [];
    for (let day = startDay; day <= endDay; day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates.push(date);
    }

    // Get aggregated data for each date
    const monthlyData = [];

    for (const date of dates) {
      // Get morning data
      const [morningRows] = await pool.query(
        `
        SELECT 
          SUM(qty_litres) as total_qty,
          AVG(fat) as avg_fat,
          AVG(snf) as avg_snf,
          AVG(water_pct) as avg_water,
          AVG(clr) as avg_clr,
          COUNT(*) as entry_count,
          CASE 
            WHEN COUNT(*) > 0 THEN 'accepted'
            ELSE 'no data'
          END as status
        FROM milk_entries_cpp 
        WHERE cpp_id = ? AND date = ? AND time = 'morning'
      `,
        [cpp_id, date],
      );

      // Get evening data
      const [eveningRows] = await pool.query(
        `
        SELECT 
          SUM(qty_litres) as total_qty,
          AVG(fat) as avg_fat,
          AVG(snf) as avg_snf,
          AVG(water_pct) as avg_water,
          AVG(clr) as avg_clr,
          COUNT(*) as entry_count,
          CASE 
            WHEN COUNT(*) > 0 THEN 'accepted'
            ELSE 'no data'
          END as status
        FROM milk_entries_cpp 
        WHERE cpp_id = ? AND date = ? AND time = 'evening'
      `,
        [cpp_id, date],
      );

      const morningData = morningRows[0] || { total_qty: 0, avg_fat: 0, avg_snf: 0, avg_water: 0, avg_clr: 0, status: "no data" };
      const eveningData = eveningRows[0] || { total_qty: 0, avg_fat: 0, avg_snf: 0, avg_water: 0, avg_clr: 0, status: "no data" };

      monthlyData.push({
        date,
        morning: {
          total_qty: morningData.total_qty || 0,
          avg_fat: morningData.avg_fat || 0,
          avg_snf: morningData.avg_snf || 0,
          avg_water: morningData.avg_water || 0,
          avg_clr: morningData.avg_clr || 0,
          status: morningData.status,
        },
        evening: {
          total_qty: eveningData.total_qty || 0,
          avg_fat: eveningData.avg_fat || 0,
          avg_snf: eveningData.avg_snf || 0,
          avg_water: eveningData.avg_water || 0,
          avg_clr: eveningData.avg_clr || 0,
          status: eveningData.status,
        },
      });
    }

    return monthlyData;
  },
};
