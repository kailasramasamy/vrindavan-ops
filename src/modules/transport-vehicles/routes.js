import express from "express";
import { TransportVehiclesController } from "./controllers/TransportVehiclesController.js";

const router = express.Router();

// UI Routes
router.get("/", TransportVehiclesController.renderVehiclesPage);

// API Routes
router.get("/api/vehicles", TransportVehiclesController.listVehicles);
router.get("/api/vehicles/stats/summary", TransportVehiclesController.getSummaryStats);
router.get("/api/vehicles/:vehicleId", TransportVehiclesController.getVehicleById);
router.post("/api/vehicles", TransportVehiclesController.createVehicle);
router.patch("/api/vehicles/:vehicleId", TransportVehiclesController.updateVehicle);
router.delete("/api/vehicles/:vehicleId", TransportVehiclesController.deleteVehicle);

export default router;

