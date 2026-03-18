import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";

const router = express.Router();

// Get targets for a CP
router.get("/cp/:cpId", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;
    const { year } = req.query;

    // CPs can only view their own targets
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let query = "SELECT * FROM cp_targets WHERE cp_id = ?";
    const params = [cpId];

    if (year) {
      query += " AND YEAR(target_month) = ?";
      params.push(year);
    }

    query += " ORDER BY target_month DESC";

    const [targets] = await pool.execute(query, params);
    res.json(targets);
  } catch (error) {
    console.error("Get targets error:", error);
    res.status(500).json({ error: "Failed to fetch targets" });
  }
});

// Get target with achievement (for dashboard)
router.get("/cp/:cpId/:month/:year", authenticate, async (req, res) => {
  try {
    const { cpId, month, year } = req.params;

    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const targetMonth = `${year}-${month.padStart(2, "0")}-01`;

    // Get target
    const [targets] = await pool.execute("SELECT * FROM cp_targets WHERE cp_id = ? AND target_month = ?", [
      cpId,
      targetMonth,
    ]);

    // Get achievements
    const [achievements] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT user_id) as new_customers,
        SUM(eligible_amount) as sales_amount
       FROM cp_commission_ledger
       WHERE cp_id = ?
       AND MONTH(order_date) = ?
       AND YEAR(order_date) = ?
       AND status = 'Approved'`,
      [cpId, month, year]
    );

    const target = targets[0] || {
      new_customer_target: 0,
      sales_target_amount: 0,
      bonus_per_customer: 200,
      bonus_enabled: 1,
    };

    const achievement = achievements[0] || {
      new_customers: 0,
      sales_amount: 0,
    };

    res.json({
      target,
      achievement: {
        new_customers: achievement.new_customers || 0,
        sales_amount: achievement.sales_amount || 0,
      },
      bonus: {
        per_customer: target.bonus_enabled ? (target.bonus_per_customer || 0) : 0,
        earned: target.bonus_enabled ? ((achievement.new_customers || 0) * (target.bonus_per_customer || 0)) : 0,
        enabled: !!target.bonus_enabled,
      },
      performance: {
        customer_percentage:
          target.new_customer_target > 0
            ? ((achievement.new_customers / target.new_customer_target) * 100).toFixed(2)
            : 0,
        sales_percentage:
          target.sales_target_amount > 0
            ? ((achievement.sales_amount / target.sales_target_amount) * 100).toFixed(2)
            : 0,
      },
    });
  } catch (error) {
    console.error("Get target with achievement error:", error);
    res.status(500).json({ error: "Failed to fetch target" });
  }
});

// Set target (Admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("cp_id").isInt(),
    body("target_month").isISO8601(),
    body("new_customer_target").optional().isInt({ min: 0 }),
    body("sales_target_amount").optional().isFloat({ min: 0 }),
    body("bonus_per_customer").optional().isInt({ min: 0 }),
    body("bonus_enabled").optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        cp_id,
        target_month,
        new_customer_target = 0,
        sales_target_amount = 0,
        bonus_per_customer = 200,
        bonus_enabled = true,
      } = req.body;

      await pool.execute(
        `INSERT INTO cp_targets (cp_id, target_month, new_customer_target, sales_target_amount, bonus_per_customer, bonus_enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
         new_customer_target = VALUES(new_customer_target),
         sales_target_amount = VALUES(sales_target_amount),
         bonus_per_customer = VALUES(bonus_per_customer),
         bonus_enabled = VALUES(bonus_enabled)`,
        [
          cp_id,
          target_month,
          new_customer_target,
          sales_target_amount,
          bonus_per_customer,
          bonus_enabled ? 1 : 0,
        ]
      );

      await auditLog(req, "SET_CP_TARGET", "target", cp_id, null, req.body);

      const [target] = await pool.execute("SELECT * FROM cp_targets WHERE cp_id = ? AND target_month = ?", [
        cp_id,
        target_month,
      ]);

      res.json(target[0]);
    } catch (error) {
      console.error("Set target error:", error);
      res.status(500).json({ error: "Failed to set target" });
    }
  }
);

export default router;




