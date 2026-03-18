import cron from "node-cron";
import pool from "../db/pool.js";
import { MaterialController } from "../modules/material/controllers/MaterialController.js";
import emailService from "./emailService.js";

class ReminderScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Start the reminder scheduler
  start() {
    if (this.isRunning) {
      console.log("Reminder scheduler is already running");
      return;
    }

    this.isRunning = true;
    console.log("Starting reminder scheduler...");

    // Schedule daily reminder check at 9:00 AM
    this.scheduleDailyReminders();

    console.log("Reminder scheduler started successfully");
  }

  // Stop the reminder scheduler
  stop() {
    if (!this.isRunning) {
      console.log("Reminder scheduler is not running");
      return;
    }

    this.isRunning = false;

    // Clear all scheduled jobs
    this.jobs.forEach((job, key) => {
      job.destroy();
      this.jobs.delete(key);
    });

    console.log("Reminder scheduler stopped");
  }

  // Schedule daily reminder checks
  scheduleDailyReminders() {
    const job = cron.schedule(
      "0 9 * * *",
      async () => {
        console.log("Running daily reminder check...");
        await this.checkAndSendReminders();
      },
      {
        scheduled: false,
        timezone: "Asia/Kolkata",
      },
    );

    this.jobs.set("daily-reminders", job);
    job.start();
  }

  // Check and send reminders
  async checkAndSendReminders() {
    try {
      if (!emailService.isReminderEnabled()) {
        console.log("Email reminders are disabled");
        return;
      }

      const daysBefore = emailService.getDaysBeforeDeadline();
      const upcomingServices = await this.getUpcomingServices(daysBefore);

      console.log(`Found ${upcomingServices.length} services due in ${daysBefore} days`);

      for (const service of upcomingServices) {
        await this.sendServiceReminder(service);
      }

      // Check for low stock alerts
      await this.checkLowStockAlerts();

      console.log("Reminder check completed");
    } catch (error) {
      console.error("Error in reminder check:", error);
    }
  }

  // Get upcoming services that need reminders
  async getUpcomingServices(daysBefore) {
    try {
      const sql = `
        SELECT 
          ss.id,
          ss.next_service_date,
          ss.machine_id,
          ss.service_type_id,
          m.name as machine_name,
          m.serial_number,
          m.location,
          st.name as service_type,
          DATEDIFF(ss.next_service_date, CURDATE()) as days_remaining
        FROM service_schedules ss
        LEFT JOIN machines m ON ss.machine_id = m.id
        LEFT JOIN service_types st ON ss.service_type_id = st.id
        WHERE ss.next_service_date IS NOT NULL
          AND ss.next_service_date > CURDATE()
          AND DATEDIFF(ss.next_service_date, CURDATE()) <= ?
          AND ss.is_active = TRUE
        ORDER BY ss.next_service_date ASC
      `;

      const [rows] = await pool.execute(sql, [daysBefore]);
      return rows;
    } catch (error) {
      console.error("Error fetching upcoming services:", error);
      return [];
    }
  }

  // Send reminder for a specific service
  async sendServiceReminder(service) {
    try {
      const serviceData = {
        machine_name: service.machine_name,
        serial_number: service.serial_number,
        service_type: service.service_type,
        due_date: service.next_service_date,
        days_remaining: service.days_remaining,
        location: service.location || "N/A",
      };

      const result = await emailService.sendReminderEmail(serviceData);

      if (result.success) {
        console.log(`Reminder sent for ${service.machine_name} - ${service.service_type}`);
        await this.logReminderSent(service.id);
      } else {
        console.error(`Failed to send reminder for ${service.machine_name}:`, result.error);
      }
    } catch (error) {
      console.error("Error sending service reminder:", error);
    }
  }

  // Log that a reminder was sent
  async logReminderSent(serviceScheduleId) {
    try {
      const sql = `
        INSERT INTO reminder_logs (service_schedule_id, sent_at, status)
        VALUES (?, NOW(), 'sent')
        ON DUPLICATE KEY UPDATE 
        sent_at = NOW(), 
        status = 'sent',
        updated_at = NOW()
      `;

      await pool.execute(sql, [serviceScheduleId]);
    } catch (error) {
      console.error("Error logging reminder:", error);
    }
  }

  // Check for low stock alerts
  async checkLowStockAlerts() {
    try {
      console.log("Checking for low stock alerts...");
      await MaterialController.checkLowStockAndSendAlerts();
      console.log("Low stock check completed");
    } catch (error) {
      console.error("Error checking low stock alerts:", error);
    }
  }

  // Manually trigger reminder check
  async triggerReminderCheck() {
    console.log("Manually triggering reminder check...");
    await this.checkAndSendReminders();
  }

  // Get reminder statistics
  async getReminderStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_reminders,
          COUNT(CASE WHEN DATE(sent_at) = CURDATE() THEN 1 END) as today_reminders,
          COUNT(CASE WHEN DATE(sent_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_reminders
        FROM reminder_logs
        WHERE status = 'sent'
      `;

      const [rows] = await pool.execute(sql);
      return rows[0] || { total_reminders: 0, today_reminders: 0, week_reminders: 0 };
    } catch (error) {
      console.error("Error fetching reminder stats:", error);
      return { total_reminders: 0, today_reminders: 0, week_reminders: 0 };
    }
  }

  // Check if scheduler is running
  isSchedulerRunning() {
    return this.isRunning;
  }

  // Get scheduled jobs info
  getJobsInfo() {
    const jobsInfo = [];
    this.jobs.forEach((job, key) => {
      jobsInfo.push({
        name: key,
        running: job.running,
        scheduled: job.scheduled,
      });
    });
    return jobsInfo;
  }
}

export default new ReminderScheduler();
