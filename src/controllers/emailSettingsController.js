import emailService from "../services/emailService.js";
import { buildSEO } from "../utils/seo.js";

class EmailSettingsController {
  // Render email settings page
  static async getEmailSettings(req, res) {
    try {
      const seo = buildSEO({
        title: "Email Settings - Operations Management",
        description: "Configure reminder emails and notification preferences for service schedules",
        url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      });

      res.render("pages/ops/email-settings", {
        title: "Email Settings",
        seo,
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering email settings page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load email settings page",
      });
    }
  }

  // Load email settings
  static async loadSettings(req, res) {
    try {
      const settings = emailService.getAllSettings();
      res.json({ success: true, ...settings });
    } catch (error) {
      console.error("Error loading email settings:", error);
      res.json({ success: false, error: "Failed to load settings" });
    }
  }

  // Save email configuration
  static async saveConfig(req, res) {
    try {
      const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure } = req.body;

      const config = {
        smtp_host,
        smtp_port: parseInt(smtp_port) || 587,
        smtp_user,
        smtp_pass,
        smtp_secure: smtp_secure === "on" || smtp_secure === true,
      };

      const success = emailService.updateConfig(config);

      if (success) {
        res.json({ success: true, message: "Email configuration saved successfully" });
      } else {
        res.json({ success: false, error: "Failed to save email configuration" });
      }
    } catch (error) {
      console.error("Error saving email configuration:", error);
      res.json({ success: false, error: "Failed to save email configuration" });
    }
  }

  // Save reminder settings
  static async saveReminderSettings(req, res) {
    try {
      const { reminder_enabled, reminder_frequency, reminder_days_before, reminder_recipients, issue_alert_enabled, issue_status_change_enabled, issue_alert_recipients, material_transaction_alerts, low_stock_alerts, material_alert_recipients } = req.body;

      const settings = {
        reminder_enabled: reminder_enabled === "on" || reminder_enabled === true,
        reminder_frequency,
        reminder_days_before: parseInt(reminder_days_before) || 7,
        reminder_recipients,
        issue_alert_enabled: issue_alert_enabled === "on" || issue_alert_enabled === true,
        issue_status_change_enabled: issue_status_change_enabled === "on" || issue_status_change_enabled === true,
        issue_alert_recipients,
        material_transaction_alerts: material_transaction_alerts === "on" || material_transaction_alerts === true,
        low_stock_alerts: low_stock_alerts === "on" || low_stock_alerts === true,
        material_alert_recipients,
      };

      const success = emailService.updateReminderSettings(settings);

      if (success) {
        res.json({ success: true, message: "Alert settings saved successfully" });
      } else {
        res.json({ success: false, error: "Failed to save alert settings" });
      }
    } catch (error) {
      console.error("Error saving alert settings:", error);
      res.json({ success: false, error: "Failed to save alert settings" });
    }
  }

  // Save email templates
  static async saveTemplates(req, res) {
    try {
      const { templates } = req.body;

      const success = emailService.updateTemplates(templates);

      if (success) {
        res.json({ success: true, message: "Email templates saved successfully" });
      } else {
        res.json({ success: false, error: "Failed to save email templates" });
      }
    } catch (error) {
      console.error("Error saving email templates:", error);
      res.json({ success: false, error: "Failed to save email templates" });
    }
  }

  // Save specific template
  static async saveTemplate(req, res) {
    try {
      const { templateType, templateData } = req.body;

      const success = emailService.updateTemplate(templateType, templateData);

      if (success) {
        res.json({ success: true, message: "Email template saved successfully" });
      } else {
        res.json({ success: false, error: "Failed to save email template" });
      }
    } catch (error) {
      console.error("Error saving email template:", error);
      res.json({ success: false, error: "Failed to save email template" });
    }
  }

  // Test email connection
  static async testConnection(req, res) {
    try {
      const { smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure } = req.body;

      // Temporarily update config for testing
      const originalConfig = emailService.config;
      emailService.updateConfig({
        smtp_host,
        smtp_port: parseInt(smtp_port) || 587,
        smtp_user,
        smtp_pass,
        smtp_secure: smtp_secure === "on" || smtp_secure === true,
      });

      const result = await emailService.testConnection();

      // Restore original config
      emailService.updateConfig(originalConfig);

      res.json(result);
    } catch (error) {
      console.error("Error testing email connection:", error);
      res.json({ success: false, error: "Failed to test email connection" });
    }
  }

  // Send test email
  static async sendTestEmail(req, res) {
    try {
      const { test_email } = req.body;

      if (!test_email) {
        return res.json({ success: false, error: "Test email address is required" });
      }

      const result = await emailService.sendTestEmail(test_email);
      res.json(result);
    } catch (error) {
      console.error("Error sending test email:", error);
      res.json({ success: false, error: "Failed to send test email" });
    }
  }
}

export default EmailSettingsController;
