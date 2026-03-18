import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";

const router = express.Router();

// Get default margins (Admin only)
router.get("/default", authenticate, requireAdmin, async (req, res) => {
  try {
    const [margins] = await pool.execute(
      "SELECT * FROM default_margins WHERE is_active = TRUE ORDER BY product_category"
    );
    res.json(margins);
  } catch (error) {
    console.error("Get default margins error:", error);
    res.status(500).json({ error: "Failed to fetch default margins" });
  }
});

// Create/Update default margin (Admin only)
router.post(
  "/default",
  authenticate,
  requireAdmin,
  [
    body("product_category").notEmpty().trim(),
    body("margin_percentage").isFloat({ min: 0, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { product_category, margin_percentage, is_active = true } = req.body;

      await pool.execute(
        `INSERT INTO default_margins (product_category, margin_percentage, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE margin_percentage = ?, is_active = ?`,
        [product_category, margin_percentage, is_active, margin_percentage, is_active]
      );

      await auditLog(req, "UPDATE_DEFAULT_MARGIN", "margin", null, null, req.body);

      const [margins] = await pool.execute(
        "SELECT * FROM default_margins WHERE product_category = ?",
        [product_category]
      );

      res.json(margins[0]);
    } catch (error) {
      console.error("Create default margin error:", error);
      res.status(500).json({ error: "Failed to create default margin" });
    }
  }
);

// Get CP-specific product margins
router.get("/cp/:cpId/products", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;

    // CPs can only view their own margins
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [margins] = await pool.execute(
      "SELECT * FROM cp_product_margins WHERE cp_id = ? AND is_active = TRUE ORDER BY product_id",
      [cpId]
    );
    res.json(margins);
  } catch (error) {
    console.error("Get CP product margins error:", error);
    res.status(500).json({ error: "Failed to fetch CP product margins" });
  }
});

// Set CP-specific product margin (Admin only)
router.post(
  "/cp/:cpId/products",
  authenticate,
  requireAdmin,
  [
    body("product_id").isInt(),
    body("margin_percentage").isFloat({ min: 0, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { cpId } = req.params;
      const { product_id, margin_percentage, is_active = true } = req.body;

      await pool.execute(
        `INSERT INTO cp_product_margins (cp_id, product_id, margin_percentage, is_active)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE margin_percentage = ?, is_active = ?`,
        [cpId, product_id, margin_percentage, is_active, margin_percentage, is_active]
      );

      await auditLog(req, "UPDATE_CP_PRODUCT_MARGIN", "margin", cpId, null, req.body);

      const [margins] = await pool.execute(
        "SELECT * FROM cp_product_margins WHERE cp_id = ? AND product_id = ?",
        [cpId, product_id]
      );

      res.json(margins[0]);
    } catch (error) {
      console.error("Set CP product margin error:", error);
      res.status(500).json({ error: "Failed to set CP product margin" });
    }
  }
);

// Get CP category margins
router.get("/cp/:cpId/categories", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;

    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [margins] = await pool.execute(
      "SELECT * FROM cp_category_margins WHERE cp_id = ? AND is_active = TRUE ORDER BY product_category",
      [cpId]
    );
    res.json(margins);
  } catch (error) {
    console.error("Get CP category margins error:", error);
    res.status(500).json({ error: "Failed to fetch CP category margins" });
  }
});

// Set CP category margin (Admin only)
router.post(
  "/cp/:cpId/categories",
  authenticate,
  requireAdmin,
  [
    body("product_category").notEmpty().trim(),
    body("margin_percentage").isFloat({ min: 0, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { cpId } = req.params;
      const { product_category, margin_percentage, is_active = true } = req.body;

      await pool.execute(
        `INSERT INTO cp_category_margins (cp_id, product_category, margin_percentage, is_active)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE margin_percentage = ?, is_active = ?`,
        [cpId, product_category, margin_percentage, is_active, margin_percentage, is_active]
      );

      await auditLog(req, "UPDATE_CP_CATEGORY_MARGIN", "margin", cpId, null, req.body);

      const [margins] = await pool.execute(
        "SELECT * FROM cp_category_margins WHERE cp_id = ? AND product_category = ?",
        [cpId, product_category]
      );

      res.json(margins[0]);
    } catch (error) {
      console.error("Set CP category margin error:", error);
      res.status(500).json({ error: "Failed to set CP category margin" });
    }
  }
);

// Helper function to get effective margin for a CP and product
// This is used by the commission calculation logic
export async function getEffectiveMargin(cpId, productId, productCategory) {
  // Priority: cp_product_margins > cp_category_margins > default_margins
  const [productMargin] = await pool.execute(
    "SELECT margin_percentage FROM cp_product_margins WHERE cp_id = ? AND product_id = ? AND is_active = TRUE",
    [cpId, productId]
  );

  if (productMargin.length) {
    return parseFloat(productMargin[0].margin_percentage);
  }

  const [categoryMargin] = await pool.execute(
    "SELECT margin_percentage FROM cp_category_margins WHERE cp_id = ? AND product_category = ? AND is_active = TRUE",
    [cpId, productCategory]
  );

  if (categoryMargin.length) {
    return parseFloat(categoryMargin[0].margin_percentage);
  }

  const [defaultMargin] = await pool.execute(
    "SELECT margin_percentage FROM default_margins WHERE product_category = ? AND is_active = TRUE",
    [productCategory]
  );

  if (defaultMargin.length) {
    return parseFloat(defaultMargin[0].margin_percentage);
  }

  return 0; // No margin found
}

export default router;




