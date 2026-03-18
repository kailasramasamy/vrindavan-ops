import CampaignModel from "../../../models/CampaignModel.js";
import CampaignPerformanceModel from "../../../models/CampaignPerformanceModel.js";
import { opsPool } from "../../../db/pool.js";

class CampaignController {
  // Get all campaigns with optional filters
  async getAll(req, res) {
    try {
      const filters = {
        status: req.query.status,
        type: req.query.type,
        channel: req.query.channel,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      // Get regular campaigns
      const regularCampaigns = await CampaignModel.getAll(filters);

      // Get sampling campaigns (unless type filter excludes them)
      let samplingCampaigns = [];
      if (!filters.type || filters.type === 'product_sampling') {
        try {
          if (opsPool) {
            let query = `SELECT id, campaign_name, description, product_id, product_name, status, 
                         created_at, updated_at
                         FROM marketing_sampling_campaigns WHERE 1=1`;
            const params = [];

            // Apply status filter
            if (filters.status) {
              query += ` AND status = ?`;
              params.push(filters.status);
            }

            // Apply date filters
            if (filters.date_from) {
              query += ` AND DATE(created_at) >= ?`;
              params.push(filters.date_from);
            }
            if (filters.date_to) {
              query += ` AND DATE(created_at) <= ?`;
              params.push(filters.date_to);
            }

            query += ` ORDER BY created_at DESC`;
            
            if (filters.limit) {
              query += ` LIMIT ?`;
              params.push(filters.limit);
            }

            const [samplingRows] = await opsPool.query(query, params);

            // Transform sampling campaigns to match regular campaign format
            samplingCampaigns = samplingRows.map(campaign => ({
              id: campaign.id,
              name: campaign.campaign_name,
              type: 'product_sampling',
              channel: 'Product Sampling',
              objective: 'trials',
              start_date: campaign.created_at,
              end_date: campaign.updated_at || campaign.created_at,
              status: campaign.status || 'active',
              total_expenses: 0, // Sampling campaigns don't have expenses tracked separately
              is_sampling: true
            }));
          }
        } catch (error) {
          console.error("Error fetching sampling campaigns:", error);
        }
      }

      // Combine campaigns
      const allCampaigns = [
        ...regularCampaigns.map(c => ({ ...c, is_sampling: false })),
        ...samplingCampaigns
      ];

      // Sort by start_date/created_at (most recent first)
      allCampaigns.sort((a, b) => {
        const dateA = new Date(a.start_date || a.created_at || 0);
        const dateB = new Date(b.start_date || b.created_at || 0);
        return dateB - dateA;
      });

      // Apply limit if specified and not already applied to sampling campaigns
      let finalCampaigns = allCampaigns;
      if (filters.limit && filters.type !== 'product_sampling') {
        finalCampaigns = allCampaigns.slice(0, filters.limit);
      }

      res.json({
        success: true,
        data: finalCampaigns,
        count: finalCampaigns.length,
      });
    } catch (error) {
      console.error("Error getting campaigns:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaigns",
      });
    }
  }

  // Get campaign by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const campaign = await CampaignModel.getById(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      console.error("Error getting campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign",
      });
    }
  }

  // Get campaign performance chart data
  async getPerformanceChart(req, res) {
    try {
      const { id } = req.params;
      const chartData = await CampaignModel.getPerformanceChartData(id);

      res.json({
        success: true,
        data: chartData,
      });
    } catch (error) {
      console.error("Error getting performance chart data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance chart data",
      });
    }
  }

  // Create new campaign
  async create(req, res) {
    try {
      const campaignData = {
        ...req.body,
        created_by: req.user.id,
      };

      const campaignId = await CampaignModel.create(campaignData);

      res.status(201).json({
        success: true,
        data: { id: campaignId },
        message: "Campaign created successfully",
      });
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create campaign",
      });
    }
  }

  // Update campaign
  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const success = await CampaignModel.update(id, updateData);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      res.json({
        success: true,
        message: "Campaign updated successfully",
      });
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update campaign",
      });
    }
  }

  // Delete campaign
  async delete(req, res) {
    try {
      const { id } = req.params;
      const success = await CampaignModel.delete(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      res.json({
        success: true,
        message: "Campaign deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete campaign",
      });
    }
  }

  // Get campaign statistics
  async getStatistics(req, res) {
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

      const statistics = await CampaignModel.getStatistics(filters);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("Error getting campaign statistics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign statistics",
      });
    }
  }

  // Get campaign performance
  async getPerformance(req, res) {
    try {
      const { id } = req.params;
      const performance = await CampaignPerformanceModel.getByCampaignId(id);

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      console.error("Error getting campaign performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign performance",
      });
    }
  }

  // Get campaign ROI
  async getROI(req, res) {
    try {
      const { id } = req.params;
      const roi = await CampaignModel.getROI(id);

      if (!roi) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      res.json({
        success: true,
        data: roi,
      });
    } catch (error) {
      console.error("Error getting campaign ROI:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign ROI",
      });
    }
  }

  // Get campaigns by status
  async getByStatus(req, res) {
    try {
      const { status } = req.params;
      const campaigns = await CampaignModel.getByStatus(status);

      res.json({
        success: true,
        data: campaigns,
        count: campaigns.length,
      });
    } catch (error) {
      console.error("Error getting campaigns by status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaigns by status",
      });
    }
  }

  // Get active campaigns
  async getActive(req, res) {
    try {
      const campaigns = await CampaignModel.getActive();

      res.json({
        success: true,
        data: campaigns,
        count: campaigns.length,
      });
    } catch (error) {
      console.error("Error getting active campaigns:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch active campaigns",
      });
    }
  }

  // Get campaign effectiveness metrics
  async getEffectiveness(req, res) {
    try {
      const { id } = req.params;
      const effectiveness = await CampaignPerformanceModel.calculateEffectivenessMetrics(id);

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

  // Get sales data for campaign comparison
  async getSalesData(req, res) {
    try {
      const { id } = req.params;
      const campaign = await CampaignModel.getById(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      const salesData = await CampaignPerformanceModel.getSalesDataForCampaign(id, {
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      });

      const productSalesData = await CampaignPerformanceModel.getProductSalesData(id, {
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

  // Get performance analytics
  async getPerformanceAnalytics(req, res) {
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
      const roiData = await CampaignPerformanceModel.getROIData(filters);

      res.json({
        success: true,
        data: {
          performance_analytics: analytics,
          roi_data: roiData,
        },
      });
    } catch (error) {
      console.error("Error getting performance analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch performance analytics",
      });
    }
  }
}

export default new CampaignController();
