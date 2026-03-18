// src/modules/procurement/controllers/ProcurementController.js
import { ProcurementModels } from "../models/ProcurementModels.js";

export const ProcurementController = {
  async saveMilkEntries(req, res) {
    const { role = "cpp", cpp_id = null, rcc_id = null, date, time, items = [] } = req.body || {};
    if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });

    // Handle different entry types based on role
    let normalized = [];
    if (role === "rcc") {
      // RCC role: save RCC-level data (CPP aggregated data or individual CPP entries)
      normalized = (Array.isArray(items) ? items : [])
        .map((i) => ({
          role,
          date,
          time,
          farmerId: null, // No specific farmer for RCC-level entry
          farmerName: null,
          cppId: i.cppId ? Number(i.cppId) : null, // Individual CPP entry
          rccId: i.rccId ? Number(i.rccId) : null, // Aggregated RCC entry
          milkType: i.milkType || "A2",
          qty: Number(i.qty || 0),
          fat: i.fat != null ? Number(i.fat) : null,
          snf: i.snf != null ? Number(i.snf) : null,
          clr: i.clr != null ? Number(i.clr) : null,
          water: i.water != null ? Number(i.water) : null,
        }))
        .filter((row) => (row.cppId || row.rccId) && Number(row.qty) > 0);
    } else if (role === "mp") {
      // MP role: save MP-level data (RCC aggregated data)
      normalized = (Array.isArray(items) ? items : [])
        .map((i) => ({
          role,
          date,
          time,
          farmerId: null, // No specific farmer for MP-level entry
          farmerName: null,
          cppId: null, // No specific CPP for MP-level entry
          rccId: i.rccId ? Number(i.rccId) : null,
          milkType: i.milkType || "A2",
          qty: Number(i.qty || 0),
          fat: i.fat != null ? Number(i.fat) : null,
          snf: i.snf != null ? Number(i.snf) : null,
          clr: i.clr != null ? Number(i.clr) : null,
          water: i.water != null ? Number(i.water) : null,
        }))
        .filter((row) => row.rccId && Number(row.qty) > 0);
    } else {
      // Other roles: save farmer-level data
      normalized = (Array.isArray(items) ? items : [])
        .map((i) => ({
          role,
          date,
          time,
          farmerId: i.farmerId ? Number(i.farmerId) : null,
          farmerName: i.farmer || "",
          milkType: i.milkType || "A2",
          qty: Number(i.qty || 0),
          fat: i.fat != null ? Number(i.fat) : null,
          snf: i.snf != null ? Number(i.snf) : null,
          clr: i.clr != null ? Number(i.clr) : null,
          water: i.water != null ? Number(i.water) : null,
        }))
        .filter((row) => row.farmerId && Number(row.qty) > 0);
    }

    const context = {
      cpp_id: cpp_id ? Number(cpp_id) : req.user?.scope?.cpp_id || null,
      rcc_id: rcc_id ? Number(rcc_id) : req.user?.scope?.rcc_id || 1, // Default to RCC ID 1 for testing
      mp_id: req.user?.scope?.mp_id || null,
    };
    const result = await ProcurementModels.createMilkEntries(normalized, context);
    return res.json({ ok: true, saved: { count: result.inserted } });
  },
  async listMilkEntries(req, res) {
    try {
      const { cpp_id, date, time } = req.query || {};
      if (!cpp_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing cpp_id/date/time" });
      const out = await ProcurementModels.listMilkEntries({ cpp_id, date, time });
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
      return res.status(500).json({ ok: false, error: "Failed to fetch entries" });
    }
  },
  async listMilkEntriesByRccSummary(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      const scopeRcc = req.user?.scope?.rcc_id || null;
      const useRcc = rcc_id || scopeRcc || null;
      if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });
      const out = await ProcurementModels.listMilkEntriesByRccSummary({ rcc_id: useRcc, date, time });
      const items = (out.rows || []).map((r) => ({
        cppId: r.cpp_id,
        cppName: r.cpp_name || "-",
        milkType: r.milk_type || "-",
        totalQty: Number(r.total_qty || 0),
        fat: r.avg_fat != null ? Number(r.avg_fat) : null,
        snf: r.avg_snf != null ? Number(r.avg_snf) : null,
        clr: r.avg_clr != null ? Number(r.avg_clr) : null,
        water: r.avg_water != null ? Number(r.avg_water) : null,
      }));
      const totalQty = items.reduce((a, b) => a + (Number(b.totalQty) || 0), 0);
      return res.json({ ok: true, items, summary: { cppCount: items.length, totalQty } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC summary" });
    }
  },
  async listRccEntries(req, res) {
    try {
      const { rcc_id, date, time } = req.query || {};
      const scopeRcc = req.user?.scope?.rcc_id || null;
      const useRcc = rcc_id || scopeRcc || null;
      if (!date || !time) return res.status(400).json({ ok: false, error: "Missing date/time" });
      const result = await ProcurementModels.listRccEntries({ rcc_id: useRcc, date, time });
      return res.json({ ok: true, items: result.rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC entries" });
    }
  },

  async listMpEntries(req, res) {
    try {
      const { date } = req.query || {};
      if (!date) return res.status(400).json({ ok: false, error: "Missing date" });
      const result = await ProcurementModels.listMpEntries({ date });
      return res.json({ ok: true, items: result.rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to fetch MP entries" });
    }
  },

  async listRccSummaryForMp(req, res) {
    try {
      const { date } = req.query || {};
      if (!date) return res.status(400).json({ ok: false, error: "Missing date" });
      const result = await ProcurementModels.listRccSummaryForMp({ date });
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
      return res.status(500).json({ ok: false, error: "Failed to fetch RCC summary" });
    }
  },

  async updateMilkEntry(req, res) {
    try {
      const { id } = req.params;
      const { milkType, qty, fat, snf, water, clr } = req.body;

      if (!id) return res.status(400).json({ ok: false, error: "Missing entry ID" });

      const result = await ProcurementModels.updateMilkEntry({
        id: Number(id),
        milkType,
        qty: Number(qty),
        fat: fat ? Number(fat) : null,
        snf: snf ? Number(snf) : null,
        clr: clr ? Number(clr) : null,
        water: water ? Number(water) : null,
      });

      return res.json({ ok: true, result });
    } catch (e) {
      console.error("Error updating milk entry:", e);
      return res.status(500).json({ ok: false, error: "Failed to update entry" });
    }
  },
  async deleteMilkEntry(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const out = await ProcurementModels.deleteMilkEntry(id);
      return res.json({ ok: true, deleted: out.deleted });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete entry" });
    }
  },
  async deleteMilkEntriesByFilter(req, res) {
    try {
      const { cpp_id, date, time } = req.query || {};
      if (!cpp_id || !date || !time) return res.status(400).json({ ok: false, error: "Missing cpp_id/date/time" });
      const out = await ProcurementModels.deleteMilkEntriesByFilter({ cpp_id, date, time });
      return res.json({ ok: true, deleted: out.deleted });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Failed to delete entries" });
    }
  },
};
