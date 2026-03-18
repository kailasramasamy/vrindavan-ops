import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";

class EmailService {
  constructor() {
    this.transporter = null;
    this.config = null;
    this.settings = null;
    this.templates = null;
    this.loadSettings();
  }

  // Load settings from file
  loadSettings() {
    try {
      const settingsPath = path.join(process.cwd(), "data", "email-settings.json");
      if (fs.existsSync(settingsPath)) {
        const settingsData = fs.readFileSync(settingsPath, "utf8");
        const settings = JSON.parse(settingsData);
        this.config = settings.config || {};
        this.settings = {
          // Default reminder settings
          reminder_enabled: false,
          reminder_frequency: "weekly",
          reminder_days_before: 7,
          reminder_recipients: "",
          // Default issue alert settings
          issue_alert_enabled: false,
          issue_status_change_enabled: false,
          issue_alert_recipients: "",
          // Default material alert settings
          material_transaction_alerts: false,
          low_stock_alerts: false,
          material_alert_recipients: "",
          // Load existing settings
          ...(settings.reminders || {}),
        };

        // Handle migration from old template structure to new templates structure
        if (settings.templates) {
          this.templates = settings.templates;
        } else if (settings.template) {
          // Migrate old single template to new structure
          this.templates = {
            service_reminder: {
              name: "Service Reminder",
              subject: settings.template.email_subject || "Service Reminder: {service_type} due for {machine_name}",
              template: settings.template.email_template || this.getDefaultTemplates().service_reminder.template,
            },
            issue_alert: this.getDefaultTemplates().issue_alert,
          };
        } else {
          this.templates = this.getDefaultTemplates();
        }

        this.createTransporter();
      }
    } catch (error) {
      console.error("Error loading email settings:", error);
    }
  }

  // Save settings to file
  saveSettings() {
    try {
      const settingsPath = path.join(process.cwd(), "data", "email-settings.json");
      const settingsDir = path.dirname(settingsPath);

      // Create data directory if it doesn't exist
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }

      const settingsData = {
        config: this.config,
        reminders: this.settings,
        templates: this.templates,
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2));
      return true;
    } catch (error) {
      console.error("Error saving email settings:", error);
      return false;
    }
  }

  // Create email transporter
  createTransporter() {
    if (!this.config.smtp_host || !this.config.smtp_user || !this.config.smtp_pass) {
      console.log("Cannot create transporter: missing required config", {
        host: !!this.config.smtp_host,
        user: !!this.config.smtp_user,
        pass: !!this.config.smtp_pass,
      });
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp_host,
        port: parseInt(this.config.smtp_port) || 587,
        secure: this.config.smtp_secure === "on" || this.config.smtp_secure === true,
        auth: {
          user: this.config.smtp_user,
          pass: this.config.smtp_pass,
        },
      });
      console.log("Email transporter created successfully");
      return true;
    } catch (error) {
      console.error("Error creating email transporter:", error);
      return false;
    }
  }

  // Test email connection
  async testConnection() {
    // Check if email configuration is complete
    if (!this.config.smtp_host || !this.config.smtp_user || !this.config.smtp_pass) {
      return { success: false, error: "Please configure SMTP settings first (Host, Email, and Password are required)" };
    }

    if (!this.transporter) {
      return { success: false, error: "Email transporter not configured. Please check your SMTP settings and try again." };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      console.error("Connection test error:", error);

      // Provide more specific error messages
      if (error.code === "EAUTH") {
        return { success: false, error: "Authentication failed. Please check your email address and app password." };
      } else if (error.code === "ECONNECTION") {
        return { success: false, error: "Connection failed. Please check your SMTP host and port settings." };
      } else if (error.code === "ETIMEDOUT") {
        return { success: false, error: "Connection timed out. Please check your network connection and SMTP settings." };
      } else {
        return { success: false, error: `Connection test failed: ${error.message}` };
      }
    }
  }

  // Send test email
  async sendTestEmail(toEmail) {
    // Check if email configuration is complete
    if (!this.config.smtp_host || !this.config.smtp_user || !this.config.smtp_pass) {
      return { success: false, error: "Please configure SMTP settings first (Host, Email, and Password are required)" };
    }

    if (!this.transporter) {
      return { success: false, error: "Email transporter not configured. Please check your SMTP settings and try again." };
    }

    try {
      const mailOptions = {
        from: this.config.smtp_user,
        to: toEmail,
        subject: "Test Email - Operations Management System",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Test Email</h2>
            <p>This is a test email from your Operations Management System.</p>
            <p>If you received this email, your email configuration is working correctly!</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              Sent on: ${new Date().toLocaleString()}<br>
              From: Operations Management System
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      console.error("Test email error:", error);

      // Provide more specific error messages
      if (error.code === "EAUTH") {
        return { success: false, error: "Authentication failed. Please check your email address and app password." };
      } else if (error.code === "ECONNECTION") {
        return { success: false, error: "Connection failed. Please check your SMTP host and port settings." };
      } else if (error.code === "ETIMEDOUT") {
        return { success: false, error: "Connection timed out. Please check your network connection and SMTP settings." };
      } else {
        return { success: false, error: `Email sending failed: ${error.message}` };
      }
    }
  }

  // Get default templates
  getDefaultTemplates() {
    return {
      service_reminder: {
        name: "Service Reminder",
        subject: "Service Reminder: {service_type} due for {machine_name}",
        template: `Dear Team,

This is a reminder that the following service is due:

Machine: {machine_name} ({serial_number})
Service Type: {service_type}
Due Date: {due_date}
Days Remaining: {days_remaining}
Location: {location}

Please schedule this service at your earliest convenience.

Best regards,
Operations Team`,
      },
      issue_alert: {
        name: "Issue Alert",
        subject: "URGENT: Issue Reported - {machine_name}",
        template: `Dear Team,

An urgent issue has been reported for the following machine:

Machine: {machine_name} ({serial_number})
Issue Type: {issue_type}
Severity: {severity}
Description: {description}
Reported By: {reported_by}
Reported At: {reported_at}
Location: {location}

Please take immediate action to address this issue.

Best regards,
Operations Team`,
      },
      status_change: {
        name: "Status Change Alert",
        subject: "Issue Status Updated - {machine_name}",
        template: `Dear Team,

The status of an issue has been updated:

Machine: {machine_name} ({serial_number})
Issue Type: {issue_type}
Previous Status: {previous_status}
New Status: {new_status}
Updated By: {updated_by}
Updated At: {updated_at}
Location: {location}

Please review the updated status and take any necessary action.

Best regards,
Operations Team`,
      },
      material_transaction: {
        name: "Material Transaction Alert",
        subject: "Material Transaction: {transaction_type} - {material_name}",
        template: `Dear Team,

A material transaction has been recorded:

Material: {material_name} ({material_sku})
Transaction Type: {transaction_type}
Quantity: {transaction_quantity}
Location: {location}
Transaction Date: {transaction_date}
Performed By: {user_name}

Please review this transaction for accuracy.

Best regards,
Operations Team`,
      },
      low_stock_alert: {
        name: "Low Stock Alert",
        subject: "LOW STOCK ALERT: {material_name} - {current_stock} remaining",
        template: `Dear Team,

A material has reached low stock level:

Material: {material_name} ({material_sku})
Current Stock: {current_stock}
Minimum Stock: {min_stock}
Location: {location}
Alert Date: {alert_date}

Please reorder this material immediately to avoid stockout.

Best regards,
Operations Team`,
      },
    };
  }

  // Send reminder email
  async sendReminderEmail(serviceData) {
    if (!this.transporter || !this.settings.reminder_enabled) {
      return { success: false, error: "Email reminders not enabled" };
    }

    try {
      const recipients = this.settings.reminder_recipients
        ?.split(",")
        .map((email) => email.trim())
        .filter((email) => email);
      if (!recipients || recipients.length === 0) {
        return { success: false, error: "No recipients configured" };
      }

      const template = this.templates.service_reminder || this.getDefaultTemplates().service_reminder;
      const subject = this.replaceVariables(template.subject, serviceData);
      const htmlContent = this.replaceVariables(template.template, serviceData);

      const mailOptions = {
        from: this.config.smtp_user,
        to: recipients.join(", "),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">Service Reminder</h1>
        </div>
            <div style="padding: 20px; background: #f9fafb; border-radius: 0 0 8px 8px;">
              <div style="white-space: pre-line; line-height: 1.6; color: #374151;">${htmlContent}</div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #e0f2fe; padding: 15px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <h3 style="margin: 0 0 10px 0; color: #0c4a6e;">Action Required</h3>
                <p style="margin: 0; color: #0c4a6e;">Please schedule this service at your earliest convenience to avoid any delays.</p>
        </div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                This is an automated reminder from the Operations Management System<br>
                Sent on: ${new Date().toLocaleString()}
              </p>
      </div>
    </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Replace variables in template
  replaceVariables(template, data) {
    let result = template;

    // Replace all possible variables
    const variables = {
      // Service reminder variables
      "{machine_name}": data.machine_name || "N/A",
      "{serial_number}": data.serial_number || "N/A",
      "{service_type}": data.service_type || "N/A",
      "{due_date}": data.due_date ? new Date(data.due_date).toLocaleDateString() : "N/A",
      "{days_remaining}": data.days_remaining || "N/A",
      "{location}": data.location || "N/A",
      "{service_provider}": data.service_provider || "N/A",
      "{technician_name}": data.technician_name || "N/A",

      // Issue alert variables
      "{issue_type}": data.issue_type || "N/A",
      "{severity}": data.severity || "N/A",
      "{description}": data.description || "N/A",
      "{reported_by}": data.reported_by || "N/A",
      "{reported_at}": data.reported_at || "N/A",

      // Status change variables
      "{issue_title}": data.issue_title || "N/A",
      "{previous_status}": data.previous_status || "N/A",
      "{new_status}": data.new_status || "N/A",
      "{updated_by}": data.updated_by || "N/A",
      "{updated_at}": data.updated_at || "N/A",
      "{change_reason}": data.change_reason || "N/A",

      // Material transaction variables
      "{material_name}": data.material_name || "N/A",
      "{material_sku}": data.material_sku || "N/A",
      "{transaction_type}": data.transaction_type || "N/A",
      "{transaction_quantity}": data.transaction_quantity || "N/A",
      "{transaction_date}": data.transaction_date ? new Date(data.transaction_date).toLocaleString() : "N/A",
      "{user_name}": data.user_name || "N/A",

      // Low stock alert variables
      "{current_stock}": data.current_stock || "N/A",
      "{min_stock}": data.min_stock || "N/A",
      "{alert_date}": data.alert_date ? new Date(data.alert_date).toLocaleString() : new Date().toLocaleString(),
    };

    Object.keys(variables).forEach((variable) => {
      result = result.replace(new RegExp(variable, "g"), variables[variable]);
    });

    return result;
  }

  // Update email configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log("Updating email config:", { ...newConfig, smtp_pass: newConfig.smtp_pass ? "[SET]" : "[NOT SET]" });
    this.createTransporter();
    return this.saveSettings();
  }

  // Update reminder settings
  updateReminderSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    return this.saveSettings();
  }

  // Send issue alert email
  async sendIssueAlertEmail(issueData) {
    if (!this.transporter) {
      return { success: false, error: "Email transporter not configured" };
    }

    try {
      const recipients = this.settings.issue_alert_recipients
        ?.split(",")
        .map((email) => email.trim())
        .filter((email) => email);
      if (!recipients || recipients.length === 0) {
        return { success: false, error: "No issue alert recipients configured" };
      }

      const template = this.templates.issue_alert || this.getDefaultTemplates().issue_alert;
      const subject = this.replaceVariables(template.subject, issueData);
      const htmlContent = this.replaceVariables(template.template, issueData);

      const mailOptions = {
        from: this.config.smtp_user,
        to: recipients.join(", "),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">🚨 URGENT ISSUE ALERT</h1>
            </div>
            <div style="padding: 20px; background: #fef2f2; border-radius: 0 0 8px 8px;">
              <div style="white-space: pre-line; line-height: 1.6; color: #374151;">${htmlContent}</div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #fef2f2; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626;">
                <h3 style="margin: 0 0 10px 0; color: #991b1b;">🚨 IMMEDIATE ACTION REQUIRED</h3>
                <p style="margin: 0; color: #991b1b;">Please investigate and resolve this issue as soon as possible.</p>
              </div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                This is an automated alert from the Operations Management System<br>
                Sent on: ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send status change alert email
  async sendStatusChangeAlertEmail(statusData) {
    if (!this.transporter) {
      return { success: false, error: "Email transporter not configured" };
    }

    try {
      // Use the same recipients as issue alerts
      const recipients = this.settings.issue_alert_recipients
        ?.split(",")
        .map((email) => email.trim())
        .filter((email) => email);

      if (!recipients || recipients.length === 0) {
        return { success: false, error: "No issue alert recipients configured" };
      }

      const template = this.templates.status_change || this.getDefaultTemplates().status_change;
      const subject = this.replaceVariables(template.subject, statusData);
      const htmlContent = this.replaceVariables(template.template, statusData);

      const mailOptions = {
        from: this.config.smtp_user,
        to: recipients.join(", "),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">📋 STATUS UPDATE</h1>
            </div>
            <div style="padding: 20px; background: #fff7ed; border-radius: 0 0 8px 8px;">
              <div style="white-space: pre-line; line-height: 1.6; color: #374151;">${htmlContent}</div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #fff7ed; padding: 15px; border-radius: 6px; border-left: 4px solid #ea580c;">
                <h3 style="margin: 0 0 10px 0; color: #c2410c;">📋 STATUS CHANGE NOTIFICATION</h3>
                <p style="margin: 0; color: #c2410c;">Please review the updated status and take any necessary action.</p>
              </div>
              <hr style="margin: 20px 0; border: none; border-top: 11px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                This is an automated notification from the Operations Management System<br>
                Sent on: ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update email templates
  updateTemplates(newTemplates) {
    this.templates = { ...this.templates, ...newTemplates };
    return this.saveSettings();
  }

  // Update specific template
  updateTemplate(templateType, templateData) {
    if (!this.templates) {
      this.templates = this.getDefaultTemplates();
    }
    this.templates[templateType] = { ...this.templates[templateType], ...templateData };
    return this.saveSettings();
  }

  // Get all settings
  getAllSettings() {
    return {
      config: this.config,
      reminders: this.settings,
      templates: this.templates || this.getDefaultTemplates(),
    };
  }

  // Check if reminders are enabled
  isReminderEnabled() {
    return this.settings.reminder_enabled === "on" || this.settings.reminder_enabled === true;
  }

  // Get reminder frequency
  getReminderFrequency() {
    return this.settings.reminder_frequency || "weekly";
  }

  // Get days before deadline
  getDaysBeforeDeadline() {
    return parseInt(this.settings.reminder_days_before) || 7;
  }

  // Send material transaction alert email
  async sendMaterialTransactionAlert(transactionData) {
    if (!this.transporter || !this.settings.material_transaction_alerts) {
      return { success: false, error: "Material transaction alerts not enabled" };
    }

    try {
      const recipients = this.settings.material_alert_recipients
        ?.split(",")
        .map((email) => email.trim())
        .filter((email) => email);
      if (!recipients || recipients.length === 0) {
        return { success: false, error: "No material alert recipients configured" };
      }

      const template = this.templates.material_transaction || this.getDefaultTemplates().material_transaction;
      const subject = this.replaceVariables(template.subject, transactionData);
      const htmlContent = this.replaceVariables(template.template, transactionData);

      const mailOptions = {
        from: this.config.smtp_user,
        to: recipients.join(", "),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">📦 Material Transaction Alert</h1>
            </div>
            <div style="padding: 20px; background: #f0fdf4; border-radius: 0 0 8px 8px;">
              <div style="white-space: pre-line; line-height: 1.6; color: #374151;">${htmlContent}</div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #f0fdf4; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981;">
                <h3 style="margin: 0 0 10px 0; color: #047857;">📦 Transaction Recorded</h3>
                <p style="margin: 0; color: #047857;">Please review this transaction for accuracy and completeness.</p>
              </div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                This is an automated alert from the Material Management System<br>
                Sent on: ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send low stock alert email
  async sendLowStockAlert(stockData) {
    if (!this.transporter || !this.settings.low_stock_alerts) {
      return { success: false, error: "Low stock alerts not enabled" };
    }

    try {
      const recipients = this.settings.material_alert_recipients
        ?.split(",")
        .map((email) => email.trim())
        .filter((email) => email);
      if (!recipients || recipients.length === 0) {
        return { success: false, error: "No material alert recipients configured" };
      }

      const template = this.templates.low_stock_alert || this.getDefaultTemplates().low_stock_alert;
      const subject = this.replaceVariables(template.subject, stockData);
      const htmlContent = this.replaceVariables(template.template, stockData);

      const mailOptions = {
        from: this.config.smtp_user,
        to: recipients.join(", "),
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; text-align: center;">⚠️ LOW STOCK ALERT</h1>
            </div>
            <div style="padding: 20px; background: #fffbeb; border-radius: 0 0 8px 8px;">
              <div style="white-space: pre-line; line-height: 1.6; color: #374151;">${htmlContent}</div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <div style="background: #fffbeb; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                <h3 style="margin: 0 0 10px 0; color: #d97706;">⚠️ IMMEDIATE ACTION REQUIRED</h3>
                <p style="margin: 0; color: #d97706;">Please reorder this material immediately to avoid stockout and production delays.</p>
              </div>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                This is an automated alert from the Material Management System<br>
                Sent on: ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send order emails (for MTO functionality)
  async sendOrderEmails({ order, customer, baseUrl }) {
    if (!this.transporter) {
      return { success: false, error: "Email transporter not configured" };
    }

    try {
      const mailOptions = {
        from: this.config.smtp_user || "noreply@vrindavan.com",
        to: customer.email,
        subject: `Order Confirmation - ${order.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Order Confirmation</h2>
            <p>Dear ${customer.name},</p>
            <p>Thank you for your order! Here are the details:</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h3>Order Details</h3>
              <p><strong>Order ID:</strong> ${order.id}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${order.status}</p>
            </div>
            <p>We will process your order and send you updates.</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              Sent on: ${new Date().toLocaleString()}<br>
              From: Vrindavan Farm Operations
            </p>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Export both default instance and named exports for backward compatibility
const emailService = new EmailService();
export default emailService;
export const { sendOrderEmails } = emailService;
