import CampaignModel from "../../../models/CampaignModel.js";
import CampaignPerformanceModel from "../../../models/CampaignPerformanceModel.js";

class PerformanceController {
  // Get all performance records with optional filters
  async getAll(req, res) {
    try {
      const filters = {
        campaign_id: req.query.campaign_id,
        metric_type: req.query.metric_type,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      let performance;
      if (filters.campaign_id) {
        performance = await CampaignPerformanceModel.getByCampaignId(filters.campaign_id, filters);
      } else {
        // Get all performance records with campaign info
        const query = `
          SELECT cp.*, u.name as created_by_name, c.name as campaign_name, c.type as campaign_type, c.channel
          FROM campaign_performance cp
          LEFT JOIN users u ON cp.created_by = u.id
          LEFT JOIN campaigns c ON cp.campaign_id = c.id
          WHERE 1=1
          ${filters.metric_type ? " AND cp.metric_type = ?" : ""}
          ${filters.date_from ? " AND cp.measurement_date >= ?" : ""}
          ${filters.date_to ? " AND cp.measurement_date <= ?" : ""}
          ORDER BY cp.measurement_date DESC, cp.created_at DESC
        `;

        const values = [];
        if (filters.metric_type) values.push(filters.metric_type);
        if (filters.date_from) values.push(filters.date_from);
        if (filters.date_to) values.push(filters.date_to);

        const { marketingPool } = require("../../../db/marketingPool");
        const [rows] = await marketingPool.execute(query, values);
        performance = rows;
      }

      res.json({
        success: true,
        data: performance,
        count: performance.length,
      });
    } catch (error) {
      console.error("Error getting performance records:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance records",
      });
    }
  }

  // Get performance record by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const performance = await CampaignPerformanceModel.getById(id);

      if (!performance) {
        return res.status(404).json({
          success: false,
          error: "Performance record not found",
        });
      }

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      console.error("Error getting performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance record",
      });
    }
  }

  // Create new performance record
  async create(req, res) {
    try {
      const performanceData = {
        ...req.body,
        created_by: req.user.id,
      };

      // Validate campaign exists
      const campaign = await CampaignModel.getById(performanceData.campaign_id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      const performanceId = await CampaignPerformanceModel.create(performanceData);

      res.status(201).json({
        success: true,
        data: { id: performanceId },
        message: "Performance record created successfully",
      });
    } catch (error) {
      console.error("Error creating performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create performance record",
      });
    }
  }

  // Update performance record
  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const success = await CampaignPerformanceModel.update(id, updateData);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Performance record not found",
        });
      }

      res.json({
        success: true,
        message: "Performance record updated successfully",
      });
    } catch (error) {
      console.error("Error updating performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update performance record",
      });
    }
  }

  // Delete performance record
  async delete(req, res) {
    try {
      const { id } = req.params;
      const success = await CampaignPerformanceModel.delete(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Performance record not found",
        });
      }

      res.json({
        success: true,
        message: "Performance record deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting performance record:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete performance record",
      });
    }
  }

  // Get performance by campaign ID
  async getByCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const filters = {
        metric_type: req.query.metric_type,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const performance = await CampaignPerformanceModel.getByCampaignId(campaignId, filters);

      res.json({
        success: true,
        data: performance,
        count: performance.length,
      });
    } catch (error) {
      console.error("Error getting performance by campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign performance",
      });
    }
  }

  // Get performance summary for a campaign
  async getPerformanceSummary(req, res) {
    try {
      const { campaignId } = req.params;
      const summary = await CampaignPerformanceModel.getPerformanceSummary(campaignId);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error getting performance summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance summary",
      });
    }
  }

  // Get performance analytics
  async getAnalytics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        campaign_type: req.query.campaign_type,
        channel: req.query.channel,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const analytics = await CampaignPerformanceModel.getPerformanceAnalytics(filters);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error getting performance analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance analytics",
      });
    }
  }

  // Get ROI data
  async getROIData(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const roiData = await CampaignPerformanceModel.getROIData(filters);

      res.json({
        success: true,
        data: roiData,
      });
    } catch (error) {
      console.error("Error getting ROI data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch ROI data",
      });
    }
  }

  // Get sales data for campaign comparison
  async getSalesData(req, res) {
    try {
      const { campaignId } = req.params;
      const campaign = await CampaignModel.getById(campaignId);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      const salesData = await CampaignPerformanceModel.getSalesDataForCampaign(campaignId, {
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      });

      const productSalesData = await CampaignPerformanceModel.getProductSalesData(campaignId, {
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      });

      res.json({
        success: true,
        data: {
          sales_data: salesData,
          product_sales_data: productSalesData,
        },
      });
    } catch (error) {
      console.error("Error getting sales data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch sales data",
      });
    }
  }

  // Get campaign effectiveness metrics
  async getEffectiveness(req, res) {
    try {
      const { campaignId } = req.params;
      const effectiveness = await CampaignPerformanceModel.calculateEffectivenessMetrics(campaignId);

      res.json({
        success: true,
        data: effectiveness,
      });
    } catch (error) {
      console.error("Error getting campaign effectiveness:", error);
      res.status(500).json({
        success: false,
        error: "Failed to calculate campaign effectiveness",
      });
    }
  }

  // Bulk import performance data
  async bulkImport(req, res) {
    try {
      const { campaignId } = req.params;
      const { performanceData } = req.body;

      if (!Array.isArray(performanceData)) {
        return res.status(400).json({
          success: false,
          error: "Performance data must be an array",
        });
      }

      // Validate campaign exists
      const campaign = await CampaignModel.getById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      const results = [];
      for (const data of performanceData) {
        try {
          const performanceRecord = {
            campaign_id: campaignId,
            ...data,
            created_by: req.user.id,
          };
          const id = await CampaignPerformanceModel.create(performanceRecord);
          results.push({ success: true, id, data });
        } catch (error) {
          results.push({ success: false, error: error.message, data });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      res.json({
        success: true,
        data: {
          total: performanceData.length,
          successful: successCount,
          failed: failureCount,
          results,
        },
        message: `Bulk import completed: ${successCount} successful, ${failureCount} failed`,
      });
    } catch (error) {
      console.error("Error in bulk import:", error);
      res.status(500).json({
        success: false,
        error: "Failed to perform bulk import",
      });
    }
  }

  // Get performance data for a specific campaign (for campaign detail page)
  async getByCampaign(req, res) {
    try {
      const { campaignId } = req.params;

      const performance = await CampaignPerformanceModel.getByCampaignId(campaignId);

      res.json({
        success: true,
        data: performance,
        count: performance.length,
      });
    } catch (error) {
      console.error("Error getting campaign performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign performance data",
      });
    }
  }

  // Get performance summary for a campaign
  async getCampaignSummary(req, res) {
    try {
      const { campaignId } = req.params;

      // Get all performance data for the campaign
      const performance = await CampaignPerformanceModel.getByCampaignId(campaignId);

      // Calculate totals
      const summary = {
        total_conversions: 0,
        total_revenue: 0,
        total_leads: 0,
        total_engagement: 0,
        total_reach: 0,
        total_impressions: 0,
        total_clicks: 0,
        roi: 0,
      };

      // Sum up the metrics
      performance.forEach((metric) => {
        switch (metric.metric_type) {
          case "sales_conversion":
            summary.total_conversions += metric.metric_value;
            break;
          case "revenue":
            summary.total_revenue += metric.metric_value;
            break;
          case "leads":
            summary.total_leads += metric.metric_value;
            break;
          case "engagement":
            summary.total_engagement += metric.metric_value;
            break;
          case "reach":
            summary.total_reach += metric.metric_value;
            break;
          case "impressions":
            summary.total_impressions += metric.metric_value;
            break;
          case "clicks":
            summary.total_clicks += metric.metric_value;
            break;
        }
      });

      // Calculate ROI (Revenue - Expenses) / Expenses * 100
      // For now, we'll use a simple calculation
      if (summary.total_revenue > 0) {
        // This is a simplified ROI calculation
        summary.roi = (((summary.total_revenue - 0) / 1000) * 100).toFixed(1);
      }

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error getting campaign summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign summary",
      });
    }
  }
}

export default new PerformanceController();
