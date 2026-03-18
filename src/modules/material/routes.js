import express from "express";
import materialUpload from "../../middleware/materialUpload.js";
import { MaterialCategoryController } from "./controllers/MaterialCategoryController.js";
import { MaterialController } from "./controllers/MaterialController.js";
import { MaterialLocationController } from "./controllers/MaterialLocationController.js";
import { MaterialTransactionController } from "./controllers/MaterialTransactionController.js";

const router = express.Router();

// Category routes
router.get("/categories", MaterialCategoryController.getAll);
router.get("/categories/:id", MaterialCategoryController.getById);
router.post("/categories", MaterialCategoryController.create);
router.put("/categories/:id", MaterialCategoryController.update);
router.delete("/categories/:id", MaterialCategoryController.deactivate);

// Attribute template routes
router.get("/templates/:id", MaterialCategoryController.getAttributeTemplateById);
router.post("/categories/:category_id/templates", MaterialCategoryController.createAttributeTemplate);
router.put("/templates/:id", MaterialCategoryController.updateAttributeTemplate);
router.delete("/templates/:id", MaterialCategoryController.deleteAttributeTemplate);

// Material routes
router.get("/materials", MaterialController.getAll);
router.get("/materials/low-stock", MaterialController.getLowStock);
router.get("/materials/export", MaterialController.exportMaterials);
router.get("/materials/:id", MaterialController.getById);
router.get("/materials/:id/usage-trends", MaterialController.getUsageTrends);
router.get("/materials/:id/days-of-cover", MaterialController.getDaysOfCover);
router.post("/materials", MaterialController.create);
router.put("/materials/:id", MaterialController.update);
router.delete("/materials/:id", MaterialController.deactivate);

// Location routes
router.get("/locations", MaterialLocationController.getAll);
router.get("/locations/:id", MaterialLocationController.getById);
router.post("/locations", MaterialLocationController.create);
router.put("/locations/:id", MaterialLocationController.update);
router.delete("/locations/:id", MaterialLocationController.deactivate);

// Image upload route
router.post("/materials/upload-image", materialUpload.single("image"), MaterialController.uploadImage);

// Transaction routes
router.get("/transactions", MaterialTransactionController.getAll);
router.get("/transactions/recent", MaterialTransactionController.getRecent);
router.get("/transactions/summary", MaterialTransactionController.getSummary);
router.get("/transactions/daily-trends", MaterialTransactionController.getDailyTrends);
router.get("/transactions/department-usage", MaterialTransactionController.getDepartmentUsage);
router.get("/transactions/machine-usage", MaterialTransactionController.getMachineUsage);
router.get("/transactions/types", MaterialTransactionController.getTransactionTypes);
router.get("/transactions/:id", MaterialTransactionController.getById);
router.post("/transactions", MaterialTransactionController.create);

// Report routes
router.get("/reports/stock-ledger/export", MaterialTransactionController.exportStockLedger);
router.get("/reports/low-stock/export", MaterialController.exportLowStock);
router.get("/reports/transactions/export", MaterialTransactionController.exportTransactions);
router.get("/reports/department-usage/export", MaterialTransactionController.exportDepartmentUsage);
router.get("/reports/stock-aging/export", MaterialController.exportStockAging);
router.get("/reports/consumption/export", MaterialController.exportConsumption);
router.get("/reports/abc-analysis/export", MaterialController.exportABCAnalysis);
router.get("/reports/reorder-suggestions/export", MaterialController.exportReorderSuggestions);

export default router;
