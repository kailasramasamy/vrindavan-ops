import express from "express";
import { opsPool } from "../../../db/pool.js";
import { requireAuth } from "../../../middleware/auth.js";
import CampaignSalesPerformanceModel from "../../../models/CampaignSalesPerformanceModel.js";

const router = express.Router();

// Sync sales data for a campaign
router.post("/sync/:campaignId", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const result = await CampaignSalesPerformanceModel.syncSalesData(campaignId, startDate, endDate);

    res.json({
      success: true,
      message: result.message,
      synced: result.synced,
    });
  } catch (error) {
    console.error("Error syncing sales data:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing sales data",
      error: error.message,
    });
  }
});

// Get performance metrics for dashboard
router.get("/metrics", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.query;
    const metrics = await CampaignSalesPerformanceModel.getPerformanceMetrics(campaignId);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error("Error getting performance metrics:", error);
    res.status(500).json({
      success: false,
      message: "Error getting performance metrics",
      error: error.message,
    });
  }
});

// Get campaign performance summary
router.get("/campaign/:campaignId/summary", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const summary = await CampaignSalesPerformanceModel.getCampaignPerformanceSummary(campaignId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error getting campaign performance summary:", error);
    res.status(500).json({
      success: false,
      message: "Error getting campaign performance summary",
      error: error.message,
    });
  }
});

// Get daily performance for a campaign
router.get("/campaign/:campaignId/daily", requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { days = 30 } = req.query;

    const dailyPerformance = await CampaignSalesPerformanceModel.getDailyPerformance(campaignId, parseInt(days));

    res.json({
      success: true,
      data: dailyPerformance,
    });
  } catch (error) {
    console.error("Error getting daily performance:", error);
    res.status(500).json({
      success: false,
      message: "Error getting daily performance",
      error: error.message,
    });
  }
});

// Get all campaigns with performance data
router.get("/campaigns", requireAuth, async (req, res) => {
  try {
    const [campaigns] = await opsPool.execute(`
      SELECT DISTINCT 
        c.id,
        c.name,
        c.start_date,
        c.end_date,
        c.status,
        COUNT(DISTINCT csp.sales_date) as days_tracked,
        SUM(csp.units_sold) as total_units_sold,
        SUM(csp.revenue) as total_revenue
      FROM campaigns c
      LEFT JOIN campaign_sales_performance csp ON c.id = csp.campaign_id
      WHERE c.status = 'active'
      GROUP BY c.id, c.name, c.start_date, c.end_date, c.status
      ORDER BY c.start_date DESC
    `);

    res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    console.error("Error getting campaigns with performance:", error);
    res.status(500).json({
      success: false,
      message: "Error getting campaigns with performance",
      error: error.message,
    });
  }
});

export default router;
