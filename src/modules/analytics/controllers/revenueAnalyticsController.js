// Revenue Analytics Controller
import { RevenueAnalyticsModel } from "../models/revenueAnalyticsModel.js";

// Helper function to get date range from query parameters (reuse from orders)
function getDateRange(query) {
  const now = new Date();
  let start, end;

  switch (query.range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case "yesterday":
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
      break;
    case "this_week":
      start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      break;
    case "last_week":
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      start = new Date(lastWeek);
      start.setDate(start.getDate() - lastWeek.getDay());
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case "this_month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now);
      break;
    case "last_month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "this_quarter":
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      end = new Date(now);
      break;
    case "last_quarter":
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
      if (lastQuarter < 0) {
        start = new Date(now.getFullYear() - 1, 9, 1);
        end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      } else {
        start = new Date(now.getFullYear(), lastQuarter * 3, 1);
        end = new Date(now.getFullYear(), (lastQuarter + 1) * 3, 0, 23, 59, 59);
      }
      break;
    case "this_year":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now);
      break;
    case "last_year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      break;
    case "custom":
      if (query.start && query.end) {
        start = new Date(query.start);
        end = new Date(query.end);
      } else {
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        end = new Date(now);
      }
      break;
    default:
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      end = new Date(now);
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export const revenueAnalyticsController = {
  async getRevenueAnalytics(req, res) {
    try {
      const user = req.user;
      const dateRange = getDateRange(req.query);

      // Get revenue data
      const [metrics, trendData, revenueByProduct, revenueByChannel, revenueByCategory, discountAnalysis, refundAnalysis, revenueList] = await Promise.all([RevenueAnalyticsModel.getRevenueMetrics(dateRange), RevenueAnalyticsModel.getRevenueTrend("day", dateRange), RevenueAnalyticsModel.getRevenueByProduct(10, dateRange), RevenueAnalyticsModel.getRevenueByChannel(dateRange), RevenueAnalyticsModel.getRevenueByCategory(dateRange), RevenueAnalyticsModel.getDiscountAnalysis(dateRange), RevenueAnalyticsModel.getRefundAnalysis(dateRange), RevenueAnalyticsModel.getRevenueList(1, 25, dateRange)]);

      res.render("pages/ops/analytics/revenue", {
        title: "Revenue Analytics",
        user,
        metrics,
        trendData,
        revenueByProduct,
        revenueByChannel,
        revenueByCategory,
        discountAnalysis,
        refundAnalysis,
        revenueList,
        dateRange,
        activeSection: "revenue",
        seo: {
          title: "Revenue Analytics - Vrindavan Farm",
          description: "Comprehensive revenue analytics with product breakdown, channel performance, and financial insights",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading revenue analytics:", error);
      res.redirect("/analytics");
    }
  },

  async getRevenueData(req, res) {
    try {
      const dateRange = getDateRange(req.query);

      const [metrics, trendData, revenueByProduct, revenueByChannel, revenueByCategory, discountAnalysis, refundAnalysis] = await Promise.all([RevenueAnalyticsModel.getRevenueMetrics(dateRange), RevenueAnalyticsModel.getRevenueTrend(req.query.groupBy || "day", dateRange), RevenueAnalyticsModel.getRevenueByProduct(parseInt(req.query.limit) || 10, dateRange), RevenueAnalyticsModel.getRevenueByChannel(dateRange), RevenueAnalyticsModel.getRevenueByCategory(dateRange), RevenueAnalyticsModel.getDiscountAnalysis(dateRange), RevenueAnalyticsModel.getRefundAnalysis(dateRange)]);

      res.json({
        success: true,
        data: {
          metrics,
          trendData,
          revenueByProduct,
          revenueByChannel,
          revenueByCategory,
          discountAnalysis,
          refundAnalysis,
        },
      });
    } catch (error) {
      console.error("Error fetching revenue data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch revenue data",
      });
    }
  },

  async exportRevenue(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const revenueList = await RevenueAnalyticsModel.getRevenueList(1, 10000, dateRange); // Large limit for export

      // Generate CSV content
      const headers = ["Order ID", "Date", "Customer Name", "Customer Email", "Channel", "Gross Revenue", "Tax", "Delivery Fee", "Net Revenue", "Item Count"];

      const csvContent = [headers.join(","), ...revenueList.map((revenue) => [revenue.order_id, revenue.created_at, `"${revenue.customer_name || ""}"`, `"${revenue.customer_email || ""}"`, revenue.channel, revenue.gross_revenue || 0, revenue.tax || 0, revenue.delivery_fee || 0, revenue.net_revenue || 0, revenue.item_count || 0].join(","))].join("\n");

      // Set headers for CSV download
      const filename = `revenue_analytics_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting revenue:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export revenue data",
      });
    }
  },
};
