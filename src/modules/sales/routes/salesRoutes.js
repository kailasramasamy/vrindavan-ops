import express from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { ProductMappingController } from "../controllers/ProductMappingController.js";
import { PartnerProductPricingController } from "../controllers/PartnerProductPricingController.js";
import { SalesController } from "../controllers/SalesController.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Dashboard
router.get("/dashboard", SalesController.getDashboard);

// Partners Management
router.get("/partners", SalesController.getPartners);
router.post("/partners", SalesController.createPartner);
router.get("/partners/:id", SalesController.getPartnerById);
router.put("/partners/:id", SalesController.updatePartner);
router.delete("/partners/:id", SalesController.deletePartner);
router.put("/partners/:id/products", SalesController.updatePartnerProducts);
router.get("/partners/:id/products", SalesController.getPartnerProductsApi);

// Sales Data Entry
router.get("/data-entry", SalesController.getDataEntry);
router.post("/records", SalesController.createSalesRecord);
router.post("/records/bulk", SalesController.createBulkSalesRecords);
router.put("/records/:id", SalesController.updateSalesRecord);
router.delete("/records/:id", SalesController.deleteSalesRecord);

// Reports
router.get("/reports", SalesController.getReports);
router.get("/api/partner-sales-trends", SalesController.getPartnerSalesTrendsApi);

// Product Mappings Management
router.get("/product-mappings", ProductMappingController.getMappingsPage);
router.post("/product-mappings", ProductMappingController.createMapping);
router.get("/product-mappings/:id", ProductMappingController.getMappingById);
router.put("/product-mappings/:id", ProductMappingController.updateMapping);
router.delete("/product-mappings/:id", ProductMappingController.deleteMapping);

// Partner Product Pricing Management
router.get("/partner-product-pricing", PartnerProductPricingController.getPricingPage);
router.get("/partner-product-pricing/partner/:partnerId", PartnerProductPricingController.getPricingByPartner);
router.get("/partner-product-pricing/:id", PartnerProductPricingController.getPricingById);
router.post("/partner-product-pricing", PartnerProductPricingController.savePricing);
router.put("/partner-product-pricing/:id", PartnerProductPricingController.savePricing);
router.delete("/partner-product-pricing/:id", PartnerProductPricingController.deletePricing);

// API Endpoints
router.post("/api/compute-summary", SalesController.computeSummaryApi);
router.get("/api/summary", SalesController.getSummaryApi);
router.post("/api/sync-app-sales", SalesController.syncAppSales);

export default router;
