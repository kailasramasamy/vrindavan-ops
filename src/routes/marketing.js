import express from "express";
import { requireAuth } from "../middleware/rbac.js";

// Import marketing module
import marketingModule from "../modules/marketing/index.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Mount marketing module
router.use("/api", marketingModule);

// Marketing dashboard view route
router.get("/dashboard", (req, res) => {
  res.render("pages/ops/marketing/dashboard", {
    title: "Marketing Campaign Dashboard",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Marketing Campaign Dashboard",
      description: "Track and analyze your marketing campaigns performance",
      url: req.originalUrl,
    },
  });
});

// Campaign management view routes
router.get("/campaigns", (req, res) => {
  res.render("pages/ops/marketing/campaigns", {
    title: "Campaign Management",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Campaign Management",
      description: "Manage your marketing campaigns",
      url: req.originalUrl,
    },
  });
});

router.get("/campaigns/new", (req, res) => {
  res.render("pages/ops/marketing/campaign-form", {
    title: "Create New Campaign",
    user: req.user,
    currentPage: "marketing",
    mode: "create",
    campaignId: null,
    seo: {
      title: "Create New Campaign",
      description: "Set up your marketing campaign details",
      url: req.originalUrl,
    },
  });
});

router.get("/campaigns/:id/edit", (req, res) => {
  res.render("pages/ops/marketing/campaign-form", {
    title: "Edit Campaign",
    user: req.user,
    currentPage: "marketing",
    mode: "edit",
    campaignId: req.params.id,
    seo: {
      title: "Edit Campaign",
      description: "Update your marketing campaign details",
      url: req.originalUrl,
    },
  });
});

router.get("/campaigns/:id", (req, res) => {
  res.render("pages/ops/marketing/campaign-detail", {
    title: "Campaign Details",
    user: req.user,
    currentPage: "marketing",
    campaignId: req.params.id,
    seo: {
      title: "Campaign Details",
      description: "View detailed information about your marketing campaign",
      url: req.originalUrl,
    },
  });
});

// Expense tracking view routes
router.get("/expenses", (req, res) => {
  res.render("pages/ops/marketing/expenses", {
    title: "Expense Tracking",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Expense Tracking",
      description: "Track and manage campaign expenses",
      url: req.originalUrl,
    },
  });
});

// Performance analytics view routes
router.get("/performance", (req, res) => {
  res.render("pages/ops/marketing/performance", {
    title: "Performance Analytics",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Performance Analytics",
      description: "Analyze campaign performance and ROI",
      url: req.originalUrl,
    },
  });
});

// Reports view routes
router.get("/reports", (req, res) => {
  res.render("pages/ops/marketing/reports", {
    title: "Marketing Reports",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Marketing Reports",
      description: "Generate and view marketing reports",
      url: req.originalUrl,
    },
  });
});

// Product Sampling routes
router.get("/sampling", (req, res) => {
  res.render("pages/ops/marketing/sampling", {
    title: "Product Sampling Campaigns",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Product Sampling Campaigns",
      description: "Track sample product orders for targeted customers",
      url: req.originalUrl,
    },
  });
});

// Dashboard route must come before /sampling/:id to avoid matching "dashboard" as an ID
router.get("/sampling/dashboard", (req, res) => {
  res.render("pages/ops/marketing/sampling", {
    title: "Product Sampling Campaigns Dashboard",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Product Sampling Campaigns Dashboard",
      description: "Track sample product orders for targeted customers",
      url: req.originalUrl,
    },
  });
});

router.get("/sampling/:id", (req, res) => {
  const campaignId = parseInt(req.params.id);
  
  // Validate that the ID is a valid number
  if (isNaN(campaignId)) {
    return res.status(404).render("pages/ops/404", {
      title: "Campaign Not Found",
      user: req.user,
      currentPage: "marketing",
      seo: {
        title: "Campaign Not Found",
        description: "The requested campaign could not be found",
        url: req.originalUrl,
      },
    });
  }

  res.render("pages/ops/marketing/sampling-detail", {
    title: "Sampling Campaign Details",
    user: req.user,
    currentPage: "marketing",
    campaignId: campaignId,
    seo: {
      title: "Sampling Campaign Details",
      description: "View detailed sampling campaign information",
      url: req.originalUrl,
    },
  });
});

router.get("/sampling/:id/add-customers", (req, res) => {
  res.render("pages/ops/marketing/sampling-add-customers", {
    title: "Add Customers to Campaign",
    user: req.user,
    currentPage: "marketing",
    campaignId: req.params.id,
    seo: {
      title: "Add Customers to Campaign",
      description: "Select customers for sampling campaign",
      url: req.originalUrl,
    },
  });
});

// Ad Content Management view routes
router.get("/ads", (req, res) => {
  res.render("pages/ops/marketing/ads", {
    title: "Ad Content Management",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Ad Content Management",
      description: "Manage ad creatives and content",
      url: req.originalUrl,
    },
  });
});

router.get("/ads/new", (req, res) => {
  res.render("pages/ops/marketing/ad-form", {
    title: "Create New Ad",
    user: req.user,
    currentPage: "marketing",
    mode: "create",
    adId: null,
    seo: {
      title: "Create New Ad",
      description: "Create a new ad creative",
      url: req.originalUrl,
    },
  });
});

router.get("/ads/:id/edit", (req, res) => {
  res.render("pages/ops/marketing/ad-form", {
    title: "Edit Ad",
    user: req.user,
    currentPage: "marketing",
    mode: "edit",
    adId: req.params.id,
    seo: {
      title: "Edit Ad",
      description: "Edit ad creative",
      url: req.originalUrl,
    },
  });
});

router.get("/ads/:id", (req, res) => {
  res.render("pages/ops/marketing/ad-detail", {
    title: "Ad Details",
    user: req.user,
    currentPage: "marketing",
    adId: req.params.id,
    seo: {
      title: "Ad Details",
      description: "View ad creative details",
      url: req.originalUrl,
    },
  });
});

router.get("/assets", (req, res) => {
  res.render("pages/ops/marketing/assets", {
    title: "Asset Library",
    user: req.user,
    currentPage: "marketing",
    seo: {
      title: "Asset Library",
      description: "Browse and manage ad assets",
      url: req.originalUrl,
    },
  });
});

export default router;
