import { RentalPropertyModel } from "../models/RentalPropertyModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class RentalPropertiesController {
  static async renderPropertiesPage(req, res) {
    try {
      const seo = buildSEO({ title: "Rental Properties Management — Ops", url: req.path });
      const statsResult = await RentalPropertyModel.getSummaryStats();
      const stats = statsResult.success ? statsResult.stats : { total: 0, active: 0, inactive: 0, terminated: 0, totalMonthlyRent: 0 };

      res.render("pages/ops/rental-properties/index", {
        seo,
        pageKey: "ops/rental-properties/index",
        promo: false,
        user: req.user,
        stats,
      });
    } catch (error) {
      console.error("RentalPropertiesController.renderPropertiesPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Rental Properties — Error" },
        pageKey: "ops/rental-properties/error",
        promo: false,
        user: req.user,
        title: "Unable to load Rental Properties",
        message: "Something went wrong while loading the Rental Properties module.",
        error,
      });
    }
  }

  // API Routes
  static async listProperties(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", propertyType = "", status = "" } = req.query;
      const result = await RentalPropertyModel.listProperties({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        propertyType: propertyType || null,
        status: status || null,
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list properties" });
      }
      return res.json({ success: true, properties: result.properties, total: result.total });
    } catch (error) {
      console.error("RentalPropertiesController.listProperties error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getPropertyById(req, res) {
    try {
      const { propertyId } = req.params;
      const result = await RentalPropertyModel.getPropertyById(propertyId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Property not found" });
      }
      return res.json({ success: true, property: result.property });
    } catch (error) {
      console.error("RentalPropertiesController.getPropertyById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createProperty(req, res) {
    try {
      const propertyData = req.body;
      const result = await RentalPropertyModel.createProperty(propertyData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to create property" });
      }
      return res.json({ success: true, property: result.property });
    } catch (error) {
      console.error("RentalPropertiesController.createProperty error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateProperty(req, res) {
    try {
      const { propertyId } = req.params;
      const propertyData = req.body;
      const result = await RentalPropertyModel.updateProperty(propertyId, propertyData);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to update property" });
      }
      return res.json({ success: true, property: result.property });
    } catch (error) {
      console.error("RentalPropertiesController.updateProperty error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteProperty(req, res) {
    try {
      const { propertyId } = req.params;
      const result = await RentalPropertyModel.deleteProperty(propertyId);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Unable to delete property" });
      }
      return res.json({ success: true });
    } catch (error) {
      console.error("RentalPropertiesController.deleteProperty error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getSummaryStats(req, res) {
    try {
      const result = await RentalPropertyModel.getSummaryStats();
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to get summary stats" });
      }
      return res.json({ success: true, stats: result.stats });
    } catch (error) {
      console.error("RentalPropertiesController.getSummaryStats error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default RentalPropertiesController;

