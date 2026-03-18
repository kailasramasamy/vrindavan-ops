import express from "express";
import { ElectricityMetersController } from "./controllers/ElectricityMetersController.js";

const router = express.Router();

// UI Routes
router.get("/", ElectricityMetersController.renderMetersPage);

// API Routes
router.get("/api/meters", ElectricityMetersController.listMeters);
router.get("/api/meters/:meterId", ElectricityMetersController.getMeterById);
router.post("/api/meters", ElectricityMetersController.createMeter);
router.patch("/api/meters/:meterId", ElectricityMetersController.updateMeter);
router.delete("/api/meters/:meterId", ElectricityMetersController.deleteMeter);
router.get("/api/stats", ElectricityMetersController.getSummaryStats);

export default router;


