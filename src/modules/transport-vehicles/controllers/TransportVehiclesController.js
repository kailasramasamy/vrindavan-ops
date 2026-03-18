import { TransportVehicleModel } from "../models/TransportVehicleModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class TransportVehiclesController {
  static async renderVehiclesPage(req, res) {
    try {
      const seo = buildSEO({ title: "Transport Vehicles Management — Ops", url: req.path });
      const statsResult = await TransportVehicleModel.getSummaryStats();
      const stats = statsResult.success ? statsResult.stats : { total: 0, active: 0, inactive: 0, retired: 0, totalMonthlyCost: 0 };

      res.render("pages/ops/transport-vehicles/index", {
        seo,
        pageKey: "ops/transport-vehicles/index",
        promo: false,
        user: req.user,
        stats,
      });
    } catch (error) {
      console.error("TransportVehiclesController.renderVehiclesPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Transport Vehicles — Error" },
        pageKey: "ops/transport-vehicles/error",
        promo: false,
        user: req.user,
        title: "Unable to load Transport Vehicles",
        message: "Something went wrong while loading the Transport Vehicles module.",
        error,
      });
    }
  }

  // API Routes
  static async listVehicles(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", vehicleType = "", status = "" } = req.query;
      const result = await TransportVehicleModel.listVehicles({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        vehicleType: vehicleType || null,
        status: status || null,
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list vehicles" });
      }
      return res.json({ success: true, vehicles: result.vehicles, total: result.total });
    } catch (error) {
      console.error("TransportVehiclesController.listVehicles error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getVehicleById(req, res) {
    try {
      const { vehicleId } = req.params;
      const result = await TransportVehicleModel.getVehicleById(vehicleId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Vehicle not found" });
      }
      return res.json({ success: true, vehicle: result.vehicle });
    } catch (error) {
      console.error("TransportVehiclesController.getVehicleById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createVehicle(req, res) {
    try {
      const vehicleData = req.body;
      const result = await TransportVehicleModel.createVehicle(vehicleData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to create vehicle" });
      }
      return res.json({ success: true, vehicle: result.vehicle });
    } catch (error) {
      console.error("TransportVehiclesController.createVehicle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateVehicle(req, res) {
    try {
      const { vehicleId } = req.params;
      const vehicleData = req.body;
      const result = await TransportVehicleModel.updateVehicle(vehicleId, vehicleData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to update vehicle" });
      }
      return res.json({ success: true, vehicle: result.vehicle });
    } catch (error) {
      console.error("TransportVehiclesController.updateVehicle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteVehicle(req, res) {
    try {
      const { vehicleId } = req.params;
      const result = await TransportVehicleModel.deleteVehicle(vehicleId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to delete vehicle" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("TransportVehiclesController.deleteVehicle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getSummaryStats(req, res) {
    try {
      const result = await TransportVehicleModel.getSummaryStats();
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to get summary stats" });
      }
      return res.json({ success: true, stats: result.stats });
    } catch (error) {
      console.error("TransportVehiclesController.getSummaryStats error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default TransportVehiclesController;

