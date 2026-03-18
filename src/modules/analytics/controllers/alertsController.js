// Alerts Controller
import { AlertsModel } from "../models/alertsModel.js";

export const alertsController = {
  async getAlerts(req, res) {
    try {
      const user = req.user;

      // Get all active alerts
      const [alerts, config] = await Promise.all([AlertsModel.getAllAlerts(), AlertsModel.getAlertConfig()]);

      res.render("pages/ops/analytics/alerts", {
        title: "Analytics Alerts",
        user,
        alerts,
        config,
        activeSection: "alerts",
        seo: {
          title: "Analytics Alerts - Vrindavan Farm",
          description: "Monitor order dips, low balance alerts, and other important business metrics",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading alerts:", error);
      res.redirect("/analytics");
    }
  },

  async getAlertsData(req, res) {
    try {
      const [alerts, config] = await Promise.all([AlertsModel.getAllAlerts(), AlertsModel.getAlertConfig()]);

      res.json({
        success: true,
        data: {
          alerts,
          config,
        },
      });
    } catch (error) {
      console.error("Error fetching alerts data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch alerts data",
      });
    }
  },
};
