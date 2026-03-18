import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

const DEFAULT_TEMPLATE = `Hi{name}!

🌟 Join Vrindavan Farm and get fresh, organic dairy products delivered to your doorstep!

✨ Special benefits:
• Fresh A2 milk daily
• Organic dairy products
• Home delivery
• Best prices

👉 Click here to join: {link}

Download our app and start ordering today! 🥛🍯`;

async function getInviteTemplateRow() {
  try {
    const [rows] = await pool.execute(
      "SELECT id, message_template, is_active, updated_at FROM cp_invite_message_settings WHERE id = 1 LIMIT 1"
    );
    if (rows?.length) return rows[0];
  } catch (e) {
    // Table may not exist yet in dev; fallback to default template
  }
  return { id: 1, message_template: DEFAULT_TEMPLATE, is_active: 1, updated_at: null };
}

// CP: Fetch invite message template
router.get("/", authenticate, async (req, res) => {
  try {
    const row = await getInviteTemplateRow();
    const template =
      row && String(row.is_active) === "1" && row.message_template ? String(row.message_template) : DEFAULT_TEMPLATE;
    return res.json({ template, updatedAt: row.updated_at || null });
  } catch (error) {
    console.error("Error fetching invite template:", error);
    return res.status(500).json({ error: "Failed to fetch invite template" });
  }
});

// Admin: Update invite message template
router.put(
  "/",
  authenticate,
  requireAdmin,
  body("message_template").isString().trim().isLength({ min: 5 }).withMessage("message_template is required"),
  body("is_active").optional().isBoolean().withMessage("is_active must be boolean"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const messageTemplate = String(req.body.message_template || "").trim();
      const isActive = req.body.is_active === undefined ? 1 : req.body.is_active ? 1 : 0;

      await pool.execute(
        `INSERT INTO cp_invite_message_settings (id, message_template, is_active)
         VALUES (1, ?, ?)
         ON DUPLICATE KEY UPDATE message_template = VALUES(message_template), is_active = VALUES(is_active), updated_at = NOW()`,
        [messageTemplate, isActive]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Error updating invite template:", error);
      return res.status(500).json({ error: "Failed to update invite template" });
    }
  }
);

export default router;


