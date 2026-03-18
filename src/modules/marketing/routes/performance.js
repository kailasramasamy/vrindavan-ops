import express from "express";
import { requireAuth } from "../../../middleware/rbac.js";
const router = express.Router();

// Import controller
import performanceController from "../controllers/performanceController.js";

// Apply authentication middleware to all routes
router.use(requireAuth);

// Performance routes
router.get("/", performanceController.getAll);
router.get("/analytics", performanceController.getAnalytics);
router.get("/roi-data", performanceController.getROIData);
router.get("/campaign/:campaignId", performanceController.getByCampaign);
router.get("/campaign/:campaignId/summary", performanceController.getCampaignSummary);
router.get("/:id", performanceController.getById);
router.post("/", performanceController.create);
router.post("/bulk-import/:campaignId", performanceController.bulkImport);
router.put("/:id", performanceController.update);
router.delete("/:id", performanceController.delete);

export default router;
