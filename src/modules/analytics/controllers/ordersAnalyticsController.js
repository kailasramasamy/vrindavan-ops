// Orders Analytics Controller
import { OrdersAnalyticsModel } from "../models/ordersAnalyticsModel.js";

// Helper function to get date range from query parameters
function getDateRange(query, page = 1) {
  const now = new Date();
  let start, end;

  switch (query.range) {
    case "today":
      // Create start date for today in UTC to avoid timezone issues
      start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));
      break;
    case "yesterday":
      // Create yesterday date in UTC to avoid timezone issues
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      start = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()));
      end = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59));
      break;
    case "this_week":
      // Calculate start of week (Sunday) in IST timezone
      const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // Convert to IST
      const istDayOfWeek = istNow.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const istWeekStart = new Date(istNow);
      istWeekStart.setDate(istNow.getDate() - istDayOfWeek);
      istWeekStart.setHours(0, 0, 0, 0);
      // Convert back to UTC for database queries and add 1 day to account for timezone
      start = new Date(istWeekStart.getTime() - 5.5 * 60 * 60 * 1000);
      start.setDate(start.getDate() + 1); // Add 1 day to match IST date
      // End is end of current day in IST (23:59:59.999)
      const istEndOfDay = new Date(istNow);
      istEndOfDay.setHours(23, 59, 59, 999);
      end = new Date(istEndOfDay.getTime() - 5.5 * 60 * 60 * 1000); // Convert back to UTC
      break;
    case "last_week":
      // Calculate start of last week (previous Sunday) in IST timezone
      const istNow2 = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // Convert to IST
      const istDayOfWeek2 = istNow2.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const istLastWeekStart = new Date(istNow2);
      istLastWeekStart.setDate(istNow2.getDate() - istDayOfWeek2 - 7); // Go back to previous Sunday
      istLastWeekStart.setHours(0, 0, 0, 0);
      // Convert back to UTC for database queries and add 1 day to account for timezone
      start = new Date(istLastWeekStart.getTime() - 5.5 * 60 * 60 * 1000);
      start.setDate(start.getDate() + 1); // Add 1 day to match IST date
      // Calculate end of last week (previous Saturday)
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case "this_month":
      // Create start date for 1st of current month in UTC to avoid timezone issues
      start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case "last_month":
      // Create start date for 1st of last month in UTC to avoid timezone issues
      start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      // Create end date for last day of last month
      end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0, 23, 59, 59));
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
    case "Q1-2025":
    case "Q2-2025":
    case "Q3-2025":
    case "Q4-2025":
    case "Q1-2024":
    case "Q2-2024":
    case "Q3-2024":
    case "Q4-2024":
      // Handle quarterly ranges
      const [q, year] = query.range.split("-");
      const yearNum = parseInt(year);
      let startMonth, endMonth;

      // Calculate which month of the quarter based on page
      const quarterMonths = {
        Q1: [0, 1, 2], // Jan, Feb, Mar
        Q2: [3, 4, 5], // Apr, May, Jun
        Q3: [6, 7, 8], // Jul, Aug, Sep
        Q4: [9, 10, 11], // Oct, Nov, Dec
      };

      const monthIndex = quarterMonths[q][page - 1] || quarterMonths[q][0];
      startMonth = monthIndex;
      endMonth = monthIndex;

      start = new Date(Date.UTC(yearNum, startMonth, 1));
      end = new Date(Date.UTC(yearNum, endMonth + 1, 0, 23, 59, 59)); // Last day of the month
      break;
    case "2025":
    case "2024":
    case "2023":
    case "2022":
      // Handle yearly ranges - month by month pagination
      const yearNumYearly = parseInt(query.range);
      const monthIndexYearly = page - 1; // Page 1 = January (month 0), Page 2 = February (month 1), etc.
      const startMonthYearly = monthIndexYearly;
      const endMonthYearly = monthIndexYearly;

      start = new Date(Date.UTC(yearNumYearly, startMonthYearly, 1));
      end = new Date(Date.UTC(yearNumYearly, endMonthYearly + 1, 0, 23, 59, 59)); // Last day of the month
      break;
    case "last_7_days":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case "last_14_days":
      start = new Date(now);
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;
    case "last_30_days":
      // Calculate 30 days ending today (including today)
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      start = new Date(now);
      start.setDate(start.getDate() - 29); // -29 to get exactly 30 days including today
      start.setHours(0, 0, 0, 0);
      break;
    case "custom":
      if (query.start && query.end) {
        start = new Date(query.start);
        end = new Date(query.end);
      } else if (query.start_date && query.end_date) {
        start = new Date(query.start_date);
        end = new Date(query.end_date);
      } else {
        // Default to last 7 days for better performance
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        end = new Date(now);
      }
      break;
    default:
      // Check if custom date range is provided
      if (query.start_date && query.end_date) {
        start = new Date(query.start_date);
        end = new Date(query.end_date);
      } else {
        // Default to last 7 days for better performance
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        end = new Date(now);
      }
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    range: query.range || "last_7_days",
  };
}

export const ordersAnalyticsController = {
  async getOrdersAnalytics(req, res) {
    try {
      const user = req.user;
      const dateRange = getDateRange(req.query);

      // Get essential data for initial load (optimized for performance)
      // Load core analytics data with optimized queries and reduced limits
      const [metrics, dropdownProducts] = await Promise.all([OrdersAnalyticsModel.getOrdersMetrics(dateRange), OrdersAnalyticsModel.getAllProductsForDropdown()]);

      // Load other data with smaller limits for better performance
      const [trendData, topProducts, topProductsByRevenue, topCategories] = await Promise.all([
        OrdersAnalyticsModel.getOrdersTrend("day", dateRange),
        OrdersAnalyticsModel.getTopProductsByOrders(5, dateRange), // Reduced from 10 to 5
        OrdersAnalyticsModel.getTopProductsByRevenue(5, dateRange), // Reduced from 10 to 5
        OrdersAnalyticsModel.getTopCategories(5, dateRange), // Reduced from 10 to 5
      ]);

      // Load trend data only for reasonable date ranges to avoid performance issues
      let milkTrendData = [],
        curdTrendData = [],
        paneerTrendData = [],
        gheeTrendData = [];

      // Only load trend data for smaller date ranges to avoid performance issues
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Disable trend data loading on initial page load for optimal performance
      // Trend data queries are extremely heavy (causing 5+ second timeouts)
      // Trend data will be loaded via API calls when users specifically need it
      // This ensures the analytics page loads quickly while maintaining all functionality

      // Set empty defaults for other data (will load via API if needed)
      const ordersByStatus = [];
      const ordersByChannel = [];
      const cancellationReasons = [];
      const ordersList = [];

      res.render("pages/ops/analytics/orders", {
        title: "Orders Analytics",
        user,
        metrics,
        trendData,
        ordersByStatus,
        ordersByChannel,
        topProducts,
        topProductsByRevenue,
        topCategories,
        cancellationReasons,
        ordersList,
        dropdownProducts,
        milkTrendData,
        curdTrendData,
        paneerTrendData,
        gheeTrendData,
        dateRange,
        activeSection: "orders",
        seo: {
          title: "Orders Analytics - Vrindavan Farm",
          description: "Detailed orders analytics with trends, status breakdown, and channel performance",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading orders analytics:", error);
      res.redirect("/analytics");
    }
  },

  async getAllProducts(req, res) {
    try {
      const user = req.user;
      const dateRange = getDateRange(req.query);

      // Get all products data
      const topProducts = await OrdersAnalyticsModel.getTopProductsByOrders(100, dateRange); // Get up to 100 products

      res.render("pages/ops/analytics/all-products", {
        title: "All Products Analytics",
        user,
        topProducts,
        dateRange,
        activeSection: "orders",
        seo: {
          title: "All Products Analytics - Vrindavan Farm",
          description: "Complete view of all products with revenue, orders, and quantity data",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading all products:", error);
      res.redirect("/analytics/orders");
    }
  },

  async getAllCategories(req, res) {
    try {
      const user = req.user;
      const dateRange = getDateRange(req.query);

      // Get all categories data
      const topCategories = await OrdersAnalyticsModel.getTopCategories(100, dateRange); // Get up to 100 categories

      res.render("pages/ops/analytics/all-categories", {
        title: "All Categories Analytics",
        user,
        topCategories,
        dateRange,
        activeSection: "orders",
        seo: {
          title: "All Categories Analytics - Vrindavan Farm",
          description: "Complete view of all categories with revenue, orders, and quantity data",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading all categories:", error);
      res.redirect("/analytics/orders");
    }
  },

  async getOrdersData(req, res) {
    try {
      const dateRange = getDateRange(req.query);

      // Set overall timeout to allow more time for complex queries
      const overallTimeout = 10000; // 10 seconds total
      
      // Create a race between all queries and a timeout
      const queriesPromise = Promise.allSettled([
        OrdersAnalyticsModel.getOrdersMetrics(dateRange),
        OrdersAnalyticsModel.getOrdersTrend(req.query.groupBy || "day", dateRange),
        OrdersAnalyticsModel.getOrdersByStatus(dateRange),
        OrdersAnalyticsModel.getOrdersByChannel(dateRange),
        OrdersAnalyticsModel.getTopProductsByOrders(parseInt(req.query.limit) || 10, dateRange),
        OrdersAnalyticsModel.getCancellationReasons(dateRange)
      ]);

      // Race between queries and overall timeout
      const results = await Promise.race([
        queriesPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Overall request timeout after 10 seconds')), overallTimeout)
        )
      ]);

      // Process results
      const [metrics, trendData, ordersByStatus, ordersByChannel, topProducts, cancellationReasons] = results.map((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`Query ${index} failed: ${result.reason.message}`);
          return []; // Return empty data for failed queries
        }
        return result.value;
      });

      res.json({
        success: true,
        data: {
          metrics,
          trendData,
          ordersByStatus,
          ordersByChannel,
          topProducts,
          cancellationReasons,
        },
      });
    } catch (error) {
      console.error("Error fetching orders data:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
      
      // Always send a response, even if it's an error
      res.status(500).json({
        success: false,
        error: error.message.includes("timeout") ? "Request timeout - some data may be unavailable" : "Failed to fetch orders data",
        data: {
          metrics: [],
          trendData: [],
          ordersByStatus: [],
          ordersByChannel: [],
          topProducts: [],
          cancellationReasons: [],
        },
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  },

  async getTopProductsByRevenue(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const topProducts = await OrdersAnalyticsModel.getTopProductsByRevenue(parseInt(req.query.limit) || 10, dateRange);

      res.json({
        success: true,
        data: topProducts,
      });
    } catch (error) {
      console.error("Error fetching top products by revenue:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch top products by revenue",
      });
    }
  },

  async exportOrders(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const ordersList = await OrdersAnalyticsModel.getOrdersList(1, 10000, dateRange); // Large limit for export

      // Generate CSV content
      const headers = ["Order ID", "Date", "Status", "Channel", "Customer Name", "Customer Email", "Order Value", "Item Count", "Tax", "Delivery Fee", "Total Amount"];

      const csvContent = [headers.join(","), ...ordersList.map((order) => [order.order_id, order.created_at, order.order_status, order.channel, `"${order.customer_name || ""}"`, `"${order.customer_email || ""}"`, order.order_value || 0, order.item_count || 0, order.tax || 0, order.delivery_fee || 0, order.total_amount || 0].join(","))].join("\n");

      // Set headers for CSV download
      const filename = `orders_analytics_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting orders:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export orders data",
      });
    }
  },

  async getAllProductsForDropdown(req, res) {
    try {
      const products = await OrdersAnalyticsModel.getAllProductsForDropdown();

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error("Error fetching products for dropdown:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch products",
      });
    }
  },

  async getProductPerformance(req, res) {
    try {
      const { productId, groupBy = "day" } = req.query;
      const dateRange = getDateRange(req.query);

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required",
        });
      }

      const performanceData = await OrdersAnalyticsModel.getProductPerformance(productId, dateRange, groupBy);

      res.json({
        success: true,
        data: performanceData,
      });
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch product performance data",
      });
    }
  },

  async getCategories(req, res) {
    try {
      const categories = await OrdersAnalyticsModel.getCategories();
      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch categories",
      });
    }
  },

  async getSubCategories(req, res) {
    try {
      const { categoryId } = req.query;

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          error: "Category ID is required",
        });
      }

      const subCategories = await OrdersAnalyticsModel.getSubCategories(categoryId);
      res.json({
        success: true,
        data: subCategories,
      });
    } catch (error) {
      console.error("Error fetching sub-categories:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch sub-categories",
      });
    }
  },

  async getCategoryPerformance(req, res) {
    try {
      const { categoryId, subCategoryId, groupBy = "day" } = req.query;
      const dateRange = getDateRange(req.query);

      if (!categoryId || !subCategoryId) {
        return res.status(400).json({
          success: false,
          error: "Category ID and Sub-Category ID are required",
        });
      }

      const performanceData = await OrdersAnalyticsModel.getCategoryPerformance(categoryId, subCategoryId, dateRange, groupBy);

      res.json({
        success: true,
        data: performanceData,
      });
    } catch (error) {
      console.error("Error fetching category performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch category performance data",
      });
    }
  },

  async getTopProductsPerformance(req, res) {
    try {
      const { range, groupBy = "day", limit = 5 } = req.query;

      // Determine date range
      const dateRange = getDateRange({ range }, 1);

      // Get top products performance data
      const performanceData = await OrdersAnalyticsModel.getTopProductsPerformance(parseInt(limit), dateRange, groupBy);

      res.json({
        success: true,
        data: performanceData,
      });
    } catch (error) {
      console.error("Error fetching top products performance:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch top products performance data",
      });
    }
  },

  // Render milk trend detailed page
  async getMilkTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/milk-trend-detailed", {
        title: "Milk Order Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering milk trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load milk trend detailed page",
      });
    }
  },

  async getCurdTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/curd-trend-detailed", {
        title: "Curd Order Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering curd trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load curd trend detailed page",
      });
    }
  },

  async getPaneerTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/paneer-trend-detailed", {
        title: "Paneer Order Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering paneer trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load paneer trend detailed page",
      });
    }
  },

  async getGheeTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/ghee-trend-detailed", {
        title: "Ghee Order Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering ghee trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load ghee trend detailed page",
      });
    }
  },

  async getOrderTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/order-trend-detailed", {
        title: "Order Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering order trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load order trend detailed page",
      });
    }
  },

  async getRevenueTrendDetailed(req, res) {
    try {
      res.render("pages/ops/analytics/orders/revenue-trend-detailed", {
        title: "Revenue Trend - Detailed Analysis",
        user: req.user,
      });
    } catch (error) {
      console.error("Error rendering revenue trend detailed page:", error);
      res.status(500).render("pages/error", {
        title: "Error",
        error: "Failed to load revenue trend detailed page",
      });
    }
  },

  // Get expanded order trend data with custom grouping (all products)
  async getExpandedOrderTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;

      // Get date range (pass start/end for custom ranges)
      const { startDate, endDate } = getDateRange({ range, start, end }, page);

      // Get data from model with pagination
      const result = await OrdersAnalyticsModel.getAllProductsTrend(startDate, endDate, groupBy, range, page);

      // Handle pagination for different ranges
      let paginationInfo = null;
      let warning = null;
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        let daysPerPage;

        if (range.startsWith("Q") && range.includes("-")) {
          // Quarterly: 3 pages (one month per page)
          totalPages = 3;
        } else if (range.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          totalPages = 12;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
          totalPages = Math.ceil(daysDiff / daysPerPage);
        }

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        if (noPaginationRanges.includes(range)) {
          // For single-month ranges, use the full date range without pagination
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.startsWith("Q") && range.includes("-")) {
          // For quarterly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.match(/^\d{4}$/)) {
          // For yearly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else {
          // For other ranges, use the existing calculation
          const startOffset = (currentPage - 1) * daysPerPage;
          pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
          pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
          const actualEnd = pageEnd > endDate ? endDate : pageEnd;
          pageEnd = actualEnd;
        }

        // Only show warning for ranges that actually have pagination
        if (!noPaginationRanges.includes(range)) {
          warning = `Showing page ${currentPage} of ${totalPages} (${range.startsWith("Q") ? "monthly" : range.match(/^\d{4}$/) ? "monthly" : "15 days"} per page)`;
        }
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      }

      res.json({
        success: true,
        data: result,
        pagination: paginationInfo,
        warning: warning,
      });
    } catch (error) {
      console.error("Error fetching expanded order trend:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order trend data",
      });
    }
  },

  // Get expanded revenue trend data with custom grouping
  async getExpandedRevenueTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;
      console.log("Revenue trend expanded - range:", range, "groupBy:", groupBy, "page:", page);

      // Get date range (pass start/end for custom ranges)
      const { start: startDateStr, end: endDateStr } = getDateRange({ range, start, end }, page);
      console.log("Date range:", startDateStr, "to", endDateStr);

      // Convert string dates to Date objects
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);

      // Get data from model with pagination
      console.log("Calling getAllProductsTrend for revenue aggregation with:", startDateStr, endDateStr, groupBy, range, page);
      const productData = await OrdersAnalyticsModel.getAllProductsTrend(startDateStr, endDateStr, groupBy, range, page);

      // Aggregate product data into revenue data
      const revenueByPeriod = {};
      productData.forEach((product) => {
        product.data.forEach((item) => {
          if (!revenueByPeriod[item.period]) {
            revenueByPeriod[item.period] = {
              period: item.period,
              total_quantity: 0,
              order_count: 0,
              total_revenue: 0,
            };
          }
          revenueByPeriod[item.period].total_quantity += item.total_quantity || 0;
          revenueByPeriod[item.period].order_count += item.order_count || 0;
          revenueByPeriod[item.period].total_revenue += item.total_revenue || 0;
        });
      });

      // Convert to the expected format
      const result = [
        {
          id: "revenue",
          name: "Total Revenue",
          unit: "₹",
          data: Object.values(revenueByPeriod).sort((a, b) => new Date(a.period) - new Date(b.period)),
        },
      ];

      // Handle pagination for different ranges
      let paginationInfo = null;
      let warning = null;
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (range.startsWith("Q") && range.includes("-")) {
        // Quarterly: 3 pages (one month per page) - always paginate regardless of groupBy
        totalPages = 3;
        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        // For quarterly, page dates are calculated in the getDateRange function
        pageStart = startDate;
        pageEnd = endDate;

        warning = `Showing page ${currentPage} of ${totalPages} (monthly per page)`;
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (range.match(/^\d{4}$/)) {
        // Yearly: 12 pages (one month per page) - always paginate regardless of groupBy
        totalPages = 12;
        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        // For yearly, page dates are calculated in the getDateRange function
        pageStart = startDate;
        pageEnd = endDate;

        warning = `Showing page ${currentPage} of ${totalPages} (monthly per page)`;
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        // Default: 15 days per page for other ranges
        let daysPerPage = 15;
        totalPages = Math.ceil(daysDiff / daysPerPage);

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        // For other ranges, use the existing calculation
        const startOffset = (currentPage - 1) * daysPerPage;
        pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;
        pageEnd = actualEnd;

        warning = `Showing page ${currentPage} of ${totalPages} (15 days per page)`;
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      }

      res.json({
        success: true,
        data: result,
        pagination: paginationInfo,
        warning: warning,
      });
    } catch (error) {
      console.error("Error fetching expanded revenue trend:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch revenue trend data",
      });
    }
  },

  // Get expanded milk trend data with custom grouping
  async getExpandedMilkTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;

      // Determine date range (pass start/end for custom ranges)
      const dateRange = getDateRange({ range, start, end }, page);

      // Check if date range will be limited for performance
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      let warning = null;
      let paginationInfo = null;

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        let daysPerPage, totalPages;

        if (range.startsWith("Q") && range.includes("-")) {
          // Quarterly: 3 pages (one month per page)
          totalPages = 3;
          // For quarterly, we don't use daysPerPage calculation
          // Instead, each page shows one complete month
        } else if (range.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          totalPages = 12;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
          totalPages = Math.ceil(daysDiff / daysPerPage);
        }

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        if (range.startsWith("Q") && range.includes("-")) {
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.match(/^\d{4}$/)) {
          pageStart = startDate;
          pageEnd = endDate;
        } else {
          const startOffset = (currentPage - 1) * daysPerPage;
          pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
          pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
          const actualEnd = pageEnd > endDate ? endDate : pageEnd;
          pageEnd = actualEnd;
        }

        warning = `Showing page ${currentPage} of ${totalPages} (${range.startsWith("Q") ? "monthly" : range.match(/^\d{4}$/) ? "monthly" : "15 days"} per page)`;
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (groupBy === "week" && daysDiff > 30) {
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 30 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      } else if (groupBy === "month" && daysDiff > 60) {
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 60 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      }

      // Get data based on groupBy parameter with timeout
      let data;
      const queryTimeout = 30000; // 30 seconds timeout

      const queryPromise = (async () => {
        switch (groupBy) {
          case "week":
            return await OrdersAnalyticsModel.getMilkOrderTrend(dateRange, "week", page, range);
          case "month":
            return await OrdersAnalyticsModel.getMilkOrderTrend(dateRange, "month", page, range);
          default:
            return await OrdersAnalyticsModel.getMilkOrderTrend(dateRange, "day", page, range);
        }
      })();

      // Add timeout to prevent hanging
      data = await Promise.race([queryPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout after 30 seconds")), queryTimeout))]);

      res.json({
        success: true,
        data: data,
        warning: warning,
        pagination: paginationInfo,
      });
    } catch (error) {
      console.error("Error fetching expanded milk trend:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  },

  // Get expanded curd trend data with custom grouping
  async getExpandedCurdTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;

      // Determine date range (pass start/end for custom ranges)
      const dateRange = getDateRange({ range, start, end }, page);

      // Check if date range will be limited for performance
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      let warning = null;
      let paginationInfo = null;

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        let daysPerPage, totalPages;

        if (range.startsWith("Q") && range.includes("-")) {
          // Quarterly: 3 pages (one month per page)
          totalPages = 3;
        } else if (range.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          totalPages = 12;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
          totalPages = Math.ceil(daysDiff / daysPerPage);
        }

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        if (noPaginationRanges.includes(range)) {
          // For single-month ranges, use the full date range without pagination
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.startsWith("Q") && range.includes("-")) {
          // For quarterly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.match(/^\d{4}$/)) {
          // For yearly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else {
          // For other ranges, use the existing calculation
          const startOffset = (currentPage - 1) * daysPerPage;
          pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
          pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
          const actualEnd = pageEnd > endDate ? endDate : pageEnd;
          pageEnd = actualEnd;
        }

        // Only show warning for ranges that actually have pagination
        if (!noPaginationRanges.includes(range)) {
          warning = `Showing page ${currentPage} of ${totalPages} (${range.startsWith("Q") ? "monthly" : range.match(/^\d{4}$/) ? "monthly" : "15 days"} per page)`;
        }
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (groupBy === "week" && daysDiff > 30) {
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 30 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      } else if (groupBy === "month" && daysDiff > 60) {
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 60 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      }

      // Get data based on groupBy parameter
      let data;
      switch (groupBy) {
        case "week":
          data = await OrdersAnalyticsModel.getCurdOrderTrend(dateRange, "week", page, range);
          break;
        case "month":
          data = await OrdersAnalyticsModel.getCurdOrderTrend(dateRange, "month", page, range);
          break;
        default:
          data = await OrdersAnalyticsModel.getCurdOrderTrend(dateRange, "day", page, range);
      }

      res.json({
        success: true,
        data: data,
        warning: warning,
        pagination: paginationInfo,
      });
    } catch (error) {
      console.error("Error fetching expanded curd trend:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // Get expanded paneer trend data with custom grouping
  async getExpandedPaneerTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;

      // Determine date range (pass start/end for custom ranges)
      const dateRange = getDateRange({ range, start, end }, page);

      // Check if date range will be limited for performance
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      let warning = null;
      let paginationInfo = null;

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        let daysPerPage, totalPages;

        if (range.startsWith("Q") && range.includes("-")) {
          // Quarterly: 3 pages (one month per page)
          totalPages = 3;
        } else if (range.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          totalPages = 12;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
          totalPages = Math.ceil(daysDiff / daysPerPage);
        }

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        if (noPaginationRanges.includes(range)) {
          // For single-month ranges, use the full date range without pagination
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.startsWith("Q") && range.includes("-")) {
          // For quarterly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.match(/^\d{4}$/)) {
          // For yearly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else {
          // For other ranges, use the existing calculation
          const startOffset = (currentPage - 1) * daysPerPage;
          pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
          pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
          const actualEnd = pageEnd > endDate ? endDate : pageEnd;
          pageEnd = actualEnd;
        }

        // Only show warning for ranges that actually have pagination
        if (!noPaginationRanges.includes(range)) {
          warning = `Showing page ${currentPage} of ${totalPages} (${range.startsWith("Q") ? "monthly" : range.match(/^\d{4}$/) ? "monthly" : "15 days"} per page)`;
        }
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (groupBy === "week" && daysDiff > 30) {
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 30 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      } else if (groupBy === "month" && daysDiff > 60) {
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 60 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      }

      // Get data based on groupBy parameter
      let data;
      switch (groupBy) {
        case "week":
          data = await OrdersAnalyticsModel.getPaneerOrderTrend(dateRange, "week", page, range);
          break;
        case "month":
          data = await OrdersAnalyticsModel.getPaneerOrderTrend(dateRange, "month", page, range);
          break;
        default:
          data = await OrdersAnalyticsModel.getPaneerOrderTrend(dateRange, "day", page, range);
      }

      res.json({
        success: true,
        data: data,
        warning: warning,
        pagination: paginationInfo,
      });
    } catch (error) {
      console.error("Error fetching expanded paneer trend:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  // Get filtered order trend data (used by order-trend-detailed page)
  async getOrderTrendFilteredData(req, res) {
    try {
      const { range, groupBy = "day", page = 1, categoryId, subCategoryId, productId } = req.query;

      const dateRange = getDateRange({ range, start: req.query.start, end: req.query.end }, parseInt(page));

      const filters = {};
      if (categoryId) filters.categoryId = parseInt(categoryId);
      if (subCategoryId) filters.subCategoryId = parseInt(subCategoryId);
      if (productId) filters.productId = parseInt(productId);

      const trendData = await OrdersAnalyticsModel.getFilteredOrdersTrend(groupBy, dateRange, filters);

      // Handle pagination for quarterly/yearly
      let paginationInfo = null;
      let warning = null;

      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom", "today", "yesterday", "last_7_days", "last_14_days"];

      if (noPaginationRanges.includes(range)) {
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        };
      } else if (range && range.startsWith("Q") && range.includes("-")) {
        const totalPages = 3;
        const currentPage = parseInt(page);
        paginationInfo = {
          currentPage,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
        warning = `Showing month ${currentPage} of ${totalPages}`;
      } else if (range && range.match(/^\d{4}$/)) {
        const totalPages = 12;
        const currentPage = parseInt(page);
        paginationInfo = {
          currentPage,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
        warning = `Showing month ${currentPage} of ${totalPages}`;
      }

      res.json({
        success: true,
        data: trendData,
        pagination: paginationInfo,
        warning,
      });
    } catch (error) {
      console.error("Error fetching filtered order trend data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch order trend data",
      });
    }
  },

  // Get products for filter dropdown (filtered by category/subcategory)
  async getProductsForFilter(req, res) {
    try {
      const { categoryId, subCategoryId } = req.query;
      const products = await OrdersAnalyticsModel.getProductsForFilter(
        categoryId ? parseInt(categoryId) : null,
        subCategoryId ? parseInt(subCategoryId) : null
      );
      res.json({ success: true, data: products });
    } catch (error) {
      console.error("Error fetching products for filter:", error);
      res.status(500).json({ success: false, error: "Failed to fetch products" });
    }
  },

  // Export order trend detailed data as CSV
  async exportOrderTrendDetailed(req, res) {
    try {
      const { categoryId, subCategoryId, productId } = req.query;
      const dateRange = getDateRange(req.query);

      const filters = {};
      if (categoryId) filters.categoryId = parseInt(categoryId);
      if (subCategoryId) filters.subCategoryId = parseInt(subCategoryId);
      if (productId) filters.productId = parseInt(productId);

      const rows = await OrdersAnalyticsModel.getOrderTrendDetailedExport(dateRange, filters);

      const headers = [
        "Order Number",
        "Customer Name",
        "Phone",
        "Locality",
        "Address",
        "Delivery Boy",
        "Product Name",
        "Unit Size",
        "Selling Price",
        "Quantity",
        "Total Price",
      ];

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          [
            row.order_id,
            `"${(row.customer_name || "").replace(/"/g, '""')}"`,
            `"${row.customer_phone || ""}"`,
            `"${(row.locality_name || "").replace(/"/g, '""')}"`,
            `"${(row.delivery_address || "").replace(/"/g, '""')}"`,
            `"${(row.delivery_boy_name || "").replace(/"/g, '""')}"`,
            `"${(row.product_name || "").replace(/"/g, '""')}"`,
            `"${row.unit_size || ""}"`,
            row.selling_price || 0,
            row.quantity || 0,
            row.total_price || 0,
          ].join(",")
        ),
      ].join("\n");

      const filename = `order_trend_detailed_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting order trend detailed:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export order trend detailed data",
      });
    }
  },

  // Get expanded ghee trend data with custom grouping
  async getExpandedGheeTrend(req, res) {
    try {
      const { range, groupBy, page = 1, start, end } = req.query;

      // Determine date range (pass start/end for custom ranges)
      const dateRange = getDateRange({ range, start, end }, page);

      // Check if date range will be limited for performance
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      let warning = null;
      let paginationInfo = null;

      // No pagination for single-period and custom ranges
      const noPaginationRanges = ["last_30_days", "last_month", "this_month", "custom"];
      let totalPages = 1; // Initialize totalPages
      if (noPaginationRanges.includes(range)) {
        // For single-month ranges, show all data without pagination
        totalPages = 1;
        paginationInfo = {
          currentPage: 1,
          totalPages: 1,
          pageStart: startDate.toISOString().split("T")[0],
          pageEnd: endDate.toISOString().split("T")[0],
          hasNext: false,
          hasPrev: false,
        };
      } else if (groupBy === "day" && daysDiff > 15) {
        let daysPerPage, totalPages;

        if (range.startsWith("Q") && range.includes("-")) {
          // Quarterly: 3 pages (one month per page)
          totalPages = 3;
        } else if (range.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          totalPages = 12;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
          totalPages = Math.ceil(daysDiff / daysPerPage);
        }

        const currentPage = parseInt(page);
        let pageStart, pageEnd;

        if (noPaginationRanges.includes(range)) {
          // For single-month ranges, use the full date range without pagination
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.startsWith("Q") && range.includes("-")) {
          // For quarterly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else if (range.match(/^\d{4}$/)) {
          // For yearly, page dates are calculated in the getDateRange function
          pageStart = startDate;
          pageEnd = endDate;
        } else {
          // For other ranges, use the existing calculation
          const startOffset = (currentPage - 1) * daysPerPage;
          pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
          pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
          const actualEnd = pageEnd > endDate ? endDate : pageEnd;
          pageEnd = actualEnd;
        }

        // Only show warning for ranges that actually have pagination
        if (!noPaginationRanges.includes(range)) {
          warning = `Showing page ${currentPage} of ${totalPages} (${range.startsWith("Q") ? "monthly" : range.match(/^\d{4}$/) ? "monthly" : "15 days"} per page)`;
        }
        paginationInfo = {
          currentPage,
          totalPages,
          pageStart: pageStart.toISOString().split("T")[0],
          pageEnd: pageEnd.toISOString().split("T")[0],
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1,
        };
      } else if (groupBy === "week" && daysDiff > 30) {
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 30 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      } else if (groupBy === "month" && daysDiff > 60) {
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        warning = `Date range limited to 60 days (${dateRange.start} to ${limitedEnd.toISOString().split("T")[0]}) for optimal performance`;
      }

      // Get data based on groupBy parameter
      let data;
      switch (groupBy) {
        case "week":
          data = await OrdersAnalyticsModel.getGheeOrderTrend(dateRange, "week", page, range);
          break;
        case "month":
          data = await OrdersAnalyticsModel.getGheeOrderTrend(dateRange, "month", page, range);
          break;
        default:
          data = await OrdersAnalyticsModel.getGheeOrderTrend(dateRange, "day", page, range);
      }

      res.json({
        success: true,
        data: data,
        warning: warning,
        pagination: paginationInfo,
      });
    } catch (error) {
      console.error("Error fetching expanded milk trend:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
};
