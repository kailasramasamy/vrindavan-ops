import express from "express";
import { ProductLabelsController } from "./controllers/ProductLabelsController.js";
import { PrintingVendorController } from "./controllers/PrintingVendorController.js";
import { LabelOrderController } from "./controllers/LabelOrderController.js";
import { labelDesignUpload } from "./middleware/upload.js";

const router = express.Router();

// ==================== Product Labels Routes ====================
// UI Routes
router.get("/", ProductLabelsController.renderDashboard);
router.get("/labels", ProductLabelsController.renderLabelsPage);

// API Routes
router.get("/api/labels", ProductLabelsController.listLabels);
router.get("/api/labels/:labelId", ProductLabelsController.getLabelById);
router.post("/api/labels", labelDesignUpload.single("design_file"), ProductLabelsController.createLabel);
router.patch("/api/labels/:labelId", labelDesignUpload.single("design_file"), ProductLabelsController.updateLabel);
router.delete("/api/labels/:labelId", ProductLabelsController.deleteLabel);

// ==================== Printing Vendors Routes ====================
// UI Routes
router.get("/vendors", PrintingVendorController.renderVendorsPage);

// API Routes
router.get("/api/vendors", PrintingVendorController.listVendors);
router.get("/api/vendors/:vendorId", PrintingVendorController.getVendorById);
router.post("/api/vendors", PrintingVendorController.createVendor);
router.patch("/api/vendors/:vendorId", PrintingVendorController.updateVendor);
router.delete("/api/vendors/:vendorId", PrintingVendorController.deleteVendor);

// ==================== Label Orders Routes ====================
// UI Routes
router.get("/orders", LabelOrderController.renderOrdersPage);
router.get("/orders/create", LabelOrderController.renderCreateOrderPage);
router.get("/orders/edit/:orderId", LabelOrderController.renderCreateOrderPage);
// Note: /orders/share/:shareCode is mounted separately in ops.js BEFORE auth middleware to allow public access
router.get("/orders/:orderNumber", LabelOrderController.renderOrderPage); // Order view page (must be last to avoid conflicts)

// API Routes
router.get("/api/orders", LabelOrderController.listOrders);
router.get("/api/orders/:orderId", LabelOrderController.getOrderById);
router.post("/api/orders", LabelOrderController.createOrder);
router.post("/api/orders/:orderId/share", LabelOrderController.generateShareLink);
router.patch("/api/orders/:orderId", LabelOrderController.updateOrder);
router.delete("/api/orders/:orderId", LabelOrderController.deleteOrder);

export default router;


