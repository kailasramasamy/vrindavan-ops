// src/modules/procurement/controllers/RccMilkController.js
import { RccMilkModel } from "../models/RccMilkModel.js";

export const RccMilkController = {
  async saveMilkEntries(req, res) {
    const { rcc_id = null, date, time, items = [] } = req.body || {};
    if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });

    // Validate time parameter - only accept 'morning' or 'evening'
    if (time !== 'morning' && time !== 'evening') {
      return res.status(400).json({ ok: false, error: "Invalid time parameter. Must be 'morning' or 'evening'" });
    }

    const normalized = (Array.isArray(items) ? items : [])
      .map((i) => ({
        cppId: i.cppId ? Number(i.cppId) : null,
        milkType: i.milkType || "A2",
        qty: Number(i.qty || 0),
        fat: i.fat != null ? Number(i.fat) : null,
        snf: i.snf != null ? Number(i.snf) : null,
        clr: i.clr != null ? Number(i.clr) : null,
        water: i.water != null ? Number(i.water) : null,
        date,
        time,
      }))
      .filter((row) => row.cppId && Number(row.qty) > 0);

    const context = {
      rcc_id: rcc_id ? Number(rcc_id) : req.user?.scope?.rcc_id || 1,
    };
    const result = await RccMilkModel.createMilkEntries(normalized, context);
    return res.json({ ok: true, saved: { count: result.inserted } });
  },

  async listMilkEntries(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      if (!rcc_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing rcc_id/date/time" });
      const out = await RccMilkModel.listMilkEntries({ rcc_id, date, time });
      const items = (out.rows || []).map((r) => ({
        id: r.id,
        cpp_id: r.cpp_id,
        cppName: r.cpp_name || "",
        milkType: r.milk_type,
        qty: Number(r.qty || 0),
        fat: r.fat != null ? Number(r.fat) : null,
        snf: r.snf != null ? Number(r.snf) : null,
        clr: r.clr != null ? Number(r.clr) : null,
        water: r.water != null ? Number(r.water) : null,
        status: r.status,
      }));
      const totalQty = items.reduce((a, b) => a + (Number(b.qty) || 0), 0);
      return res.json({ ok: true, items, summary: { count: items.length, totalQty } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC milk entries" });
    }
  },

  async listRccSummary(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });
      const result = await RccMilkModel.listRccSummary({ rcc_id, date, time });
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
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC summary" });
    }
  },

  async listRccSummaryForMp(req, res) {
    try {
      const { date } = req.query || {};
      if (!date) return res.status(400).json({ ok: false, error: "Missing date" });
      const result = await RccMilkModel.listRccSummaryForMp({ date });
      const items = result.rows.map((row) => ({
        rccId: row.rcc_id,
        rccName: row.rcc_name,
        milkType: row.milk_type,
        totalQty: row.total_qty,
        fat: row.avg_fat,
        snf: row.avg_snf,
        clr: row.avg_clr,
        water: row.avg_water,
      }));
      const totalQty = items.reduce((sum, item) => sum + Number(item.totalQty || 0), 0);
      return res.json({ ok: true, items, summary: { rccCount: items.length, totalQty } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC summary for MP" });
    }
  },

  async updateMilkEntry(req, res) {
    try {
      const { id } = req.params;
      const { milkType, qty, fat, snf, water, clr } = req.body;
      const result = await RccMilkModel.updateMilkEntry({ id, milkType, qty, fat, snf, water, clr });
      return res.json({ ok: result.updated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to update RCC milk entry" });
    }
  },

  async deleteMilkEntries(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      if (!rcc_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing rcc_id/date/time" });
      const result = await RccMilkModel.deleteMilkEntries({ rcc_id, date, time });
      return res.json({ ok: true, deleted: { count: result.deleted } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete RCC milk entries" });
    }
  },
};
