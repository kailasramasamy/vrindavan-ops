import express from "express";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";

const router = express.Router();

// Get all CPs (Admin only)
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = "SELECT * FROM community_partners WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (search) {
      query += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += " ORDER BY created_at DESC";

    const [cps] = await pool.execute(query, params);
    res.json(cps);
  } catch (error) {
    console.error("Get CPs error:", error);
    res.status(500).json({ error: "Failed to fetch CPs" });
  }
});

// Get single CP
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // CPs can only view their own profile
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [cps] = await pool.execute(
      "SELECT * FROM community_partners WHERE id = ?",
      [id]
    );

    if (!cps.length) {
      return res.status(404).json({ error: "CP not found" });
    }

    res.json(cps[0]);
  } catch (error) {
    console.error("Get CP error:", error);
    res.status(500).json({ error: "Failed to fetch CP" });
  }
});

// Create CP (Admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("name").notEmpty().trim(),
    body("phone").notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("status").optional().isIn(["Pending", "Active", "On Hold", "Terminated"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        phone,
        email,
        address,
        bank_account_number,
        bank_ifsc,
        bank_name,
        pan_number,
        gst_number,
        status = "Pending",
        date_joined,
      } = req.body;

      // Check if email already exists
      const [existing] = await pool.execute(
        "SELECT id FROM community_partners WHERE email = ?",
        [email]
      );

      if (existing.length) {
        return res.status(409).json({ error: "Email already exists" });
      }

      const [result] = await pool.execute(
        `INSERT INTO community_partners 
         (name, phone, email, address, bank_account_number, bank_ifsc, bank_name, pan_number, gst_number, status, date_joined)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          phone,
          email,
          address || null,
          bank_account_number || null,
          bank_ifsc || null,
          bank_name || null,
          pan_number || null,
          gst_number || null,
          status,
          date_joined || new Date(),
        ]
      );

      const cpId = result.insertId;

      // Create user account for CP
      const defaultPassword = "cp123456"; // Should be changed on first login
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      await pool.execute(
        `INSERT INTO cp_users (email, password_hash, role, cp_id, is_active)
         VALUES (?, ?, 'cp', ?, TRUE)`,
        [email, passwordHash, cpId]
      );

      await auditLog(req, "CREATE_CP", "cp", cpId, null, req.body);

      const [newCP] = await pool.execute(
        "SELECT * FROM community_partners WHERE id = ?",
        [cpId]
      );

      res.status(201).json(newCP[0]);
    } catch (error) {
      console.error("Create CP error:", error);
      res.status(500).json({ error: "Failed to create CP" });
    }
  }
);

// Update CP
router.put(
  "/:id",
  authenticate,
  [
    body("name").optional().notEmpty().trim(),
    body("phone").optional().notEmpty(),
    body("email").optional().isEmail().normalizeEmail(),
    body("status").optional().isIn(["Pending", "Active", "On Hold", "Terminated"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      // CPs can only update their own profile (limited fields)
      if (req.user.role === "cp" && req.user.cp_id !== parseInt(id)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get existing CP
      const [existing] = await pool.execute(
        "SELECT * FROM community_partners WHERE id = ?",
        [id]
      );

      if (!existing.length) {
        return res.status(404).json({ error: "CP not found" });
      }

      const oldValues = existing[0];

      // Build update query dynamically
      const allowedFields =
        req.user.role === "admin"
          ? [
              "name",
              "phone",
              "email",
              "address",
              "bank_account_number",
              "bank_ifsc",
              "bank_name",
              "pan_number",
              "gst_number",
              "status",
            ]
          : ["name", "phone", "address", "bank_account_number", "bank_ifsc", "bank_name"];

      const updates = [];
      const values = [];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      values.push(id);

      await pool.execute(
        `UPDATE community_partners SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      await auditLog(req, "UPDATE_CP", "cp", id, oldValues, req.body);

      const [updated] = await pool.execute(
        "SELECT * FROM community_partners WHERE id = ?",
        [id]
      );

      res.json(updated[0]);
    } catch (error) {
      console.error("Update CP error:", error);
      res.status(500).json({ error: "Failed to update CP" });
    }
  }
);

// Get CP statistics (for dashboard)
router.get("/:id/stats", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // CPs can only view their own stats
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(id)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get total customers
    const [customerCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM cp_customer_mappings WHERE cp_id = ? AND is_active = TRUE`,
      [id]
    );

    // Get total orders and commission
    const [commissionStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(eligible_amount) as total_sales,
        SUM(commission_amount) as total_commission
       FROM cp_commission_ledger 
       WHERE cp_id = ? AND status = 'Approved'`,
      [id]
    );

    // Get this month's commission
    const [monthlyStats] = await pool.execute(
      `SELECT 
        COUNT(*) as orders,
        SUM(eligible_amount) as sales,
        SUM(commission_amount) as commission
       FROM cp_commission_ledger 
       WHERE cp_id = ? AND status = 'Approved' 
       AND MONTH(order_date) = MONTH(CURRENT_DATE())
       AND YEAR(order_date) = YEAR(CURRENT_DATE())`,
      [id]
    );

    res.json({
      totalCustomers: customerCount[0].count || 0,
      totalOrders: commissionStats[0].total_orders || 0,
      totalSales: commissionStats[0].total_sales || 0,
      totalCommission: commissionStats[0].total_commission || 0,
      monthlyOrders: monthlyStats[0].orders || 0,
      monthlySales: monthlyStats[0].sales || 0,
      monthlyCommission: monthlyStats[0].commission || 0,
    });
  } catch (error) {
    console.error("Get CP stats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;

