import { ItServiceModel } from "../models/ItServiceModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class ItServicesController {
  static async renderServicesPage(req, res) {
    try {
      const seo = buildSEO({ title: "IT Services Management — Ops", url: req.path });
      const statsResult = await ItServiceModel.getSummaryStats();
      const stats = statsResult.success ? statsResult.stats : { total: 0, active: 0, inactive: 0, discontinued: 0, totalTypes: 0 };

      res.render("pages/ops/it-services/index", {
        seo,
        pageKey: "ops/it-services/index",
        promo: false,
        user: req.user,
        stats,
      });
    } catch (error) {
      console.error("ItServicesController.renderServicesPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "IT Services — Error" },
        pageKey: "ops/it-services/error",
        promo: false,
        user: req.user,
        title: "Unable to load IT Services",
        message: "Something went wrong while loading the IT Services module.",
        error,
      });
    }
  }

  // API Routes
  static async listServices(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", serviceType = "", status = "" } = req.query;
      const result = await ItServiceModel.listServices({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        serviceType: serviceType || null,
        status: status || null,
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list IT services" });
      }
      return res.json({ success: true, services: result.services, total: result.total });
    } catch (error) {
      console.error("ItServicesController.listServices error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getServiceById(req, res) {
    try {
      const { serviceId } = req.params;
      const result = await ItServiceModel.getServiceById(serviceId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "IT service not found" });
      }
      return res.json({ success: true, service: result.service });
    } catch (error) {
      console.error("ItServicesController.getServiceById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createService(req, res) {
    try {
      const serviceData = req.body;
      const result = await ItServiceModel.createService(serviceData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to create IT service" });
      }
      return res.json({ success: true, service: result.service });
    } catch (error) {
      console.error("ItServicesController.createService error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateService(req, res) {
    try {
      const { serviceId } = req.params;
      const serviceData = req.body;
      const result = await ItServiceModel.updateService(serviceId, serviceData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to update IT service" });
      }
      return res.json({ success: true, service: result.service });
    } catch (error) {
      console.error("ItServicesController.updateService error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteService(req, res) {
    try {
      const { serviceId } = req.params;
      const result = await ItServiceModel.deleteService(serviceId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to delete IT service" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("ItServicesController.deleteService error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getSummaryStats(req, res) {
    try {
      const result = await ItServiceModel.getSummaryStats();
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to get summary stats" });
      }
      return res.json({ success: true, stats: result.stats });
    } catch (error) {
      console.error("ItServicesController.getSummaryStats error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default ItServicesController;

