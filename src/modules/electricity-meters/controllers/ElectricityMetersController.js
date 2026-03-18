import { ElectricityMeterModel } from "../models/ElectricityMeterModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class ElectricityMetersController {
  static async renderMetersPage(req, res) {
    try {
      const seo = buildSEO({ title: "Electricity Meters Management — Ops", url: req.path });
      const statsResult = await ElectricityMeterModel.getSummaryStats();
      const stats = statsResult.success ? statsResult.stats : { total: 0, active: 0, inactive: 0, disconnected: 0, totalTypes: 0 };

      res.render("pages/ops/electricity-meters/index", {
        seo,
        pageKey: "ops/electricity-meters/index",
        promo: false,
        user: req.user,
        stats,
      });
    } catch (error) {
      console.error("ElectricityMetersController.renderMetersPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Electricity Meters — Error" },
        pageKey: "ops/electricity-meters/error",
        promo: false,
        user: req.user,
        title: "Unable to load Electricity Meters",
        message: "Something went wrong while loading the Electricity Meters module.",
        error,
      });
    }
  }

  // API Routes
  static async listMeters(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", meterType = "", status = "" } = req.query;
      const result = await ElectricityMeterModel.listMeters({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        meterType: meterType || null,
        status: status || null,
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list electricity meters" });
      }
      return res.json({ success: true, meters: result.meters, total: result.total });
    } catch (error) {
      console.error("ElectricityMetersController.listMeters error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getMeterById(req, res) {
    try {
      const { meterId } = req.params;
      const result = await ElectricityMeterModel.getMeterById(meterId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Electricity meter not found" });
      }
      return res.json({ success: true, meter: result.meter });
    } catch (error) {
      console.error("ElectricityMetersController.getMeterById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createMeter(req, res) {
    try {
      const meterData = req.body;
      const result = await ElectricityMeterModel.createMeter(meterData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to create electricity meter" });
      }
      return res.json({ success: true, meter: result.meter });
    } catch (error) {
      console.error("ElectricityMetersController.createMeter error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateMeter(req, res) {
    try {
      const { meterId } = req.params;
      const meterData = req.body;
      const result = await ElectricityMeterModel.updateMeter(meterId, meterData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to update electricity meter" });
      }
      return res.json({ success: true, meter: result.meter });
    } catch (error) {
      console.error("ElectricityMetersController.updateMeter error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteMeter(req, res) {
    try {
      const { meterId } = req.params;
      const result = await ElectricityMeterModel.deleteMeter(meterId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to delete electricity meter" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("ElectricityMetersController.deleteMeter error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getSummaryStats(req, res) {
    try {
      const result = await ElectricityMeterModel.getSummaryStats();
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to get summary stats" });
      }
      return res.json({ success: true, stats: result.stats });
    } catch (error) {
      console.error("ElectricityMetersController.getSummaryStats error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default ElectricityMetersController;


