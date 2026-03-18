import LogisticsPartnerModel from "../models/LogisticsPartnerModel.js";

export default class LogisticsPartnerController {
  // Get all logistics partners
  static async getAllLogisticsPartners(req, res) {
    try {
      const result = await LogisticsPartnerModel.getAllLogisticsPartners();

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getAllLogisticsPartners:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get logistics partner by ID
  static async getLogisticsPartnerById(req, res) {
    try {
      const { id } = req.params;
      const result = await LogisticsPartnerModel.getLogisticsPartnerById(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getLogisticsPartnerById:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create new logistics partner
  static async createLogisticsPartner(req, res) {
    try {
      const partnerData = {
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await LogisticsPartnerModel.createLogisticsPartner(partnerData);

      if (result.success) {
        res.status(201).json({
          success: true,
          message: "Logistics partner created successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in createLogisticsPartner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update logistics partner
  static async updateLogisticsPartner(req, res) {
    try {
      const { id } = req.params;
      const partnerData = req.body;

      const result = await LogisticsPartnerModel.updateLogisticsPartner(id, partnerData);

      if (result.success) {
        res.json({
          success: true,
          message: "Logistics partner updated successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in updateLogisticsPartner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete logistics partner
  static async deleteLogisticsPartner(req, res) {
    try {
      const { id } = req.params;
      const result = await LogisticsPartnerModel.deleteLogisticsPartner(id);

      if (result.success) {
        res.json({
          success: true,
          message: "Logistics partner deleted successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in deleteLogisticsPartner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get logistics partners for dropdown
  static async getLogisticsPartnersForDropdown(req, res) {
    try {
      const result = await LogisticsPartnerModel.getLogisticsPartnersForDropdown();

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getLogisticsPartnersForDropdown:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get logistics partners statistics
  static async getLogisticsPartnerStats(req, res) {
    try {
      const result = await LogisticsPartnerModel.getLogisticsPartnerStats();

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getLogisticsPartnerStats:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
