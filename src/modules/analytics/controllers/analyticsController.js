// Analytics Controller - Main dashboard controller
import { AnalyticsModel } from "../models/analyticsModel.js";

// Simple in-memory cache for analytics data
const analyticsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const analyticsController = {
  // Render overview dashboard
  async getOverview(req, res) {
    try {
      const user = req.user;

      // Get date range from query params or default to last 30 days
      const dateRange = getDateRange(req.query);

      // Get overview data
      const [metrics, trendData, topProducts, channelPerformance] = await Promise.all([AnalyticsModel.getOverviewMetrics(dateRange), AnalyticsModel.getTrendData("day", dateRange), AnalyticsModel.getTopProducts(10, dateRange), AnalyticsModel.getChannelPerformance(dateRange)]);

      res.render("pages/ops/analytics/overview", {
        title: "Analytics Overview",
        user,
        metrics,
        trendData,
        topProducts,
        channelPerformance,
        dateRange,
        activeSection: "overview",
        seo: {
          title: "Analytics Overview - Vrindavan Farm",
          description: "Comprehensive analytics dashboard for orders, revenue, and customer insights",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading analytics overview:", error);
      res.redirect("/");
    }
  },

  // API endpoint for overview data (with caching)
  async getOverviewData(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const groupBy = req.query.groupBy || "day";
      const limit = parseInt(req.query.limit) || 10;

      // Create cache key
      const cacheKey = `overview_${JSON.stringify(dateRange)}_${groupBy}_${limit}`;
      const now = Date.now();

      // Check cache first
      if (analyticsCache.has(cacheKey)) {
        const cached = analyticsCache.get(cacheKey);
        if (now - cached.timestamp < CACHE_TTL) {
          return res.json({
            success: true,
            data: cached.data,
            cached: true,
          });
        }
      }

      const [metrics, trendData, topProducts, channelPerformance] = await Promise.all([AnalyticsModel.getOverviewMetrics(dateRange), AnalyticsModel.getTrendData(groupBy, dateRange), AnalyticsModel.getTopProducts(limit, dateRange), AnalyticsModel.getChannelPerformance(dateRange)]);

      const data = {
        metrics,
        trendData,
        topProducts,
        channelPerformance,
      };

      // Cache the result
      analyticsCache.set(cacheKey, {
        data,
        timestamp: now,
      });

      res.json({
        success: true,
        data,
        cached: false,
      });
    } catch (error) {
      console.error("Error fetching overview data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch analytics data",
      });
    }
  },
};

// Helper function to get date range from query parameters
function getDateRange(query) {
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
    case "last_7_days":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      end = new Date(now);
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
    case "custom":
      if (query.start && query.end) {
        start = new Date(query.start);
        end = new Date(query.end);
      } else {
        // Default to last 30 days
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        end = new Date(now);
      }
      break;
    default:
      // Default to last 7 days
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      end = new Date(now);
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    range: query.range || "last_7_days",
  };
}
