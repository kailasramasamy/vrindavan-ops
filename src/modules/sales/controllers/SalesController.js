import { hasModulePermission } from "../../../middleware/rbac.js";
import { buildSEO } from "../../../utils/seo.js";
import { ProductModel } from "../../production/models/ProductModel.js";
import { SalesPartnerModel } from "../models/SalesPartnerModel.js";
import { SalesRecordModel } from "../models/SalesRecordModel.js";
import { SalesSummaryModel } from "../models/SalesSummaryModel.js";
import { AppSalesSync } from "../services/AppSalesSync.js";

export class SalesController {
  // Check if user has sales access (admin or has any sales permission)
  static async checkSalesAccess(user, subModule = null, permission = "read") {
    // Admin always has access
    if (user.role === "admin") {
      return true;
    }

    // Check if user has permission for this sub-module
    if (subModule) {
      return await hasModulePermission(user, "sales", subModule, permission);
    }

    // Check if user has any sales permission
    try {
      const { UserPermissionsModel } = await import("../../../models/UserPermissionsModel.js");
      const result = await UserPermissionsModel.getUserPermissions(user.id);

      if (result.success && result.permissions && result.permissions.sales) {
        return Object.keys(result.permissions.sales).length > 0;
      }
    } catch (error) {
      console.error("Error checking sales access:", error);
    }

    return false;
  }

  // Dashboard - Sales Overview
  static async getDashboard(req, res) {
    try {
      // Check access
      const hasAccess = await SalesController.checkSalesAccess(req.user, "dashboard", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access the Sales Dashboard.",
          error: { status: 403 },
          user: req.user,
        });
      }
      const { date = new Date().toISOString().split("T")[0], page = 1 } = req.query;
      const currentPage = Math.max(1, parseInt(page) || 1);
      const itemsPerPage = 25;

      // Compute daily summary first
      await SalesSummaryModel.computeDailySummary(date);

      // Get dashboard metrics
      const metrics = await SalesSummaryModel.getDashboardMetrics(date);

      // Get detailed summary with pagination
      const summary = await SalesSummaryModel.getSummaryByDate(date, currentPage, itemsPerPage);

      // Get sales records for the day
      const salesRecords = await SalesRecordModel.getSalesByDate(date);

      // Get daily trends for last 7 days
      const endDate = date;
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 6);
      const trends = await SalesSummaryModel.getDailyTrends(startDate.toISOString().split("T")[0], endDate);

      const seo = buildSEO({ title: "Sales Dashboard", url: req.path });

      // Ensure metrics is always an object with default values
      const metricsData =
        metrics && metrics.success && metrics.rows
          ? metrics.rows
          : {
              total_produced: 0,
              total_sold_app: 0,
              total_sold_partners: 0,
              total_sold: 0,
              total_unsold: 0,
              product_count: 0,
            };

      res.render("pages/ops/sales/dashboard", {
        seo,
        pageKey: "ops/sales/dashboard",
        title: "Sales Dashboard",
        date,
        metrics: metricsData,
        summary: summary.rows || [],
        pagination: summary.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 },
        salesRecords: salesRecords.rows || [],
        trends: trends.rows || [],
        section: "Sales",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in sales dashboard:", error);
      const { date = new Date().toISOString().split("T")[0] } = req.query;
      const seo = buildSEO({ title: "Sales Dashboard", url: req.path });
      res.status(500).render("pages/ops/sales/dashboard", {
        seo,
        pageKey: "ops/sales/dashboard",
        title: "Sales Dashboard",
        date,
        metrics: {
          total_produced: 0,
          total_sold_app: 0,
          total_sold_partners: 0,
          total_sold: 0,
          total_unsold: 0,
          product_count: 0,
        },
        summary: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
        salesRecords: [],
        trends: [],
        error: "Failed to load sales dashboard",
        section: "Sales",
        user: req.user,
      });
    }
  }

  // Partners Management
  static async getPartners(req, res) {
    try {
      // Check access
      const hasAccess = await SalesController.checkSalesAccess(req.user, "partners", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Sales Partners.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const partners = await SalesPartnerModel.getAllPartners(false);
      const products = await ProductModel.getProductsGroupedByCategory();

      const seo = buildSEO({ title: "Sales Partners", url: req.path });
      res.render("pages/ops/sales/partners", {
        seo,
        pageKey: "ops/sales/partners",
        title: "Sales Partners",
        partners: partners.rows || [],
        categories: products.categories || [],
        section: "Sales",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in sales partners:", error);
      const seo = buildSEO({ title: "Sales Partners", url: req.path });
      res.status(500).render("pages/ops/sales/partners", {
        seo,
        pageKey: "ops/sales/partners",
        title: "Sales Partners",
        partners: [],
        categories: [],
        error: "Failed to load partners",
        section: "Sales",
        user: req.user,
      });
    }
  }

  // Create Partner
  static async createPartner(req, res) {
    try {
      const result = await SalesPartnerModel.createPartner(req.body);
      if (result.success) {
        res.json({ success: true, message: "Partner created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating partner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update Partner
  static async updatePartner(req, res) {
    try {
      const { id } = req.params;
      const result = await SalesPartnerModel.updatePartner(id, req.body);
      if (result.success) {
        res.json({ success: true, message: "Partner updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating partner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete Partner
  static async deletePartner(req, res) {
    try {
      const { id } = req.params;
      const result = await SalesPartnerModel.deletePartner(id);
      if (result.success) {
        res.json({ success: true, message: "Partner deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting partner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Partner by ID (API)
  static async getPartnerById(req, res) {
    try {
      const { id } = req.params;
      const partner = await SalesPartnerModel.getPartnerById(id);
      const products = await SalesPartnerModel.getPartnerProducts(id);

      if (partner.success) {
        res.json({
          success: true,
          partner: partner.rows,
          products: products.rows || [],
        });
      } else {
        res.status(404).json({ success: false, error: "Partner not found" });
      }
    } catch (error) {
      console.error("Error fetching partner:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update Partner Products
  static async updatePartnerProducts(req, res) {
    try {
      const { id } = req.params;
      const { product_ids } = req.body;

      const result = await SalesPartnerModel.updatePartnerProducts(id, product_ids);
      if (result.success) {
        res.json({ success: true, message: "Partner products updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating partner products:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Sales Data Entry
  static async getDataEntry(req, res) {
    try {
      // Check access
      const hasAccess = await SalesController.checkSalesAccess(req.user, "data_entry", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Sales Data Entry.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const { date = new Date().toISOString().split("T")[0], partner_id } = req.query;

      // Get partners with their products
      const partners = await SalesPartnerModel.getAllPartners(false);

      // Get existing sales records for the date
      const salesRecords = await SalesRecordModel.getSalesByDate(date);

      // Get summary for the date
      const summary = await SalesSummaryModel.getSummaryByDate(date);

      const seo = buildSEO({ title: "Sales Data Entry", url: req.path });
      res.render("pages/ops/sales/data-entry", {
        seo,
        pageKey: "ops/sales/data-entry",
        title: "Sales Data Entry",
        date,
        partner_id: partner_id || null,
        partners: partners.rows || [],
        salesRecords: salesRecords.rows || [],
        summary: summary.rows || [],
        section: "Sales",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in sales data entry:", error);
      const { date = new Date().toISOString().split("T")[0], partner_id } = req.query;
      const seo = buildSEO({ title: "Sales Data Entry", url: req.path });
      res.status(500).render("pages/ops/sales/data-entry", {
        seo,
        pageKey: "ops/sales/data-entry",
        title: "Sales Data Entry",
        date,
        partner_id: partner_id || null,
        partners: [],
        salesRecords: [],
        summary: [],
        error: "Failed to load data entry page",
        section: "Sales",
        user: req.user,
      });
    }
  }

  // Create Sales Record
  static async createSalesRecord(req, res) {
    try {
      const data = {
        ...req.body,
        created_by: req.user?.id || 1,
      };

      const result = await SalesRecordModel.createSalesRecord(data);

      if (result.success) {
        // Recompute summary for the date
        await SalesSummaryModel.computeDailySummary(data.sale_date);

        res.json({ success: true, message: "Sales record created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating sales record:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create Bulk Sales Records
  static async createBulkSalesRecords(req, res) {
    try {
      const { records } = req.body;

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: "No records provided" });
      }

      const createdBy = req.user?.id || 1;
      const createdRecords = [];
      const errors = [];

      // Process each record
      for (const recordData of records) {
        try {
          const data = {
            ...recordData,
            created_by: createdBy,
          };

          const result = await SalesRecordModel.createSalesRecord(data);

          if (result.success) {
            createdRecords.push(result.id);
          } else {
            errors.push(`Failed to create record for ${recordData.product_name}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Error creating record for ${recordData.product_name}: ${error.message}`);
        }
      }

      // Recompute summary for the date (use first record's date)
      if (createdRecords.length > 0 && records[0].sale_date) {
        await SalesSummaryModel.computeDailySummary(records[0].sale_date);
      }

      const response = {
        success: true,
        message: `Successfully created ${createdRecords.length} sales records`,
        savedCount: createdRecords.length,
        createdIds: createdRecords,
      };

      if (errors.length > 0) {
        response.errors = errors;
        response.message += ` (${errors.length} errors occurred)`;
      }

      res.json(response);
    } catch (error) {
      console.error("Error creating bulk sales records:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update Sales Record
  static async updateSalesRecord(req, res) {
    try {
      const { id } = req.params;

      const result = await SalesRecordModel.updateSalesRecord(id, req.body);

      if (result.success) {
        // Recompute summary for the date
        if (req.body.sale_date) {
          await SalesSummaryModel.computeDailySummary(req.body.sale_date);
        }

        res.json({ success: true, message: "Sales record updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating sales record:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete Sales Record
  static async deleteSalesRecord(req, res) {
    try {
      const { id } = req.params;
      const { sale_date } = req.body;

      const result = await SalesRecordModel.deleteSalesRecord(id);

      if (result.success) {
        // Recompute summary for the date
        if (sale_date) {
          await SalesSummaryModel.computeDailySummary(sale_date);
        }

        res.json({ success: true, message: "Sales record deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting sales record:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Reports
  static async getReports(req, res) {
    try {
      // Check access
      const hasAccess = await SalesController.checkSalesAccess(req.user, "reports", "read");
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Sales Reports.",
          error: { status: 403 },
          user: req.user,
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const { start_date = today, end_date = today, report_type = "summary" } = req.query;

      let reportData = {};

      if (report_type === "summary") {
        // Overall summary
        reportData = await SalesSummaryModel.getProductWiseSummary(start_date, end_date);
      } else if (report_type === "channel") {
        // Channel-wise report
        reportData = await SalesRecordModel.getSalesGroupedByChannel(start_date, end_date);
      } else if (report_type === "product") {
        // Product-wise report
        reportData = await SalesRecordModel.getSalesGroupedByProduct(start_date, end_date);
      } else if (report_type === "trends") {
        // Daily trends
        reportData = await SalesSummaryModel.getDailyTrends(start_date, end_date);
      }

      // Get all partners for chart section
      const partnersResult = await SalesPartnerModel.getAllPartners(true);
      const partners = partnersResult.rows || [];

      const seo = buildSEO({ title: "Sales Reports", url: req.path });
      res.render("pages/ops/sales/reports", {
        seo,
        pageKey: "ops/sales/reports",
        title: "Sales Reports",
        start_date,
        end_date,
        report_type,
        reportData: reportData.rows || [],
        partners,
        section: "Sales",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in sales reports:", error);
      const today = new Date().toISOString().split("T")[0];
      const { start_date = today, end_date = today, report_type = "summary" } = req.query;
      const seo = buildSEO({ title: "Sales Reports", url: req.path });
      res.status(500).render("pages/ops/sales/reports", {
        seo,
        pageKey: "ops/sales/reports",
        title: "Sales Reports",
        start_date,
        end_date,
        report_type,
        reportData: [],
        partners: [],
        error: "Failed to load reports",
        section: "Sales",
        user: req.user,
      });
    }
  }

  // Get Partner Sales Trends API (for charts)
  static async getPartnerSalesTrendsApi(req, res) {
    try {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const startDate = req.query.start_date || sevenDaysAgo.toISOString().split("T")[0];
      const endDate = req.query.end_date || today.toISOString().split("T")[0];

      const result = await SalesRecordModel.getPartnerSalesTrends(startDate, endDate);

      if (result.success) {
        res.json({ success: true, data: result.rows });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching partner sales trends:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Partner Products (API)
  static async getPartnerProductsApi(req, res) {
    try {
      const { id } = req.params;
      const result = await SalesPartnerModel.getPartnerProducts(id);

      if (result.success) {
        // Fetch pricing data for all products of this partner
        const { PartnerProductPricingModel } = await import("../models/PartnerProductPricingModel.js");
        const pricingResult = await PartnerProductPricingModel.getPricingByPartner(id);
        
        // Create a map of product_id => pricing
        const pricingMap = {};
        if (pricingResult.success && pricingResult.rows) {
          pricingResult.rows.forEach(pricing => {
            pricingMap[pricing.product_id] = pricing;
          });
        }
        
        // Merge pricing data with products
        const productsWithPricing = result.rows.map(product => {
          const pricing = pricingMap[product.product_id];
          return {
            ...product,
            unit_price: pricing ? pricing.basic_price : null,
            gst_percentage: pricing ? pricing.gst_percentage : null,
            gst_amount: pricing ? pricing.gst_amount : null,
            landing_price: pricing ? pricing.landing_price : null
          };
        });
        
        res.json({ success: true, products: productsWithPricing });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching partner products:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Compute Summary API
  static async computeSummaryApi(req, res) {
    try {
      const { date } = req.body;
      const result = await SalesSummaryModel.computeDailySummary(date);

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error computing summary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Summary API
  static async getSummaryApi(req, res) {
    try {
      const { date } = req.query;
      const result = await SalesSummaryModel.getSummaryByDate(date);

      if (result.success) {
        res.json({ success: true, summary: result.rows });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Sync App Sales
  static async syncAppSales(req, res) {
    try {
      const { start_date, end_date } = req.body;

      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          error: "Start date and end date are required",
        });
      }

      const result = await AppSalesSync.syncAppSales(start_date, end_date, req.user?.id || 1);

      if (result.success) {
        // Recompute summaries for the date range
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);

        for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          await SalesSummaryModel.computeDailySummary(dateStr);
        }

        res.json({
          success: true,
          message: result.message,
          synced: result.synced,
          errors: result.errors,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error syncing app sales:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
