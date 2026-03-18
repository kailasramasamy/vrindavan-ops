import express from "express";
import { ItServicesController } from "./controllers/ItServicesController.js";

const router = express.Router();

// UI Routes
router.get("/", ItServicesController.renderServicesPage);

// API Routes
router.get("/api/services", ItServicesController.listServices);
router.get("/api/services/:serviceId", ItServicesController.getServiceById);
router.post("/api/services", ItServicesController.createService);
router.patch("/api/services/:serviceId", ItServicesController.updateService);
router.delete("/api/services/:serviceId", ItServicesController.deleteService);
router.get("/api/stats", ItServicesController.getSummaryStats);

export default router;

