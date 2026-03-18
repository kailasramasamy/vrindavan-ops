// Analytics Model - Database queries for analytics dashboard
import { analyticsPool } from "../../../db/pool.js";

export class AnalyticsModel {
  // Get overview metrics for dashboard (simplified for performance)
  static async getOverviewMetrics(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "WHERE o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    const query = `
      SELECT 
        -- Orders
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Order Received' THEN o.id END) as pending_orders,
        
        -- Revenue
        COALESCE(SUM(fo.price * fo.quantity), 0) as net_revenue,
        COALESCE(SUM(o.tax), 0) as total_tax,
        COALESCE(SUM(o.delivery_fee), 0) as delivery_fees,
        
        -- Customers
        COUNT(DISTINCT o.user_id) as total_customers,
        COUNT(DISTINCT CASE WHEN u.created_at >= ? AND u.created_at <= ? THEN u.id END) as new_customers,
        
        -- AOV
        CASE 
          WHEN COUNT(DISTINCT o.id) > 0 
          THEN COALESCE(SUM(fo.price * fo.quantity), 0) / COUNT(DISTINCT o.id)
          ELSE 0 
        END as aov
        
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      LEFT JOIN users u ON o.user_id = u.id
      ${dateFilter}
    `;

    // Add date parameters for new customers calculation
    const finalParams = start && end ? [...params, start, end] : [...params, "1900-01-01", "2099-12-31"];

    const [rows] = await analyticsPool.query(query, finalParams);
    return rows[0];
  }

  // Get trend data for charts (simplified for performance)
  static async getTrendData(groupBy = "day", dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      // Use date-only comparison to include full days
      // Handle both Date objects and date strings
      const startDate = typeof start === "string" ? start : start.toISOString().split("T")[0];
      const endDate = typeof end === "string" ? end : end.toISOString().split("T")[0];
      // Use >= for start date and < for end date + 1 day to include the full end day
      const endDatePlusOne = new Date(endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      const endDatePlusOneStr = endDatePlusOne.toISOString().split("T")[0];
      dateFilter = "WHERE DATE(o.order_date) >= ? AND DATE(o.order_date) < ?";
      params = [startDate, endDatePlusOneStr];
    }

    let groupByField = "";
    switch (groupBy) {
      case "hour":
        groupByField = 'DATE_FORMAT(o.order_date, "%Y-%m-%d %H:00:00")';
        break;
      case "day":
        groupByField = "DATE_FORMAT(o.order_date, '%Y-%m-%d')";
        break;
      case "week":
        groupByField = 'DATE_FORMAT(o.order_date, "%Y-W%u")';
        break;
      case "month":
        groupByField = 'DATE_FORMAT(o.order_date, "%Y-%m")';
        break;
      case "quarter":
        groupByField = 'CONCAT(YEAR(o.order_date), "-Q", QUARTER(o.order_date))';
        break;
      case "year":
        groupByField = "YEAR(o.order_date)";
        break;
      default:
        groupByField = "DATE(o.order_date)";
    }

    const query = `
      SELECT 
        ${groupByField} as period,
        COUNT(DISTINCT o.id) as orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        COALESCE(SUM(fo.price * fo.quantity), 0) as revenue,
        COUNT(DISTINCT o.user_id) as customers
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      ${dateFilter}
      GROUP BY ${groupByField}
      ORDER BY period ASC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get top products by revenue (simplified for performance)
  static async getTopProducts(limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [limit];

    if (start && end) {
      dateFilter = "WHERE o.order_date >= ? AND o.order_date <= ?";
      params = [start, end, limit];
    }

    const query = `
      SELECT 
        f.name as product_name,
        f.unit,
        COUNT(DISTINCT o.id) as order_count,
        SUM(fo.quantity) as total_quantity,
        COALESCE(SUM(fo.price * fo.quantity), 0) as revenue
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      LEFT JOIN foods f ON fo.food_id = f.id
      ${dateFilter}
      GROUP BY f.id, f.name, f.unit
      ORDER BY revenue DESC, order_count DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get channel performance (simplified for performance)
  static async getChannelPerformance(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "WHERE o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    const query = `
      SELECT 
        CASE 
          WHEN o.order_type = '1' THEN 'Regular Orders'
          WHEN o.order_type = '2' THEN 'Subscription Orders'
          ELSE 'Other'
        END as channel,
        COUNT(DISTINCT o.id) as orders,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as revenue,
        COUNT(DISTINCT o.user_id) as customers
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      ${dateFilter}
      GROUP BY o.order_type
      ORDER BY orders DESC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get recent activity (simplified for performance)
  static async getRecentActivity(limit = 10) {
    const query = `
      SELECT 
        o.id as order_id,
        u.name as customer_name,
        os.status as order_status,
        SUM(fo.quantity) as item_count,
        SUM(fo.price * fo.quantity) as order_value,
        o.order_date
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY o.id, u.name, os.status, o.order_date
      ORDER BY o.order_date DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, [limit]);
    return rows;
  }
}
