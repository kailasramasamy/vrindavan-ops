import express from "express";
import { requireAuth } from "../../../middleware/rbac.js";
const router = express.Router();

// Import controller
import expenseController from "../controllers/expenseController.js";

// Apply authentication middleware to all routes
router.use(requireAuth);

// Expense routes
router.get("/", expenseController.getAll);
router.get("/analytics", expenseController.getAnalytics);
router.get("/monthly-breakdown", expenseController.getMonthlyBreakdown);
router.get("/totals", expenseController.getTotalExpenses);
router.get("/:id", expenseController.getById);
router.post("/", expenseController.create);
router.put("/:id", expenseController.update);
router.delete("/:id", expenseController.delete);

export default router;
