import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { auditLog } from "../middleware/auditLog.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// Get locality mappings for a CP
router.get("/cp/:cpId/localities", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;

    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [mappings] = await pool.execute("SELECT * FROM cp_locality_mappings WHERE cp_id = ? AND is_active = TRUE", [cpId]);
    res.json(mappings);
  } catch (error) {
    console.error("Get locality mappings error:", error);
    res.status(500).json({ error: "Failed to fetch locality mappings" });
  }
});

// Add locality mapping (Admin only)
router.post("/cp/:cpId/localities", authenticate, requireAdmin, [body("locality_id").isInt()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpId } = req.params;
    const { locality_id } = req.body;

    await pool.execute(
      `INSERT INTO cp_locality_mappings (cp_id, locality_id, is_active)
         VALUES (?, ?, TRUE)
         ON DUPLICATE KEY UPDATE is_active = TRUE`,
      [cpId, locality_id],
    );

    await auditLog(req, "ADD_LOCALITY_MAPPING", "mapping", cpId, null, { locality_id });

    const [mappings] = await pool.execute("SELECT * FROM cp_locality_mappings WHERE cp_id = ? AND locality_id = ?", [cpId, locality_id]);

    res.json(mappings[0]);
  } catch (error) {
    console.error("Add locality mapping error:", error);
    res.status(500).json({ error: "Failed to add locality mapping" });
  }
});

// Remove locality mapping (Admin only)
router.delete("/cp/:cpId/localities/:localityId", authenticate, requireAdmin, async (req, res) => {
  try {
    const { cpId, localityId } = req.params;

    await pool.execute("UPDATE cp_locality_mappings SET is_active = FALSE WHERE cp_id = ? AND locality_id = ?", [cpId, localityId]);

    await auditLog(req, "REMOVE_LOCALITY_MAPPING", "mapping", cpId, null, { locality_id: localityId });

    res.json({ message: "Locality mapping removed" });
  } catch (error) {
    console.error("Remove locality mapping error:", error);
    res.status(500).json({ error: "Failed to remove locality mapping" });
  }
});

// Get customer mappings for a CP
router.get("/cp/:cpId/customers", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;

    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [mappings] = await pool.execute("SELECT * FROM cp_customer_mappings WHERE cp_id = ? AND is_active = TRUE ORDER BY created_at DESC", [cpId]);
    res.json(mappings);
  } catch (error) {
    console.error("Get customer mappings error:", error);
    res.status(500).json({ error: "Failed to fetch customer mappings" });
  }
});

// Add customer mapping (Admin or CP can add)
router.post("/cp/:cpId/customers", authenticate, [body("user_id").optional().isInt(), body("customer_phone").optional().notEmpty(), body("customer_name").optional().notEmpty()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpId } = req.params;

    // CPs can only add customers to their own account
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { user_id, customer_phone, customer_name, locality_id, status } = req.body;

    if (!user_id && !customer_phone) {
      return res.status(400).json({ error: "Either user_id or customer_phone is required" });
    }

    // Use status from body or default to 'Invited' if it's a new invitation
    const customerStatus = status || "Invited";

    await pool.execute(
      `INSERT INTO cp_customer_mappings (cp_id, user_id, customer_phone, customer_name, locality_id, is_active, status)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)
         ON DUPLICATE KEY UPDATE is_active = TRUE, customer_name = COALESCE(?, customer_name), status = COALESCE(?, status)`,
      [cpId, user_id || null, customer_phone || null, customer_name || null, locality_id || null, customerStatus, customer_name, customerStatus],
    );

    await auditLog(req, "ADD_CUSTOMER_MAPPING", "mapping", cpId, null, req.body);

    const [mappings] = await pool.execute("SELECT * FROM cp_customer_mappings WHERE cp_id = ? AND (user_id = ? OR customer_phone = ?)", [cpId, user_id || 0, customer_phone || ""]);

    res.json(mappings[0] || { message: "Customer mapping added" });
  } catch (error) {
    console.error("Add customer mapping error:", error);
    res.status(500).json({ error: "Failed to add customer mapping" });
  }
});

// Generate invitation link for CP
router.get("/cp/:cpId/invite-link", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;

    // CPs can only generate links for their own account
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Use BASE_URL from env if set, otherwise derive from request
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${baseUrl}/cp/join/${cpId}`;

    res.json({ inviteLink });
  } catch (error) {
    console.error("Generate invite link error:", error);
    res.status(500).json({ error: "Failed to generate invite link" });
  }
});

// Invite customer via mobile number
router.post("/cp/:cpId/invite", authenticate, [body("customer_phone").optional().isMobilePhone("en-IN").withMessage("Valid mobile number is required")], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpId } = req.params;

    // CPs can only invite customers for their own account
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { customer_phone, customer_name, status } = req.body;
    const customerStatus = status || "Invited";

    // If no phone provided, return error (phone is required for tracking)
    if (!customer_phone) {
      return res.status(400).json({ error: "Phone number is required for tracking" });
    }

    // Check if customer already exists
    const [existing] = await pool.execute("SELECT * FROM cp_customer_mappings WHERE cp_id = ? AND customer_phone = ?", [cpId, customer_phone]);

    let mapping;
    if (existing.length > 0) {
      // Update existing mapping
      await pool.execute(
        `UPDATE cp_customer_mappings 
           SET is_active = TRUE, status = ?, customer_name = COALESCE(?, customer_name)
           WHERE id = ?`,
        [customerStatus, customer_name || null, existing[0].id],
      );
      mapping = existing[0];
    } else {
      // Create new mapping
      const [result] = await pool.execute(
        `INSERT INTO cp_customer_mappings (cp_id, customer_phone, customer_name, is_active, status)
           VALUES (?, ?, ?, TRUE, ?)`,
        [cpId, customer_phone, customer_name || null, customerStatus],
      );
      const [newMapping] = await pool.execute("SELECT * FROM cp_customer_mappings WHERE id = ?", [result.insertId]);
      mapping = newMapping[0];
    }

    // Use BASE_URL from env if set, otherwise derive from request
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${baseUrl}/cp/join/${cpId}?phone=${encodeURIComponent(customer_phone)}`;

    await auditLog(req, "INVITE_CUSTOMER", "mapping", cpId, null, { customer_phone, inviteLink });

    res.json({
      success: true,
      mapping,
      inviteLink,
      message: "Customer invited successfully",
    });
  } catch (error) {
    console.error("Invite customer error:", error);
    res.status(500).json({ error: "Failed to invite customer" });
  }
});

// Update customer status
router.patch("/cp/:cpId/customers/:mappingId/status", authenticate, [body("status").isIn(["Invited", "Invitation link clicked", "Registered", "Wallet recharged", "Active"]).withMessage("Invalid status")], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpId, mappingId } = req.params;
    const { status } = req.body;

    // CPs can only update their own customers
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    await pool.execute("UPDATE cp_customer_mappings SET status = ? WHERE id = ? AND cp_id = ?", [status, mappingId, cpId]);

    await auditLog(req, "UPDATE_CUSTOMER_STATUS", "mapping", mappingId, null, { status });

    const [updated] = await pool.execute("SELECT * FROM cp_customer_mappings WHERE id = ?", [mappingId]);

    res.json(updated[0] || { message: "Status updated" });
  } catch (error) {
    console.error("Update customer status error:", error);
    res.status(500).json({ error: "Failed to update customer status" });
  }
});

// Remove customer mapping (CP can delete their own customers, Admin can delete any)
router.delete("/cp/:cpId/customers/:mappingId", authenticate, async (req, res) => {
  try {
    const { cpId, mappingId } = req.params;

    // CPs can only delete customers from their own account
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify the mapping belongs to this CP
    const [mapping] = await pool.execute("SELECT cp_id FROM cp_customer_mappings WHERE id = ? AND cp_id = ?", [mappingId, cpId]);
    if (mapping.length === 0) {
      return res.status(404).json({ error: "Customer mapping not found" });
    }

    await pool.execute("UPDATE cp_customer_mappings SET is_active = FALSE WHERE id = ?", [mappingId]);

    await auditLog(req, "REMOVE_CUSTOMER_MAPPING", "mapping", mappingId, null, null);

    res.json({ message: "Customer removed successfully" });
  } catch (error) {
    console.error("Remove customer mapping error:", error);
    res.status(500).json({ error: "Failed to remove customer" });
  }
});

// Find CP for a customer (used by order sync)
export async function findCPForCustomer(userId, localityId) {
  // Priority: direct customer mapping > locality mapping
  const [customerMapping] = await pool.execute("SELECT cp_id FROM cp_customer_mappings WHERE user_id = ? AND is_active = TRUE LIMIT 1", [userId]);

  if (customerMapping.length) {
    return customerMapping[0].cp_id;
  }

  if (localityId) {
    const [localityMapping] = await pool.execute("SELECT cp_id FROM cp_locality_mappings WHERE locality_id = ? AND is_active = TRUE LIMIT 1", [localityId]);

    if (localityMapping.length) {
      return localityMapping[0].cp_id;
    }
  }

  return null;
}

export default router;
