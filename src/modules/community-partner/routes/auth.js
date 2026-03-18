import bcrypt from "bcryptjs";
import express from "express";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import pool from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Temporary storage for step 1 data (in-memory, expires after 30 minutes)
const tempRegistrations = new Map();
const TEMP_EXPIRY = 30 * 60 * 1000; // 30 minutes

// Clean up expired registrations every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [id, data] of tempRegistrations.entries()) {
      if (now - data.timestamp > TEMP_EXPIRY) {
        tempRegistrations.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

// Login is now handled by loginHandler in middleware/auth.js
// This route is kept for API compatibility (JSON responses)
router.post("/login", [body("email").isEmail().normalizeEmail(), body("password").notEmpty()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const [users] = await pool.execute("SELECT id, email, password_hash, role, cp_id, is_active FROM cp_users WHERE email = ?", [email]);

    if (!users.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(401).json({ error: "Account is inactive" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await pool.execute("UPDATE cp_users SET last_login = NOW() WHERE id = ?", [user.id]);

    // For API, still return JWT token
    const token = jwt.sign({ userId: user.id, role: user.role, cpId: user.cp_id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        cpId: user.cp_id,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role === "cp" && req.user.cp_id) {
      const [cps] = await pool.execute("SELECT id, name, phone, email, status FROM community_partners WHERE id = ?", [req.user.cp_id]);
      if (cps.length) {
        return res.json({
          user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            cp: cps[0],
          },
        });
      }
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

// Change password
router.post("/change-password", authenticate, [body("currentPassword").notEmpty(), body("newPassword").isLength({ min: 6 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const [users] = await pool.execute("SELECT password_hash FROM cp_users WHERE id = ?", [req.user.id]);

    const isValidPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.execute("UPDATE cp_users SET password_hash = ? WHERE id = ?", [newPasswordHash, req.user.id]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Register Step 1 - Collect basic information
router.post(
  "/register-step1",
  [
    body("name").notEmpty().trim(),
    body("phone")
      .notEmpty()
      .matches(/^[0-9]{10}$/)
      .withMessage("Phone must be 10 digits"),
    body("email").isEmail().normalizeEmail(),
    body("community_name").notEmpty().trim(),
    body("location").notEmpty().trim(),
    body("units").isInt({ min: 1 }).withMessage("Number of units must be a positive integer"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, email, community_name, location, units } = req.body;

      // Check if email already exists
      const [existingCP] = await pool.execute("SELECT id FROM community_partners WHERE email = ?", [email]);

      if (existingCP.length) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const [existingUser] = await pool.execute("SELECT id FROM cp_users WHERE email = ?", [email]);

      if (existingUser.length) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Store temporary registration data
      const tempId = uuidv4();
      tempRegistrations.set(tempId, {
        name,
        phone,
        email,
        community_name,
        location,
        units: parseInt(units),
        timestamp: Date.now(),
      });

      res.status(200).json({
        message: "Step 1 completed successfully",
        temp_id: tempId,
      });
    } catch (error) {
      console.error("Registration step 1 error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  },
);

// Register Step 2 - Set password and complete registration
router.post("/register-step2", [body("temp_id").notEmpty(), body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { temp_id, password } = req.body;

    // Retrieve temporary registration data
    const tempData = tempRegistrations.get(temp_id);
    if (!tempData) {
      return res.status(400).json({ error: "Invalid or expired registration session. Please start again." });
    }

    // Check if expired
    if (Date.now() - tempData.timestamp > TEMP_EXPIRY) {
      tempRegistrations.delete(temp_id);
      return res.status(400).json({ error: "Registration session expired. Please start again." });
    }

    const { name, phone, email, community_name, location, units } = tempData;

    // Double-check email doesn't exist (race condition protection)
    const [existingCP] = await pool.execute("SELECT id FROM community_partners WHERE email = ?", [email]);

    if (existingCP.length) {
      tempRegistrations.delete(temp_id);
      return res.status(409).json({ error: "Email already registered" });
    }

    const [existingUser] = await pool.execute("SELECT id FROM cp_users WHERE email = ?", [email]);

    if (existingUser.length) {
      tempRegistrations.delete(temp_id);
      return res.status(409).json({ error: "Email already registered" });
    }

    // Create community partner record
    const [cpResult] = await pool.execute(
      `INSERT INTO community_partners 
         (name, phone, email, address, status, date_joined)
         VALUES (?, ?, ?, ?, 'Pending', CURDATE())`,
      [name, phone, email, `${community_name}, ${location} (${units} units)`],
    );

    const cpId = cpResult.insertId;

    // Create user account
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.execute(
      `INSERT INTO cp_users (email, password_hash, role, cp_id, is_active)
         VALUES (?, ?, 'cp', ?, TRUE)`,
      [email, passwordHash, cpId],
    );

    // Clean up temporary data
    tempRegistrations.delete(temp_id);

    res.status(201).json({
      message: "Registration successful! Your account is pending approval. You can login once approved.",
      cp_id: cpId,
      status: "Pending",
    });
  } catch (error) {
    console.error("Registration step 2 error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// Register new community partner (legacy endpoint - kept for backward compatibility)
router.post(
  "/register",
  [
    body("name").notEmpty().trim(),
    body("phone")
      .notEmpty()
      .matches(/^[0-9]{10}$/)
      .withMessage("Phone must be 10 digits"),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("address").optional().trim(),
    body("bank_account_number").optional(),
    body("bank_ifsc").optional(),
    body("bank_name").optional(),
    body("pan_number").optional(),
    body("gst_number").optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone, email, password, address, bank_account_number, bank_ifsc, bank_name, pan_number, gst_number } = req.body;

      // Check if email already exists in community_partners
      const [existingCP] = await pool.execute("SELECT id FROM community_partners WHERE email = ?", [email]);

      if (existingCP.length) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Check if email already exists in cp_users
      const [existingUser] = await pool.execute("SELECT id FROM cp_users WHERE email = ?", [email]);

      if (existingUser.length) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Create community partner record
      const [cpResult] = await pool.execute(
        `INSERT INTO community_partners 
         (name, phone, email, address, bank_account_number, bank_ifsc, bank_name, pan_number, gst_number, status, date_joined)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', CURDATE())`,
        [name, phone, email, address || null, bank_account_number || null, bank_ifsc || null, bank_name || null, pan_number || null, gst_number || null],
      );

      const cpId = cpResult.insertId;

      // Create user account
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.execute(
        `INSERT INTO cp_users (email, password_hash, role, cp_id, is_active)
         VALUES (?, ?, 'cp', ?, TRUE)`,
        [email, passwordHash, cpId],
      );

      res.status(201).json({
        message: "Registration successful. Your account is pending approval.",
        cp_id: cpId,
        status: "Pending",
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  },
);

export default router;
