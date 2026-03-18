// src/modules/procurement/controllers/MpMilkController.js
import { MpMilkModel } from "../models/MpMilkModel.js";

export const MpMilkController = {
  async saveMilkEntries(req, res) {
    const { mp_id = null, date, items = [] } = req.body || {};
    if (!date) return res.status(400).json({ ok: false, error: "Missing date" });

    const normalized = (Array.isArray(items) ? items : [])
      .map((i) => ({
        rccId: i.rccId ? Number(i.rccId) : null,
        milkType: i.milkType || "A2",
        qty: Number(i.qty || 0),
        fat: i.fat != null ? Number(i.fat) : null,
        snf: i.snf != null ? Number(i.snf) : null,
        clr: i.clr != null ? Number(i.clr) : null,
        water: i.water != null ? Number(i.water) : null,
        date,
      }))
      .filter((row) => row.rccId && Number(row.qty) > 0);

    const context = {
      mp_id: mp_id ? Number(mp_id) : req.user?.scope?.mp_id || 1,
    };

    // Delete existing entries for this date and MP to avoid duplicate key errors
    await MpMilkModel.deleteMilkEntries({ mp_id: context.mp_id, date });

    const result = await MpMilkModel.createMilkEntries(normalized, context);
    return res.json({ ok: true, saved: { count: result.inserted } });
  },

  async listMilkEntries(req, res) {
    try {
      const { date } = req.query || {};
      if (!date) return res.status(400).json({ ok: false, error: "Missing date" });
      const out = await MpMilkModel.listMilkEntries({ date });
      const items = (out.rows || []).map((r) => ({
        id: r.id,
        rcc_id: r.rcc_id,
        rccName: r.rcc_name || "",
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
      return res.status(500).json({ ok: false, error: "Failed to fetch MP milk entries" });
    }
  },

  async updateMilkEntry(req, res) {
    try {
      const { id } = req.params;
      const { milkType, qty, fat, snf, water, clr } = req.body;
      const result = await MpMilkModel.updateMilkEntry({ id, milkType, qty, fat, snf, water, clr });
      return res.json({ ok: result.updated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to update MP milk entry" });
    }
  },

  async deleteMilkEntries(req, res) {
    try {
      const { mp_id, date } = req.query || {};
      if (!mp_id || !date) return res.status(400).json({ ok: false, error: "Missing mp_id/date" });
      const result = await MpMilkModel.deleteMilkEntries({ mp_id, date });
      return res.json({ ok: true, deleted: { count: result.deleted } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete MP milk entries" });
    }
  },
};
