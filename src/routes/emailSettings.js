import express from "express";
import EmailSettingsController from "../controllers/emailSettingsController.js";

const router = express.Router();

// Email settings page
router.get("/", EmailSettingsController.getEmailSettings);

// Load email settings
router.get("/load", EmailSettingsController.loadSettings);

// Save email configuration
router.post("/config", EmailSettingsController.saveConfig);

// Save reminder settings
router.post("/reminders", EmailSettingsController.saveReminderSettings);

// Save email templates
router.post("/templates", EmailSettingsController.saveTemplates);

// Save specific template
router.post("/template", EmailSettingsController.saveTemplate);

// Test email connection
router.post("/test-connection", EmailSettingsController.testConnection);

// Send test email
router.post("/test", EmailSettingsController.sendTestEmail);

export default router;
