import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";

const router = express.Router();

// Get commissions for a CP
router.get("/cp/:cpId", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;
    const { status, month, year } = req.query;

    // CPs can only view their own commissions
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let query = `
      SELECT 
        id,
        order_id,
        user_id,
        order_date,
        gross_order_amount,
        eligible_amount,
        commission_rate,
        commission_amount,
        status,
        source,
        notes,
        created_at
      FROM cp_commission_ledger
      WHERE cp_id = ?
    `;
    const params = [cpId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (month && year) {
      query += " AND MONTH(order_date) = ? AND YEAR(order_date) = ?";
      params.push(month, year);
    }

    query += " ORDER BY order_date DESC";

    const [commissions] = await pool.execute(query, params);
    res.json(commissions);
  } catch (error) {
    console.error("Get commissions error:", error);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

// Update commission status (Admin only)
router.patch(
  "/:id/status",
  authenticate,
  requireAdmin,
  [body("status").isIn(["Pending", "Approved", "Reversed"])],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      // Get existing commission
      const [existing] = await pool.execute("SELECT * FROM cp_commission_ledger WHERE id = ?", [id]);

      if (!existing.length) {
        return res.status(404).json({ error: "Commission not found" });
      }

      const oldValues = existing[0];

      await pool.execute("UPDATE cp_commission_ledger SET status = ?, notes = ? WHERE id = ?", [status, notes || null, id]);

      await auditLog(req, "UPDATE_COMMISSION_STATUS", "commission", id, oldValues, { status, notes });

      const [updated] = await pool.execute("SELECT * FROM cp_commission_ledger WHERE id = ?", [id]);

      res.json(updated[0]);
    } catch (error) {
      console.error("Update commission status error:", error);
      res.status(500).json({ error: "Failed to update commission status" });
    }
  }
);

// Manual commission adjustment (Admin only)
router.post(
  "/manual",
  authenticate,
  requireAdmin,
  [
    body("cp_id").isInt(),
    body("commission_amount").isFloat({ min: 0 }),
    body("notes").notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { cp_id, commission_amount, notes, order_date } = req.body;

      const [result] = await pool.execute(
        `INSERT INTO cp_commission_ledger 
         (cp_id, order_id, user_id, order_date, gross_order_amount, eligible_amount, 
          commission_rate, commission_amount, status, source, notes)
         VALUES (?, 0, 0, ?, 0, ?, 0, ?, 'Pending', 'Manual Adjustment', ?)`,
        [cp_id, order_date || new Date(), commission_amount, commission_amount, notes]
      );

      await auditLog(req, "CREATE_MANUAL_COMMISSION", "commission", result.insertId, null, req.body);

      const [commission] = await pool.execute("SELECT * FROM cp_commission_ledger WHERE id = ?", [result.insertId]);

      res.status(201).json(commission[0]);
    } catch (error) {
      console.error("Create manual commission error:", error);
      res.status(500).json({ error: "Failed to create manual commission" });
    }
  }
);

export default router;




