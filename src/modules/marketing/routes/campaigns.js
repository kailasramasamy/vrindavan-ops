import express from "express";
import { requireAuth } from "../../../middleware/rbac.js";
const router = express.Router();

// Import controllers
import campaignController from "../controllers/campaignController.js";
import expenseController from "../controllers/expenseController.js";
import performanceController from "../controllers/performanceController.js";

// Debug endpoint to test chart data processing (no auth required)
router.get("/:id/debug-chart", async (req, res) => {
  try {
    const { id } = req.params;

    // Test the chart data method directly
    const CampaignModel = (await import("../../../models/CampaignModel.js")).default;
    const chartData = await CampaignModel.getPerformanceChartData(id);

    res.json({
      success: true,
      data: chartData,
      debug: "Chart data processed successfully",
    });
  } catch (error) {
    console.error("Debug chart error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Apply authentication middleware to all routes
router.use(requireAuth);

// Campaign routes
router.get("/", campaignController.getAll);
router.get("/statistics", campaignController.getStatistics);
router.get("/active", campaignController.getActive);
router.get("/status/:status", campaignController.getByStatus);
router.get("/analytics/performance", campaignController.getPerformanceAnalytics);
router.get("/:id", campaignController.getById);
router.get("/:id/performance", campaignController.getPerformance);
router.get("/:id/performance-chart", campaignController.getPerformanceChart);

// Test endpoint without authentication for debugging
router.get("/:id/performance-chart-test", campaignController.getPerformanceChart);
router.get("/:id/roi", campaignController.getROI);
router.get("/:id/effectiveness", campaignController.getEffectiveness);
router.get("/:id/sales-data", campaignController.getSalesData);
router.post("/", campaignController.create);
router.put("/:id", campaignController.update);
router.delete("/:id", campaignController.delete);

// Campaign expense routes
router.get("/:id/expenses", expenseController.getByCampaign);
router.get("/:id/expenses/summary", expenseController.getExpenseSummary);

// Campaign performance routes
router.get("/:id/performance/records", performanceController.getByCampaign);
router.get("/:id/performance/summary", performanceController.getPerformanceSummary);
router.get("/:id/performance/sales-data", performanceController.getSalesData);
router.get("/:id/performance/effectiveness", performanceController.getEffectiveness);

export default router;
