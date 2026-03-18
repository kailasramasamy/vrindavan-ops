// src/modules/procurement/controllers/CppMilkController.js
import { CppMilkModel } from "../models/CppMilkModel.js";

export const CppMilkController = {
  async saveMilkEntries(req, res) {
    const { cpp_id = null, date, time, items = [] } = req.body || {};
    if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });

    const normalized = (Array.isArray(items) ? items : [])
      .map((i) => ({
        farmerId: i.farmerId ? Number(i.farmerId) : null,
        farmerName: i.farmer || "",
        milkType: i.milkType || "A2",
        qty: Number(i.qty || 0),
        fat: i.fat != null ? Number(i.fat) : null,
        snf: i.snf != null ? Number(i.snf) : null,
        clr: i.clr != null ? Number(i.clr) : null,
        water: i.water != null ? Number(i.water) : null,
        date,
        time,
      }))
      .filter((row) => row.farmerId && Number(row.qty) > 0);

    const context = {
      cpp_id: cpp_id ? Number(cpp_id) : req.user?.scope?.cpp_id || null,
    };
    const result = await CppMilkModel.upsertMilkEntries(normalized, context);
    return res.json({ ok: true, saved: { inserted: result.inserted, updated: result.updated } });
  },

  async listMilkEntries(req, res) {
    try {
      const { cpp_id, date, time } = req.query || {};
      if (!cpp_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing cpp_id/date/time" });
      const out = await CppMilkModel.listMilkEntries({ cpp_id, date, time });
      const items = (out.rows || []).map((r) => ({
        id: r.id,
        farmerId: r.farmer_id,
        farmerName: r.farmer_name || "",
        milkType: r.milk_type,
        qty: Number(r.qty || 0),
        fat: r.fat != null ? Number(r.fat) : null,
        snf: r.snf != null ? Number(r.snf) : null,
        clr: r.clr != null ? Number(r.clr) : null,
        water: r.water != null ? Number(r.water) : null,
      }));
      const totalQty = items.reduce((a, b) => a + (Number(b.qty) || 0), 0);
      return res.json({ ok: true, items, summary: { count: items.length, totalQty } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch milk entries" });
    }
  },

  async listCppSummary(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });
      const result = await CppMilkModel.listCppSummary({ rcc_id, date, time });
      const items = result.rows.map((row) => ({
        cppId: row.cpp_id,
        cppName: row.cpp_name,
        milkType: row.milk_type,
        totalQty: row.total_qty,
        fat: row.avg_fat,
        snf: row.avg_snf,
        clr: row.avg_clr,
        water: row.avg_water,
      }));
      const totalQty = items.reduce((sum, item) => sum + Number(item.totalQty || 0), 0);
      return res.json({ ok: true, items, summary: { cppCount: items.length, totalQty } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch CPP summary" });
    }
  },

  async updateMilkEntry(req, res) {
    try {
      const { id } = req.params;
      const { milkType, qty, fat, snf, water, clr } = req.body;
      const result = await CppMilkModel.updateMilkEntry({ id, milkType, qty, fat, snf, water, clr });
      return res.json({ ok: result.updated, saved: { id: parseInt(id) } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to update milk entry" });
    }
  },

  async updateEntriesStatus(req, res) {
    try {
      const { cpp_id, date, time, status } = req.body || {};
      if (!cpp_id || !date || !time || !status) return res.status(400).json({ ok: false, error: "Missing cpp_id/date/time/status" });
      const result = await CppMilkModel.updateEntriesStatus({ cpp_id, date, time, status });
      return res.json({ ok: result.updated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to update status" });
    }
  },

  async deleteMilkEntry(req, res) {
    try {
      // Support both URL params and body for backward compatibility
      const id = req.params.id || req.body.id;
      if (!id) return res.status(400).json({ ok: false, error: "Missing entry ID" });
      const result = await CppMilkModel.deleteMilkEntry({ id });
      return res.json({ ok: result.deleted, deleted: { id: parseInt(id) } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete milk entry" });
    }
  },

  async deleteMilkEntries(req, res) {
    try {
      const { cpp_id, date, time } = req.query || {};
      if (!cpp_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing cpp_id/date/time" });
      const result = await CppMilkModel.deleteMilkEntries({ cpp_id, date, time });
      return res.json({ ok: true, deleted: { count: result.deleted } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete milk entries" });
    }
  },

  async getMonthlyData(req, res) {
    try {
      const { cpp_id, month, year, period } = req.query || {};
      if (!cpp_id || !month || !year || !period) {
        return res.status(400).json({ success: false, error: "Missing required parameters: cpp_id, month, year, period" });
      }

      const result = await CppMilkModel.getMonthlyData({
        cpp_id: Number(cpp_id),
        month: Number(month),
        year: Number(year),
        period,
      });

      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("Error fetching monthly data:", error);
      return res.status(500).json({ success: false, error: "Failed to fetch monthly data" });
    }
  },
};
