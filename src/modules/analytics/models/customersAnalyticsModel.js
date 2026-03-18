// Customers Analytics Model - Database queries for customer analytics
import { analyticsPool } from "../../../db/pool.js";

export class CustomersAnalyticsModel {
  // Get customer overview metrics
  // Single-pass query using CASE expressions instead of 6 separate subqueries
  static async getCustomerMetrics(dateRange = { start: null, end: null }) {
    try {
      const { start, end } = dateRange;
      const hasRange = start && end;
      const refDate = hasRange ? "?" : "NOW()";
      const userFilter = hasRange ? "WHERE u.created_at <= ?" : "";
      // 4 DATEDIFF placeholders + 1 WHERE created_at placeholder
      const params = hasRange ? [end, end, end, end, end] : [];

      const query = `
        SELECT
          COUNT(*) AS total_customers,
          SUM(CASE WHEN lo.last_order_at IS NULL THEN 1 ELSE 0 END) AS new_prospect_customers,
          SUM(CASE WHEN lo.last_order_at IS NOT NULL AND DATEDIFF(${refDate}, lo.last_order_at) <= 15 THEN 1 ELSE 0 END) AS active_customers,
          SUM(CASE WHEN lo.last_order_at IS NOT NULL AND DATEDIFF(${refDate}, lo.last_order_at) BETWEEN 15 AND 30 THEN 1 ELSE 0 END) AS at_risk_customers,
          SUM(CASE WHEN lo.last_order_at IS NOT NULL AND DATEDIFF(${refDate}, lo.last_order_at) BETWEEN 15 AND 16 THEN 1 ELSE 0 END) AS discontinued_customers,
          SUM(CASE WHEN lo.last_order_at IS NOT NULL AND DATEDIFF(${refDate}, lo.last_order_at) >= 30 THEN 1 ELSE 0 END) AS inactive_customers
        FROM users u
        LEFT JOIN (
          SELECT user_id, MAX(order_date) AS last_order_at
          FROM orders
          GROUP BY user_id
        ) lo ON u.id = lo.user_id
        ${userFilter}
      `;

      const [rows] = await analyticsPool.query(query, params);
      const row = rows && rows[0] ? rows[0] : {};

      return {
        total_customers: Number(row.total_customers) || 0,
        active_customers: Number(row.active_customers) || 0,
        inactive_customers: Number(row.inactive_customers) || 0,
        discontinued_customers: Number(row.discontinued_customers) || 0,
        at_risk_customers: Number(row.at_risk_customers) || 0,
        new_prospect_customers: Number(row.new_prospect_customers) || 0,
      };
    } catch (error) {
      console.error("Error in getCustomerMetrics:", error);
      return {
        total_customers: 0,
        active_customers: 0,
        inactive_customers: 0,
        discontinued_customers: 0,
        at_risk_customers: 0,
        new_prospect_customers: 0,
      };
    }
  }

  // Get Top Customers by Lifetime Value
  // Lean query for display — no address JOINs (not shown in UI table)
  static async getTopCustomersByLTV(limit = 10) {
    const query = `
      SELECT
        u.id AS customer_id,
        u.name,
        u.phone,
        u.email,
        stats.total_orders,
        stats.ltv
      FROM users u
      INNER JOIN (
        SELECT
          o.user_id,
          COUNT(DISTINCT o.id) AS total_orders,
          COALESCE(SUM(fo.price * fo.quantity), 0) AS ltv
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        GROUP BY o.user_id
        HAVING ltv > 0
        ORDER BY ltv DESC
        LIMIT ?
      ) stats ON u.id = stats.user_id
      ORDER BY stats.ltv DESC
    `;

    const [rows] = await analyticsPool.query(query, [limit]);
    return rows;
  }

  // Get customer acquisition trend
  static async getCustomerAcquisitionTrend(groupBy = "day", dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    const hasRange = start && end;
    const dateFilter = hasRange
      ? "WHERE created_at >= ? AND created_at <= ?"
      : "WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    const orderFilter = hasRange
      ? "WHERE first_day >= ? AND first_day <= ?"
      : "WHERE first_day >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    const params = hasRange ? [start, end, start, end] : [];

    const query = `
      SELECT
        t.period,
        SUM(t.new_customers) AS new_customers,
        SUM(t.first_time_buyers) AS first_time_buyers
      FROM (
        SELECT DATE(created_at) AS period, COUNT(*) AS new_customers, 0 AS first_time_buyers
        FROM users
        ${dateFilter}
        GROUP BY DATE(created_at)
        UNION ALL
        SELECT first_day AS period, 0 AS new_customers, COUNT(*) AS first_time_buyers
        FROM (
          SELECT user_id, DATE(MIN(order_date)) AS first_day
          FROM orders
          GROUP BY user_id
        ) fo
        ${orderFilter}
        GROUP BY first_day
      ) t
      GROUP BY t.period
      ORDER BY t.period ASC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get customer segmentation (Wallet balance-based segments)
  static async getCustomerSegmentation(dateRange = { start: null, end: null }) {
    try {
      const { start, end } = dateRange;
      let dateFilter = "";
      let params = [];

      if (start && end) {
        dateFilter = "AND u.created_at >= ? AND u.created_at <= ?";
        params = [start, end];
      }

      const query = `
        SELECT
          segment,
          COUNT(*) as customer_count
        FROM (
          SELECT
            u.id,
            CASE
              WHEN COALESCE(wb.balance, 0) >= 1000 THEN 'High Balance'
              WHEN COALESCE(wb.balance, 0) >= 100 THEN 'Medium Balance'
              ELSE 'Low Balance'
            END as segment
          FROM users u
          LEFT JOIN wallet_balances wb ON u.id = wb.user_id
          WHERE u.id IS NOT NULL ${dateFilter}
        ) as customer_segments
        GROUP BY segment
        ORDER BY
          CASE segment
            WHEN 'High Balance' THEN 1
            WHEN 'Medium Balance' THEN 2
            WHEN 'Low Balance' THEN 3
          END
      `;

      const [rows] = await analyticsPool.query(query, params);

      // Calculate total customers and percentages
      const totalCustomers = rows.reduce((sum, row) => sum + row.customer_count, 0);

      return rows.map((row) => ({
        segment: row.segment,
        customer_count: row.customer_count,
        percentage: totalCustomers > 0 ? (row.customer_count / totalCustomers) * 100 : 0,
      }));
    } catch (error) {
      console.error("Error in getCustomerSegmentation:", error);
      return [];
    }
  }

  // Get customer cohorts (last 12 months only, with date-limited order scan)
  static async getCustomerCohorts(dateRange = { start: null, end: null }) {
    const query = `
      SELECT
        cohort_month,
        COUNT(*) AS cohort_size,
        SUM(CASE WHEN ordered_month_0 > 0 THEN 1 ELSE 0 END) AS month_0_customers,
        SUM(CASE WHEN ordered_month_1 > 0 THEN 1 ELSE 0 END) AS month_1_customers,
        SUM(CASE WHEN ordered_month_2 > 0 THEN 1 ELSE 0 END) AS month_2_customers,
        SUM(CASE WHEN ordered_month_3 > 0 THEN 1 ELSE 0 END) AS month_3_customers
      FROM (
        SELECT
          DATE_FORMAT(u.created_at, '%Y-%m') AS cohort_month,
          u.id AS user_id,
          SUM(CASE WHEN DATE_FORMAT(o.order_date, '%Y-%m') = DATE_FORMAT(u.created_at, '%Y-%m') THEN 1 ELSE 0 END) AS ordered_month_0,
          SUM(CASE WHEN DATE_FORMAT(o.order_date, '%Y-%m') = DATE_FORMAT(DATE_ADD(u.created_at, INTERVAL 1 MONTH), '%Y-%m') THEN 1 ELSE 0 END) AS ordered_month_1,
          SUM(CASE WHEN DATE_FORMAT(o.order_date, '%Y-%m') = DATE_FORMAT(DATE_ADD(u.created_at, INTERVAL 2 MONTH), '%Y-%m') THEN 1 ELSE 0 END) AS ordered_month_2,
          SUM(CASE WHEN DATE_FORMAT(o.order_date, '%Y-%m') = DATE_FORMAT(DATE_ADD(u.created_at, INTERVAL 3 MONTH), '%Y-%m') THEN 1 ELSE 0 END) AS ordered_month_3
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
          AND o.order_date >= DATE_FORMAT(u.created_at, '%Y-%m-01')
          AND o.order_date < DATE_ADD(DATE_FORMAT(u.created_at, '%Y-%m-01'), INTERVAL 4 MONTH)
        WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY cohort_month, u.id
      ) per_user
      GROUP BY cohort_month
      ORDER BY cohort_month DESC
    `;

    const [rows] = await analyticsPool.query(query);
    return rows;
  }

  // Get customer lifetime value distribution
  static async getCustomerLTVDistribution(dateRange = { start: null, end: null }) {
    const query = `
      SELECT
        ltv_range,
        customer_count,
        CASE WHEN total > 0 THEN (customer_count / total * 100) ELSE 0 END AS percentage,
        avg_ltv,
        total_ltv
      FROM (
        SELECT
          CASE
            WHEN COALESCE(cl.ltv, 0) = 0 THEN '₹0'
            WHEN cl.ltv <= 500 THEN '₹1-500'
            WHEN cl.ltv <= 1000 THEN '₹501-1000'
            WHEN cl.ltv <= 2500 THEN '₹1001-2500'
            WHEN cl.ltv <= 5000 THEN '₹2501-5000'
            ELSE '₹5000+'
          END AS ltv_range,
          CASE
            WHEN COALESCE(cl.ltv, 0) = 0 THEN 1
            WHEN cl.ltv <= 500 THEN 2
            WHEN cl.ltv <= 1000 THEN 3
            WHEN cl.ltv <= 2500 THEN 4
            WHEN cl.ltv <= 5000 THEN 5
            ELSE 6
          END AS sort_order,
          COUNT(*) AS customer_count,
          AVG(COALESCE(cl.ltv, 0)) AS avg_ltv,
          SUM(COALESCE(cl.ltv, 0)) AS total_ltv,
          COUNT(*) OVER () AS total
        FROM users u
        LEFT JOIN (
          SELECT o.user_id, COALESCE(SUM(fo.price * fo.quantity), 0) AS ltv
          FROM orders o
          LEFT JOIN food_orders fo ON o.id = fo.order_id
          GROUP BY o.user_id
        ) cl ON u.id = cl.user_id
        GROUP BY ltv_range, sort_order
        ORDER BY sort_order
      ) d
    `;

    const [rows] = await analyticsPool.query(query);
    return rows;
  }

  // Get low balance active customers
  // Lean query for display — no address JOINs
  static async getLowBalanceCustomers(threshold = 200, limit = 50) {
    try {
      const query = `
        SELECT
          u.id AS customer_id,
          u.name,
          u.email,
          u.phone,
          COALESCE(wb.balance, 0) AS wallet_balance,
          active_orders.total_orders,
          DATE_FORMAT(active_orders.last_order_date, '%Y-%m-%d') AS last_order_date
        FROM users u
        INNER JOIN (
          SELECT user_id, COUNT(*) AS total_orders, MAX(order_date) AS last_order_date
          FROM orders
          WHERE order_date >= DATE_SUB(NOW(), INTERVAL 10 DAY)
          GROUP BY user_id
        ) active_orders ON u.id = active_orders.user_id
        LEFT JOIN wallet_balances wb ON u.id = wb.user_id
        WHERE COALESCE(wb.balance, 0) <= ?
        ORDER BY COALESCE(wb.balance, 0) ASC
        LIMIT ?
      `;

      const [rows] = await analyticsPool.query(query, [threshold, limit]);
      return rows;
    } catch (error) {
      console.error("Error in getLowBalanceCustomers:", error);
      return [];
    }
  }

  // Get detailed customers list with pagination
  static async getCustomersList(page = 1, limit = 25, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    // Date range filter
    if (filters.start && filters.end) {
      whereConditions.push("u.created_at >= ? AND u.created_at <= ?");
      params.push(filters.start, filters.end);
    }

    // Customer status filter
    if (filters.status) {
      switch (filters.status) {
        case "active":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) <= 30");
          break;
        case "at_risk":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) BETWEEN 31 AND 90");
          break;
        case "inactive":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) BETWEEN 91 AND 180");
          break;
        case "churned":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) > 180");
          break;
      }
    }

    // LTV filter
    if (filters.ltv_min) {
      whereConditions.push("COALESCE(customer_stats.ltv, 0) >= ?");
      params.push(filters.ltv_min);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.created_at as customer_since,
        wb.balance as wallet_balance,
        COALESCE(customer_stats.total_orders, 0) as total_orders,
        COALESCE(customer_stats.ltv, 0) as ltv,
        customer_stats.last_order_date,
        CASE
          WHEN DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) <= 30 THEN 'Active'
          WHEN DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) <= 90 THEN 'At Risk'
          WHEN DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) <= 180 THEN 'Inactive'
          ELSE 'Churned'
        END as customer_status
      FROM users u
      LEFT JOIN wallet_balances wb ON u.id = wb.user_id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) as total_orders,
          COALESCE(SUM(fo.price * fo.quantity), 0) as ltv,
          MAX(o.order_date) as last_order_date
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        GROUP BY user_id
      ) customer_stats ON u.id = customer_stats.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get recent customers (newly registered)
  // Lean query — no address JOINs
  static async getRecentCustomers(limit = 10) {
    const query = `
      SELECT
        u.id AS customer_id,
        u.name,
        u.email,
        u.phone,
        COALESCE(wb.balance, 0) AS wallet_balance,
        DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created_at,
        COALESCE(stats.total_orders, 0) AS total_orders,
        COALESCE(stats.ltv, 0) AS ltv,
        stats.last_order_date,
        CASE
          WHEN stats.last_order_date IS NULL THEN 'New/Prospect'
          WHEN DATEDIFF(NOW(), stats.last_order_date) <= 15 THEN 'Active'
          WHEN DATEDIFF(NOW(), stats.last_order_date) BETWEEN 15 AND 30 THEN 'At Risk'
          ELSE 'Inactive'
        END AS customer_status
      FROM users u
      LEFT JOIN wallet_balances wb ON u.id = wb.user_id
      LEFT JOIN (
        SELECT
          o.user_id,
          COUNT(DISTINCT o.id) AS total_orders,
          COALESCE(SUM(fo.price * fo.quantity), 0) AS ltv,
          DATE_FORMAT(MAX(o.order_date), '%Y-%m-%d') AS last_order_date
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        GROUP BY o.user_id
      ) stats ON u.id = stats.user_id
      ORDER BY u.created_at DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, [limit]);
    return rows;
  }

  // Get customers count for pagination
  static async getCustomersCount(filters = {}) {
    let whereConditions = [];
    let params = [];

    // Apply same filters as getCustomersList
    if (filters.start && filters.end) {
      whereConditions.push("u.created_at >= ? AND u.created_at <= ?");
      params.push(filters.start, filters.end);
    }

    if (filters.status) {
      switch (filters.status) {
        case "active":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) <= 30");
          break;
        case "at_risk":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) BETWEEN 31 AND 90");
          break;
        case "inactive":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) BETWEEN 91 AND 180");
          break;
        case "churned":
          whereConditions.push("DATEDIFF(NOW(), COALESCE(customer_stats.last_order_date, u.created_at)) > 180");
          break;
      }
    }

    if (filters.ltv_min) {
      whereConditions.push("COALESCE(customer_stats.ltv, 0) >= ?");
      params.push(filters.ltv_min);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN (
        SELECT
          user_id,
          COALESCE(SUM(fo.price * fo.quantity), 0) as ltv,
          MAX(o.order_date) as last_order_date
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        GROUP BY user_id
      ) customer_stats ON u.id = customer_stats.user_id
      ${whereClause}
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows[0].total;
  }
}
