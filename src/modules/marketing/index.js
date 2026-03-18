import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "campaign-assets");
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow images, videos, and PDFs
    const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images, videos, and PDFs are allowed"));
    }
  },
});

// Import route modules
import campaignsRoutes from "./routes/campaigns.js";
import expensesRoutes from "./routes/expenses.js";
import performanceRoutes from "./routes/performance.js";
import productDataRoutes from "./routes/productData.js";
import samplingRoutes from "./routes/sampling.js";
import adContentRoutes from "./routes/adContent.js";

// Mount routes
router.use("/campaigns", campaignsRoutes);
router.use("/expenses", expensesRoutes);
router.use("/performance", performanceRoutes);
router.use("/product-data", productDataRoutes);
router.use("/sampling", samplingRoutes);
router.use("/ad-content", adContentRoutes);

// File upload route for campaign assets
router.post("/upload-assets", upload.array("files", 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded",
      });
    }

    const uploadedFiles = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      path: `/uploads/campaign-assets/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
    }));

    res.json({
      success: true,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload files",
    });
  }
});

// Marketing dashboard route
router.get("/dashboard", async (req, res) => {
  try {
    // Import models for dashboard data
    const CampaignModel = await import("../../models/CampaignModel.js");
    const CampaignExpenseModel = await import("../../models/CampaignExpenseModel.js");
    const CampaignPerformanceModel = await import("../../models/CampaignPerformanceModel.js");
    const { opsPool } = await import("../../db/pool.js");

    // Get dashboard statistics
    const [campaignStats, recentRegularCampaigns, expenseAnalytics, performanceAnalytics, roiData, monthlyExpenses] = await Promise.all([
      CampaignModel.default.getStatistics(),
      CampaignModel.default.getAll({ limit: 10 }),
      CampaignExpenseModel.default.getExpenseAnalytics(), // Get all expenses without date filter
      CampaignPerformanceModel.default.getPerformanceAnalytics({
        date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        date_to: new Date().toISOString().split("T")[0],
      }),
      CampaignPerformanceModel.default.getROIData({
        date_from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        date_to: new Date().toISOString().split("T")[0],
      }),
      CampaignModel.default.getMonthlyExpenses(),
    ]);

    // Get sampling campaign statistics
    let samplingCampaignStats = {
      total_campaigns: 0,
      active_campaigns: 0
    };
    if (opsPool) {
      try {
        const [totalCount] = await opsPool.query(
          "SELECT COUNT(*) as count FROM marketing_sampling_campaigns"
        );
        const [activeCount] = await opsPool.query(
          "SELECT COUNT(*) as count FROM marketing_sampling_campaigns WHERE status = 'active'"
        );
        
        samplingCampaignStats.total_campaigns = totalCount[0]?.count || 0;
        samplingCampaignStats.active_campaigns = activeCount[0]?.count || 0;
      } catch (error) {
        console.error("Error fetching sampling campaign statistics:", error);
      }
    }

    // Update total campaigns to include sampling campaigns
    if (campaignStats && campaignStats.total_campaigns !== undefined) {
      campaignStats.total_campaigns = (campaignStats.total_campaigns || 0) + samplingCampaignStats.total_campaigns;
    }

    // Get sampling campaigns
    let samplingCampaigns = [];
    if (opsPool) {
      try {
        const [samplingRows] = await opsPool.query(
          `SELECT id, campaign_name, description, product_id, product_name, status, 
           created_at, updated_at
           FROM marketing_sampling_campaigns 
           ORDER BY created_at DESC 
           LIMIT 10`
        );
        
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
          is_sampling: true
        }));
      } catch (error) {
        console.error("Error fetching sampling campaigns:", error);
      }
    }

    // Combine and sort campaigns by start_date (most recent first)
    const allRecentCampaigns = [
      ...recentRegularCampaigns.map(c => ({ ...c, is_sampling: false })),
      ...samplingCampaigns
    ].sort((a, b) => {
      const dateA = new Date(a.start_date || a.created_at || 0);
      const dateB = new Date(b.start_date || b.created_at || 0);
      return dateB - dateA; // Most recent first
    }).slice(0, 5); // Take top 5 most recent

    res.json({
      success: true,
      data: {
        statistics: campaignStats,
        sampling_campaign_stats: samplingCampaignStats,
        recent_campaigns: allRecentCampaigns,
        expense_analytics: expenseAnalytics,
        performance_analytics: performanceAnalytics,
        roi_data: roiData,
        monthly_expenses: monthlyExpenses,
      },
    });
  } catch (error) {
    console.error("Error getting marketing dashboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch marketing dashboard data",
    });
  }
});

export default router;
