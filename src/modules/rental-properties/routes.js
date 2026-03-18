import express from "express";
import { RentalPropertiesController } from "./controllers/RentalPropertiesController.js";

const router = express.Router();

// UI Routes
router.get("/", RentalPropertiesController.renderPropertiesPage);

// API Routes
router.get("/api/properties", RentalPropertiesController.listProperties);
router.get("/api/properties/:propertyId", RentalPropertiesController.getPropertyById);
router.post("/api/properties", RentalPropertiesController.createProperty);
router.patch("/api/properties/:propertyId", RentalPropertiesController.updateProperty);
router.delete("/api/properties/:propertyId", RentalPropertiesController.deleteProperty);
router.get("/api/properties/stats/summary", RentalPropertiesController.getSummaryStats);

export default router;

