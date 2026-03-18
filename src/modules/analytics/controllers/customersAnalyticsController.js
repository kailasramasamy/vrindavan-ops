// Customers Analytics Controller
import { CustomersAnalyticsModel } from "../models/customersAnalyticsModel.js";

// Simple in-memory cache for customer acquisition trend
const customersCache = new Map();
const CUSTOMERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

export const customersAnalyticsController = {
  async getCustomersAnalytics(req, res) {
    try {
      const user = req.user;
      const dateRange = getDateRange(req.query);

      // Load only metrics for fast initial render; fetch charts via AJAX
      const metrics = await CustomersAnalyticsModel.getCustomerMetrics(dateRange);

      res.render("pages/ops/analytics/customers", {
        title: "Customers Analytics",
        user,
        metrics,
        acquisitionTrend: [],
        customerSegmentation: [],
        customerCohorts: [],
        ltvDistribution: [],
        lowBalanceCustomers: [],
        customersList: [],
        dateRange,
        activeSection: "customers",
        seo: {
          title: "Customers Analytics - Vrindavan Farm",
          description: "Customer insights, segmentation, cohorts, and lifetime value analytics",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
      });
    } catch (error) {
      console.error("Error loading customers analytics:", error);
      res.redirect("/analytics");
    }
  },

  async getCustomersData(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const groupBy = req.query.groupBy || "day";
      const limit = parseInt(req.query.limit) || 10;

      // Whole-response cache (fast path)
      const responseCacheKey = `customers_data_${JSON.stringify(dateRange)}_${groupBy}_${limit}`;
      const nowTop = Date.now();
      const cachedResponse = customersCache.get(responseCacheKey);
      if (cachedResponse && nowTop - cachedResponse.timestamp < CUSTOMERS_CACHE_TTL) {
        return res.json({ success: true, data: cachedResponse.data, cached: true });
      }

      // Use the selected date range for acquisition trend
      const cacheKey = `customer_acq_trend_${JSON.stringify(dateRange)}_${groupBy}`;
      const cacheNow = Date.now();

      let acquisitionTrend;
      const cached = customersCache.get(cacheKey);
      if (cached && cacheNow - cached.timestamp < CUSTOMERS_CACHE_TTL) {
        acquisitionTrend = cached.data;
      } else {
        acquisitionTrend = await CustomersAnalyticsModel.getCustomerAcquisitionTrend(groupBy, dateRange);
        customersCache.set(cacheKey, { data: acquisitionTrend, timestamp: cacheNow });
      }

      // Cache cohorts separately since they don't depend on date range
      const cohortsCacheKey = "customer_cohorts_static";
      let customerCohorts;
      const cachedCohorts = customersCache.get(cohortsCacheKey);
      if (cachedCohorts && Date.now() - cachedCohorts.timestamp < CUSTOMERS_CACHE_TTL) {
        customerCohorts = cachedCohorts.data;
      } else {
        customerCohorts = await CustomersAnalyticsModel.getCustomerCohorts(dateRange);
        customersCache.set(cohortsCacheKey, { data: customerCohorts, timestamp: Date.now() });
      }

      const [metrics, customerSegmentation, ltvDistribution, lowBalanceCustomers, topCustomersLTV, recentCustomers] = await Promise.all([CustomersAnalyticsModel.getCustomerMetrics(dateRange), CustomersAnalyticsModel.getCustomerSegmentation(dateRange), CustomersAnalyticsModel.getCustomerLTVDistribution(dateRange), CustomersAnalyticsModel.getLowBalanceCustomers(200, 50), CustomersAnalyticsModel.getTopCustomersByLTV(10), CustomersAnalyticsModel.getRecentCustomers(10)]);
      const data = {
        metrics,
        acquisitionTrend,
        customerSegmentation,
        customerCohorts,
        ltvDistribution,
        lowBalanceCustomers,
        topCustomersLTV,
        recentCustomers,
      };

      // Store whole response in cache
      customersCache.set(responseCacheKey, { data, timestamp: Date.now() });

      res.json({ success: true, data, cached: false });
    } catch (error) {
      console.error("Error fetching customers data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch customers data",
      });
    }
  },

  async exportCustomers(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const customersList = await CustomersAnalyticsModel.getCustomersList(1, 10000, dateRange); // Large limit for export

      // Generate CSV content
      const headers = ["Customer ID", "Name", "Email", "Phone", "Customer Since", "Wallet Balance", "Total Orders", "Lifetime Value", "Last Order Date", "Customer Status"];

      const csvContent = [headers.join(","), ...customersList.map((customer) => [customer.id, `"${customer.name || ""}"`, `"${customer.email || ""}"`, `"${customer.phone || ""}"`, customer.customer_since, customer.wallet_balance || 0, customer.total_orders || 0, customer.ltv || 0, customer.last_order_date || "", customer.customer_status || ""].join(","))].join("\n");

      // Set headers for CSV download
      const filename = `customers_analytics_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting customers:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export customers data",
      });
    }
  },

  // Export customers by segment (CSV)
  async exportCustomersBySegment(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const segment = String(req.query.segment || "total");

      // Build where conditions for segment
      let segmentCondition = "1=1";
      let additionalJoin = "";
      switch (segment) {
        case "active":
          segmentCondition = "last_order.last_order_date IS NOT NULL AND DATEDIFF(NOW(), last_order.last_order_date) <= 15";
          break;
        case "at_risk":
          segmentCondition = "last_order.last_order_date IS NOT NULL AND DATEDIFF(NOW(), last_order.last_order_date) BETWEEN 15 AND 30";
          break;
        case "inactive":
          segmentCondition = "last_order.last_order_date IS NOT NULL AND DATEDIFF(NOW(), last_order.last_order_date) >= 30";
          break;
        case "discontinued":
          segmentCondition = "last_order.last_order_date IS NOT NULL AND DATEDIFF(NOW(), last_order.last_order_date) BETWEEN 15 AND 16";
          break;
        case "new_prospect":
          segmentCondition = "order_stats.total_orders IS NULL";
          break;
        case "churned":
          segmentCondition = "last_order.last_order_date IS NOT NULL AND DATEDIFF(NOW(), last_order.last_order_date) > 180";
          break;
        case "total":
        default:
          segmentCondition = "1=1";
      }

      // Query from analytics DB directly for consistent schema
      const { analyticsPool } = await import("../../../db/pool.js");

      const params = [];
      // Note: Do not filter by user created_at for segment exports to match metrics logic
      const dateFilter = "";

      const query = `
        SELECT 
          customer_data.customer_id,
          customer_data.name,
          customer_data.phone,
          customer_data.email,
          customer_data.locality,
          customer_data.house_number,
          customer_data.complete_address,
          customer_data.wallet_balance,
          customer_data.customer_since_days,
          customer_data.created_at
        FROM (
          SELECT 
            u.id AS customer_id,
            u.name,
            u.phone,
            u.email,
            COALESCE(l.name, ol.name) AS locality,
            COALESCE(da.house_no, oda.house_no) AS house_number,
            COALESCE(da.complete_address, oda.complete_address) AS complete_address,
            COALESCE(MAX(wb.balance), 0) AS wallet_balance,
            DATEDIFF(NOW(), u.created_at) AS customer_since_days,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
            last_order.last_order_date
          FROM users u
          LEFT JOIN wallet_balances wb ON u.id = wb.user_id
          LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
          LEFT JOIN localities l ON da.locality_id = l.id
          LEFT JOIN (
            SELECT o.user_id, MAX(o.order_date) AS last_order_date
            FROM orders o
            GROUP BY o.user_id
          ) last_order ON u.id = last_order.user_id
          LEFT JOIN (
            SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
            FROM orders o1
            INNER JOIN (
              SELECT user_id, MAX(order_date) AS max_order_date
              FROM orders
              GROUP BY user_id
            ) o2 ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date
            GROUP BY o1.user_id
          ) recent_order ON u.id = recent_order.user_id
          LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
          LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
          LEFT JOIN (
            SELECT o.user_id, COUNT(*) AS total_orders
            FROM orders o
            GROUP BY o.user_id
          ) order_stats ON u.id = order_stats.user_id
          WHERE ${segmentCondition} ${dateFilter}
          GROUP BY u.id, u.name, u.phone, u.email, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, u.created_at, last_order.last_order_date
        ) customer_data
        ORDER BY customer_data.created_at DESC
        LIMIT 20000
      `;

      const [rows] = await analyticsPool.query(query, params);

      // CSV headers in required order
      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Customer Since (days)", "Created At"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.customer_since_days || 0, r.created_at || ""].join(","))].join("\n");

      const filename = `customers_${segment}_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting customers by segment:", error);
      res.status(500).json({ success: false, error: "Failed to export customers by segment" });
    }
  },

  // Export acquisition customers (CSV) - customers created in range
  async exportCustomerAcquisition(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const { analyticsPool } = await import("../../../db/pool.js");

      const params = [];
      let whereClause = "WHERE 1=1";
      if (dateRange.start && dateRange.end) {
        whereClause += " AND u.created_at >= ? AND u.created_at <= ?";
        params.push(dateRange.start, dateRange.end);
      }

      const query = `
        SELECT 
          customer_data.customer_id,
          customer_data.name,
          customer_data.phone,
          customer_data.email,
          customer_data.locality,
          customer_data.house_number,
          customer_data.complete_address,
          customer_data.wallet_balance,
          customer_data.customer_since_days,
          customer_data.created_at
        FROM (
          SELECT 
            u.id AS customer_id,
            u.name,
            u.phone,
            u.email,
            COALESCE(l.name, ol.name) AS locality,
            COALESCE(da.house_no, oda.house_no) AS house_number,
            COALESCE(da.complete_address, oda.complete_address) AS complete_address,
            COALESCE(MAX(wb.balance), 0) AS wallet_balance,
            DATEDIFF(NOW(), u.created_at) AS customer_since_days,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at
          FROM users u
          LEFT JOIN wallet_balances wb ON u.id = wb.user_id
          LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
          LEFT JOIN localities l ON da.locality_id = l.id
          LEFT JOIN (
            SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
            FROM orders o1
            INNER JOIN (
              SELECT user_id, MAX(order_date) AS max_order_date
              FROM orders
              GROUP BY user_id
            ) o2 ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date
            GROUP BY o1.user_id
          ) recent_order ON u.id = recent_order.user_id
          LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
          LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
          ${whereClause}
          GROUP BY u.id, u.name, u.phone, u.email, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, u.created_at
        ) customer_data
        ORDER BY customer_data.created_at DESC
        LIMIT 20000
      `;

      const [rows] = await analyticsPool.query(query, params);

      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Customer Since (days)", "Created At"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.customer_since_days || 0, r.created_at || ""].join(","))].join("\n");

      const filename = `customers_acquisition_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting customer acquisition:", error);
      res.status(500).json({ success: false, error: "Failed to export acquisition data" });
    }
  },

  // Export customers by LTV range (CSV)
  async exportCustomersByLtvRange(req, res) {
    try {
      // Get range parameter (Express automatically decodes URL-encoded query params)
      const inputRange = String(req.query.range || "₹0").trim();

      const { analyticsPool } = await import("../../../db/pool.js");

      // Normalize to one of the known buckets
      const validRanges = new Set(["₹0", "₹1-500", "₹501-1000", "₹1001-2500", "₹2501-5000", "₹5000+"]);
      const targetRange = validRanges.has(inputRange) ? inputRange : "₹0";

      console.log("LTV Export - Input range:", inputRange, "Target range:", targetRange);

      // Numeric filter for LTV ranges
      let ltvWhere = "COALESCE(customer_data.ltv_value, 0) = 0";
      switch (targetRange) {
        case "₹0":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) = 0";
          break;
        case "₹1-500":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) > 0 AND COALESCE(customer_data.ltv_value, 0) <= 500";
          break;
        case "₹501-1000":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) > 500 AND COALESCE(customer_data.ltv_value, 0) <= 1000";
          break;
        case "₹1001-2500":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) > 1000 AND COALESCE(customer_data.ltv_value, 0) <= 2500";
          break;
        case "₹2501-5000":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) > 2500 AND COALESCE(customer_data.ltv_value, 0) <= 5000";
          break;
        case "₹5000+":
          ltvWhere = "COALESCE(customer_data.ltv_value, 0) > 5000";
          break;
      }

      const query = `
        SELECT 
          customer_data.customer_id,
          customer_data.name,
          customer_data.phone,
          customer_data.email,
          customer_data.locality,
          customer_data.house_number,
          customer_data.complete_address,
          customer_data.wallet_balance,
          customer_data.customer_since_days,
          customer_data.created_at
        FROM (
          SELECT 
            u.id AS customer_id,
            u.name,
            u.phone,
            u.email,
            COALESCE(l.name, ol.name) AS locality,
            COALESCE(da.house_no, oda.house_no) AS house_number,
            COALESCE(da.complete_address, oda.complete_address) AS complete_address,
            COALESCE(MAX(wb.balance), 0) AS wallet_balance,
            DATEDIFF(NOW(), u.created_at) AS customer_since_days,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
            COALESCE(customer_ltv.ltv, 0) AS ltv_value
          FROM users u
          LEFT JOIN wallet_balances wb ON u.id = wb.user_id
          LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
          LEFT JOIN localities l ON da.locality_id = l.id
          LEFT JOIN (
            SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
            FROM orders o1
            INNER JOIN (
              SELECT user_id, MAX(order_date) AS max_order_date
              FROM orders
              GROUP BY user_id
            ) o2 ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date
            GROUP BY o1.user_id
          ) recent_order ON u.id = recent_order.user_id
          LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
          LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
          LEFT JOIN (
            SELECT 
              o.user_id,
              COALESCE(SUM(fo.price * fo.quantity), 0) as ltv
            FROM orders o
            LEFT JOIN food_orders fo ON o.id = fo.order_id
            GROUP BY o.user_id
          ) customer_ltv ON u.id = customer_ltv.user_id
          GROUP BY u.id, u.name, u.phone, u.email, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, u.created_at, customer_ltv.ltv
        ) customer_data
        WHERE ${ltvWhere}
        ORDER BY customer_data.created_at DESC
        LIMIT 20000
      `;

      const [rows] = await analyticsPool.query(query);

      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Customer Since (days)", "Created At"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.customer_since_days || 0, r.created_at || ""].join(","))].join("\n");

      const safeRange = targetRange.replace(/[^a-zA-Z0-9-+]/g, "_");
      const filename = `customers_ltv_${safeRange}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting customers by LTV range:", error);
      res.status(500).json({ success: false, error: "Failed to export customers by LTV range" });
    }
  },

  // Export Top Customers by Lifetime Value (CSV)
  async exportTopCustomersByLTV(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const { analyticsPool } = await import("../../../db/pool.js");

      const query = `
        SELECT
          u.id AS customer_id, u.name, u.phone, u.email,
          COALESCE(MAX(wb.balance), 0) AS wallet_balance,
          DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
          COALESCE(l.name, ol.name) AS locality,
          COALESCE(da.house_no, oda.house_no) AS house_number,
          COALESCE(da.complete_address, oda.complete_address) AS complete_address,
          stats.total_orders, stats.ltv
        FROM users u
        INNER JOIN (
          SELECT o.user_id, COUNT(DISTINCT o.id) AS total_orders,
            COALESCE(SUM(fo.price * fo.quantity), 0) AS ltv
          FROM orders o LEFT JOIN food_orders fo ON o.id = fo.order_id
          GROUP BY o.user_id HAVING ltv > 0 ORDER BY ltv DESC LIMIT ?
        ) stats ON u.id = stats.user_id
        LEFT JOIN wallet_balances wb ON u.id = wb.user_id
        LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
        LEFT JOIN localities l ON da.locality_id = l.id
        LEFT JOIN (
          SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
          FROM orders o1 INNER JOIN (SELECT user_id, MAX(order_date) AS max_order_date FROM orders GROUP BY user_id) o2
            ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date GROUP BY o1.user_id
        ) recent_order ON u.id = recent_order.user_id
        LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
        LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
        GROUP BY u.id, u.name, u.phone, u.email, u.created_at, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, stats.total_orders, stats.ltv
        ORDER BY stats.ltv DESC
      `;

      const [rows] = await analyticsPool.query(query, [limit]);

      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Created At", "Total Orders", "Lifetime Value"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.created_at || "", r.total_orders || 0, r.ltv || 0].join(","))].join("\n");

      const filename = `top_customers_ltv_${limit}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting top customers by LTV:", error);
      res.status(500).json({ success: false, error: "Failed to export top customers by LTV" });
    }
  },

  // Export Low Balance Customers (CSV) - same format as active customers
  async exportLowBalanceCustomers(req, res) {
    try {
      const threshold = parseInt(req.query.threshold) || 200;
      const { analyticsPool } = await import("../../../db/pool.js");

      const query = `
        SELECT 
          customer_data.customer_id,
          customer_data.name,
          customer_data.phone,
          customer_data.email,
          customer_data.locality,
          customer_data.house_number,
          customer_data.complete_address,
          customer_data.wallet_balance,
          customer_data.last_order_date,
          customer_data.customer_since_days,
          customer_data.created_at
        FROM (
          SELECT 
            u.id AS customer_id,
            u.name,
            u.phone,
            u.email,
            COALESCE(l.name, ol.name) AS locality,
            COALESCE(da.house_no, oda.house_no) AS house_number,
            COALESCE(da.complete_address, oda.complete_address) AS complete_address,
            COALESCE(MAX(wb.balance), 0) AS wallet_balance,
            DATE_FORMAT(MAX(o.order_date), '%Y-%m-%d') AS last_order_date,
            DATEDIFF(NOW(), u.created_at) AS customer_since_days,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at
          FROM users u
          LEFT JOIN wallet_balances wb ON u.id = wb.user_id
          LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
          LEFT JOIN localities l ON da.locality_id = l.id
          LEFT JOIN orders o ON u.id = o.user_id
          LEFT JOIN (
            SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
            FROM orders o1
            INNER JOIN (
              SELECT user_id, MAX(order_date) AS max_order_date
              FROM orders
              GROUP BY user_id
            ) o2 ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date
            GROUP BY o1.user_id
          ) recent_order ON u.id = recent_order.user_id
          LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
          LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
          WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 10 DAY)
          GROUP BY u.id, u.name, u.phone, u.email, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, u.created_at
          HAVING COUNT(DISTINCT o.id) > 0 AND COALESCE(MAX(wb.balance), 0) <= ?
        ) customer_data
        ORDER BY customer_data.wallet_balance ASC, customer_data.created_at DESC
        LIMIT 20000
      `;

      const [rows] = await analyticsPool.query(query, [threshold]);

      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Last Order Date", "Customer Since (days)", "Created At"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.last_order_date || "", r.customer_since_days || 0, r.created_at || ""].join(","))].join("\n");

      const filename = `customers_low_balance_${threshold}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting low balance customers:", error);
      res.status(500).json({ success: false, error: "Failed to export low balance customers" });
    }
  },

  // Export Recent Customers (CSV)
  async exportRecentCustomers(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10000; // Default to large limit for "See All"
      const { analyticsPool } = await import("../../../db/pool.js");

      const query = `
        SELECT 
          u.id AS customer_id,
          u.name,
          u.phone,
          u.email,
          COALESCE(MAX(wb.balance), 0) AS wallet_balance,
          DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
          DATEDIFF(NOW(), u.created_at) AS customer_since_days,
          COALESCE(l.name, ol.name) AS locality,
          COALESCE(da.house_no, oda.house_no) AS house_number,
          COALESCE(da.complete_address, oda.complete_address) AS complete_address,
          COALESCE(stats.total_orders, 0) AS total_orders,
          COALESCE(stats.ltv, 0) AS ltv,
          stats.last_order_date,
          CASE 
            WHEN stats.last_order_date IS NULL THEN 'New/Prospect'
            WHEN DATEDIFF(NOW(), stats.last_order_date) <= 15 THEN 'Active'
            WHEN DATEDIFF(NOW(), stats.last_order_date) BETWEEN 15 AND 30 THEN 'At Risk'
            WHEN DATEDIFF(NOW(), stats.last_order_date) >= 30 THEN 'Inactive'
            ELSE 'Inactive'
          END AS customer_status
        FROM users u
        LEFT JOIN wallet_balances wb ON u.id = wb.user_id
        LEFT JOIN delivery_addresses da ON u.id = da.user_id AND da.is_default = 1
        LEFT JOIN localities l ON da.locality_id = l.id
        LEFT JOIN (
          SELECT o1.user_id, MAX(o1.delivery_address_id) AS delivery_address_id, MAX(o1.locality_id) AS locality_id
          FROM orders o1
          INNER JOIN (
            SELECT user_id, MAX(order_date) AS max_order_date
            FROM orders
            GROUP BY user_id
          ) o2 ON o1.user_id = o2.user_id AND o1.order_date = o2.max_order_date
          GROUP BY o1.user_id
        ) recent_order ON u.id = recent_order.user_id
        LEFT JOIN delivery_addresses oda ON recent_order.delivery_address_id = oda.id
        LEFT JOIN localities ol ON COALESCE(recent_order.locality_id, oda.locality_id) = ol.id
        LEFT JOIN (
          SELECT 
            user_id,
            COUNT(DISTINCT o.id) AS total_orders,
            COALESCE(SUM(fo.price * fo.quantity), 0) AS ltv,
            DATE_FORMAT(MAX(o.order_date), '%Y-%m-%d') AS last_order_date
          FROM orders o
          LEFT JOIN food_orders fo ON o.id = fo.order_id
          GROUP BY user_id
        ) stats ON u.id = stats.user_id
        GROUP BY u.id, u.name, u.email, u.phone, u.created_at, l.name, ol.name, da.house_no, oda.house_no, da.complete_address, oda.complete_address, stats.total_orders, stats.ltv, stats.last_order_date
        ORDER BY u.created_at DESC
        LIMIT ?
      `;

      const [rows] = await analyticsPool.query(query, [limit]);

      const headers = ["Customer ID", "Name", "Phone", "Email", "Locality", "House Number", "Complete Address", "Wallet Balance", "Customer Since (days)", "Created At", "Total Orders", "Lifetime Value", "Last Order Date", "Status"];

      const csv = [headers.join(","), ...rows.map((r) => [r.customer_id, JSON.stringify(r.name || ""), JSON.stringify(r.phone || ""), JSON.stringify(r.email || ""), JSON.stringify(r.locality || ""), JSON.stringify(r.house_number || ""), JSON.stringify(r.complete_address || ""), r.wallet_balance || 0, r.customer_since_days || 0, r.created_at || "", r.total_orders || 0, r.ltv || 0, r.last_order_date || "", r.customer_status || ""].join(","))].join("\n");

      const filename = `customers_recent.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting recent customers:", error);
      res.status(500).json({ success: false, error: "Failed to export recent customers" });
    }
  },

  // Export Customer Cohorts (CSV)
  async exportCustomerCohorts(req, res) {
    try {
      const dateRange = getDateRange(req.query);
      const cohorts = await CustomersAnalyticsModel.getCustomerCohorts(dateRange);

      const headers = ["Cohort Month", "Cohort Size", "Month 0 Customers", "Month 0 Retention %", "Month 1 Customers", "Month 1 Retention %", "Month 2 Customers", "Month 2 Retention %", "Month 3 Customers", "Month 3 Retention %"];

      const csv = [
        headers.join(","),
        ...cohorts.map((c) => {
          const size = c.cohort_size || 0;
          const m0 = c.month_0_customers || 0;
          const m1 = c.month_1_customers || 0;
          const m2 = c.month_2_customers || 0;
          const m3 = c.month_3_customers || 0;
          const pct0 = size > 0 ? ((m0 / size) * 100).toFixed(1) : "0.0";
          const pct1 = size > 0 ? ((m1 / size) * 100).toFixed(1) : "0.0";
          const pct2 = size > 0 ? ((m2 / size) * 100).toFixed(1) : "0.0";
          const pct3 = size > 0 ? ((m3 / size) * 100).toFixed(1) : "0.0";
          return [c.cohort_month || "", size, m0, pct0, m1, pct1, m2, pct2, m3, pct3].join(",");
        }),
      ].join("\n");

      const filename = `customers_cohorts_${dateRange.start}_to_${dateRange.end}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting customer cohorts:", error);
      res.status(500).json({ success: false, error: "Failed to export customer cohorts" });
    }
  },
};
