import express from "express";
import { requireAuth } from "../../middleware/rbac.js";
import { InwardPoController } from "./controllers/InwardPoController.js";
import { WebhookController } from "./controllers/WebhookController.js";

const router = express.Router();

// API routes for webhook (API key auth, no session) — must be before auth middleware
router.post("/api/webhook", WebhookController.receivePoWebhook);

// All routes below require authentication
router.use(requireAuth);

// Page routes
router.get("/", InwardPoController.getDashboard);
router.get("/list", InwardPoController.getPoList);
router.get("/:id", InwardPoController.getPoDetail);

// API routes (auth required)
router.post("/:id/invoice", InwardPoController.createInvoice);
router.post("/:id/invoice/send", InwardPoController.sendInvoiceToWms);
router.get("/:id/invoice-pdf", InwardPoController.downloadInvoicePdf);
router.put("/:id/status", InwardPoController.apiUpdateStatus);
router.post("/:id/mark-paid", InwardPoController.apiMarkAsPaid);
router.get("/api/stats", InwardPoController.apiGetStats);

export default router;
