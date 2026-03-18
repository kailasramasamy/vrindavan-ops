// Orders Analytics Model - Database queries for orders analytics
import { analyticsPool } from "../../../db/pool.js";

// Helper function for GROUP BY clauses
function getGroupByClause(groupBy) {
  switch (groupBy) {
    case "hour":
      return "DATE_FORMAT(o.order_date, '%Y-%m-%d %H:00:00') as period";
    case "day":
      return "DATE_FORMAT(o.order_date, '%Y-%m-%d') as period";
    case "week":
      return "DATE_FORMAT(o.order_date, '%Y-%u') as period";
    case "month":
      return "DATE_FORMAT(o.order_date, '%Y-%m') as period";
    case "year":
      return "DATE_FORMAT(o.order_date, '%Y') as period";
    default:
      return "DATE_FORMAT(o.order_date, '%Y-%m-%d') as period";
  }
}

export class OrdersAnalyticsModel {
  // Get orders overview metrics
  static async getOrdersMetrics(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Get basic order metrics
    const basicQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Cancelled' THEN o.id END) as cancelled_orders,
        COUNT(DISTINCT CASE WHEN os.status IN ('Order Received', 'Preparing', 'Ready', 'On the Way') THEN o.id END) as pending_orders,
        COUNT(DISTINCT o.user_id) as total_customers
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      WHERE 1=1 ${dateFilter}
    `;

    // Get revenue and AOV metrics
    const revenueQuery = `
      SELECT 
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        CASE 
          WHEN COUNT(DISTINCT o.id) > 0 THEN COALESCE(SUM(fo.price * fo.quantity), 0) / COUNT(DISTINCT o.id)
          ELSE 0 
        END as avg_order_value
      FROM orders o
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE 1=1 ${dateFilter}
    `;

    // Get subscription vs regular orders based on order_type
    // Based on the data: order_type 1 = regular, order_type 2 = subscription, etc.
    const subscriptionQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as subscription_orders
      FROM orders o
      WHERE 1=1 ${dateFilter}
      AND o.order_type = '2'
    `;

    const [[basicRows], [revenueRows], [subscriptionRows]] = await Promise.all([analyticsPool.query(basicQuery, params), analyticsPool.query(revenueQuery, params), analyticsPool.query(subscriptionQuery, params)]);

    const basic = basicRows[0];
    const revenue = revenueRows[0];
    const subscription = subscriptionRows[0];

    return {
      ...basic,
      total_revenue: revenue.total_revenue,
      avg_order_value: revenue.avg_order_value,
      subscription_orders: subscription.subscription_orders,
      regular_orders: basic.total_orders - subscription.subscription_orders,
    };
  }

  // Get orders trend data
  static async getOrdersTrend(groupBy = "day", dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    let dateFormat = "";
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.order_type = '2' THEN o.id END) as subscription_orders,
        COUNT(DISTINCT CASE WHEN o.order_type = '1' THEN o.id END) as regular_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        COUNT(DISTINCT CASE WHEN os.status = 'Cancelled' THEN o.id END) as cancelled_orders,
        COUNT(DISTINCT CASE WHEN os.status IN ('Order Received', 'Preparing', 'Ready', 'On the Way') THEN o.id END) as pending_orders,
        COUNT(DISTINCT o.user_id) as unique_customers,
        COALESCE(SUM(fo.price * fo.quantity), 0) as revenue
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE 1=1 ${dateFilter}
      GROUP BY DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY period ASC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get orders by status (optimized)
  static async getOrdersByStatus(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Optimized query with better performance
    const query = `
      SELECT 
        COALESCE(os.status, 'Unknown') as status,
        COUNT(o.id) as order_count,
        COUNT(DISTINCT o.user_id) as customer_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE 1=1 ${dateFilter}
      GROUP BY os.status
      ORDER BY order_count DESC
      LIMIT 10
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get orders by channel (optimized)
  static async getOrdersByChannel(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Optimized query with better performance
    const query = `
      SELECT 
        CASE 
          WHEN o.order_type = '1' THEN 'Regular Orders'
          WHEN o.order_type = '2' THEN 'Subscription Orders'
          ELSE 'Other'
        END as channel,
        o.order_type,
        COUNT(o.id) as order_count,
        COUNT(DISTINCT o.user_id) as customer_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COALESCE(AVG(fo.price * fo.quantity), 0) as avg_order_value
      FROM orders o
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE 1=1 ${dateFilter}
      GROUP BY o.order_type
      ORDER BY order_count DESC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get top products by order count
  static async getTopProductsByOrders(limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [limit];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end, limit];
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.price as base_price,
        f.unit,
        c.name as category_name,
        COUNT(DISTINCT fo.order_id) as order_count,
        SUM(fo.quantity) as total_quantity,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COALESCE(AVG(fo.price * fo.quantity), 0) as avg_item_value
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE f.id IS NOT NULL ${dateFilter}
      GROUP BY f.id, f.name, f.price, f.unit, c.name
      ORDER BY order_count DESC, total_revenue DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get top categories by revenue
  static async getTopCategories(limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [limit];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end, limit];
    }

    const query = `
      SELECT 
        c.id,
        c.name as category_name,
        COUNT(DISTINCT fo.order_id) as order_count,
        COUNT(DISTINCT o.user_id) as unique_customers,
        SUM(fo.quantity) as total_quantity,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COALESCE(AVG(fo.price * fo.quantity), 0) as avg_item_value,
        COUNT(DISTINCT f.id) as unique_products
      FROM categories c
      LEFT JOIN foods f ON c.id = f.category_id
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      WHERE c.id IS NOT NULL ${dateFilter}
      GROUP BY c.id, c.name
      HAVING total_revenue > 0
      ORDER BY total_revenue DESC, order_count DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get top products by revenue (for orders analytics page)
  static async getTopProductsByRevenue(limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [limit];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end, limit];
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.price as base_price,
        f.unit,
        c.name as category_name,
        COUNT(DISTINCT fo.order_id) as order_count,
        SUM(fo.quantity) as total_quantity,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COALESCE(AVG(fo.price * fo.quantity), 0) as avg_item_value
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE f.id IS NOT NULL ${dateFilter}
      GROUP BY f.id, f.name, f.price, f.unit, c.name
      ORDER BY total_revenue DESC, order_count DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get products within a specific category
  static async getProductsByCategory(categoryId, limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [categoryId, limit];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [categoryId, start, end, limit];
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.price as base_price,
        f.unit,
        c.name as category_name,
        COUNT(DISTINCT fo.order_id) as order_count,
        SUM(fo.quantity) as total_quantity,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COALESCE(AVG(fo.price * fo.quantity), 0) as avg_item_value
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE f.category_id = ? ${dateFilter}
      GROUP BY f.id, f.name, f.price, f.unit, c.name
      ORDER BY total_revenue DESC, order_count DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get cancellation reasons
  static async getCancellationReasons(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    const query = `
      SELECT 
        COALESCE(o.cancel_reason, 'No reason provided') as reason,
        COUNT(DISTINCT o.id) as cancellation_count,
        COUNT(DISTINCT o.user_id) as affected_customers
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      WHERE os.status = 'Cancelled' ${dateFilter}
      GROUP BY o.cancel_reason
      ORDER BY cancellation_count DESC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get detailed orders list with pagination
  static async getOrdersList(page = 1, limit = 25, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    // Date range filter
    if (filters.start && filters.end) {
      whereConditions.push("o.order_date >= ? AND o.order_date <= ?");
      params.push(filters.start, filters.end);
    }

    // Status filter
    if (filters.status) {
      whereConditions.push("os.status = ?");
      params.push(filters.status);
    }

    // Channel filter
    if (filters.channel) {
      whereConditions.push("o.order_type = ?");
      params.push(filters.channel);
    }

    // Customer filter
    if (filters.customer) {
      whereConditions.push("(u.name LIKE ? OR u.email LIKE ?)");
      params.push(`%${filters.customer}%`, `%${filters.customer}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        o.id as order_id,
        o.order_date,
        os.status as order_status,
        CASE 
          WHEN o.order_type = '1' THEN 'Regular Orders'
          WHEN o.order_type = '2' THEN 'Subscription Orders'
          ELSE 'Other'
        END as channel,
        u.name as customer_name,
        u.email as customer_email,
        fo.total_line_value as order_value,
        fo.item_count,
        o.tax,
        o.delivery_fee,
        (fo.total_line_value + COALESCE(o.tax, 0) + COALESCE(o.delivery_fee, 0)) as total_amount
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN (
        SELECT 
          order_id, 
          SUM(price * quantity) as total_line_value,
          COUNT(*) as item_count
        FROM food_orders
        GROUP BY order_id
      ) fo ON o.id = fo.order_id
      ${whereClause}
      ORDER BY o.order_date DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get orders count for pagination
  static async getOrdersCount(filters = {}) {
    let whereConditions = [];
    let params = [];

    // Apply same filters as getOrdersList
    if (filters.start && filters.end) {
      whereConditions.push("o.order_date >= ? AND o.order_date <= ?");
      params.push(filters.start, filters.end);
    }

    if (filters.status) {
      whereConditions.push("os.status = ?");
      params.push(filters.status);
    }

    if (filters.channel) {
      whereConditions.push("o.order_type = ?");
      params.push(filters.channel);
    }

    if (filters.customer) {
      whereConditions.push("(u.name LIKE ? OR u.email LIKE ?)");
      params.push(`%${filters.customer}%`, `%${filters.customer}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN users u ON o.user_id = u.id
      ${whereClause}
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows[0].total;
  }

  // Get all products for dropdown (with search capability)
  static async getAllProductsForDropdown() {
    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.unit,
        c.name as category_name
      FROM foods f
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE f.id IS NOT NULL
      ORDER BY f.name ASC
    `;

    const [rows] = await analyticsPool.query(query);
    return rows;
  }

  // Get product performance data over time
  static async getProductPerformance(productId, dateRange = { start: null, end: null }, groupBy = "day") {
    const { start, end } = dateRange;
    let dateFilter = "";

    // Handle comma-separated product IDs
    const productIds = productId
      .toString()
      .split(",")
      .map((id) => parseInt(id.trim()));
    let params = [...productIds];

    if (start && end) {
      dateFilter = " AND o.order_date >= ? AND o.order_date <= ?";
      params = [...productIds, start, end];
    }

    // Determine the date format based on groupBy
    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "week":
        dateFormat = "%Y-%u"; // Year-week
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default: // 'day'
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as date_period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      WHERE f.id IN (${productIds.map(() => "?").join(",")})${dateFilter}
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY DATE_FORMAT(o.order_date, '${dateFormat}') ASC, f.name ASC
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group data by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.id]) {
        result[row.id] = {
          id: row.id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.id].data.push({
        date_period: row.date_period,
        total_quantity: row.total_quantity,
        order_count: row.order_count,
        total_revenue: row.total_revenue,
      });
    });

    return Object.values(result);
  }

  // Get top products performance data over time
  static async getTopProductsPerformance(limit = 5, dateRange = { start: null, end: null }, groupBy = "day") {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Determine the date format based on groupBy
    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "week":
        dateFormat = "%Y-%u"; // Year-week
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default: // 'day'
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as date_period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM foods f
      INNER JOIN food_orders fo ON f.id = fo.food_id
      INNER JOIN orders o ON fo.order_id = o.id
      WHERE 1=1 ${dateFilter}
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY SUM(fo.quantity) DESC
      LIMIT ${limit}
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group data by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.id]) {
        result[row.id] = {
          id: row.id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.id].data.push({
        date_period: row.date_period,
        total_quantity: row.total_quantity,
        order_count: row.order_count,
        total_revenue: row.total_revenue,
      });
    });

    return Object.values(result);
  }

  static async getCategories() {
    const query = `
      SELECT DISTINCT c.id, c.name
      FROM categories c
      INNER JOIN foods f ON c.id = f.category_id
      INNER JOIN food_orders fo ON f.id = fo.food_id
      ORDER BY c.name ASC
    `;
    const [rows] = await analyticsPool.query(query);
    return rows;
  }

  static async getSubCategories(categoryId) {
    const query = `
      SELECT DISTINCT sc.id, sc.name
      FROM sub_categories sc
      INNER JOIN foods f ON sc.id = f.subcategory_id
      INNER JOIN food_orders fo ON f.id = fo.food_id
      WHERE f.category_id = ?
      ORDER BY sc.name ASC
    `;
    const [rows] = await analyticsPool.query(query, [categoryId]);
    return rows;
  }

  static async getCategoryPerformance(categoryId, subCategoryId, dateRange = { start: null, end: null }, groupBy = "day") {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [categoryId, subCategoryId];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [categoryId, subCategoryId, start, end];
    }

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as date_period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      WHERE f.category_id = ? AND f.subcategory_id = ? ${dateFilter}
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY DATE_FORMAT(o.order_date, '${dateFormat}') ASC, f.name ASC
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.id]) {
        result[row.id] = {
          id: row.id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.id].data.push({
        date_period: row.date_period,
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
      });
    });

    return Object.values(result);
  }

  // Get All Products Order Trend Data - Optimized for Performance
  static async getAllProductsTrend(start, end, groupBy = "day", originalRange = null, page = 1) {
    let dateFilter = "";
    let params = [];

    if (start && end) {
      // Calculate date difference for pagination logic
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      if (originalRange && (originalRange.startsWith("Q") || originalRange.match(/^\d{4}$/))) {
        // Use the dates as provided by the controller (already calculated for the specific page)
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (originalRange && ["last_30_days", "last_month", "this_month", "custom"].includes(originalRange)) {
        // For single-month ranges, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (groupBy === "month" && daysDiff > 60) {
        // Max 2 months for monthly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "week" && daysDiff > 30) {
        // Max 1 month for weekly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (daysDiff > 15) {
        // For ranges > 15 days, implement pagination
        let daysPerPage;
        if (originalRange && originalRange.startsWith("Q")) {
          // Quarterly: 1 month per page
          daysPerPage = 30;
        } else if (originalRange && originalRange.match(/^\d{4}$/)) {
          // Yearly: 1 month per page
          daysPerPage = 30;
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
        }

        const currentPage = parseInt(page);
        const startOffset = (currentPage - 1) * daysPerPage;
        const pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        const pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;

        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [pageStart.toISOString().split("T")[0], actualEnd.toISOString().split("T")[0]];
      } else {
        // For ranges <= 15 days, use full range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      }
    }

    // Optimized query with subquery to pre-filter orders
    const query = `
      SELECT 
        p.id,
        p.name,
        p.unit,
        ${getGroupByClause(groupBy)},
        SUM(oi.quantity) as total_quantity,
        COUNT(DISTINCT o.id) as order_count,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM (
        SELECT id, order_date 
        FROM orders 
        WHERE order_status = 'delivered' 
        ${dateFilter}
      ) o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      GROUP BY p.id, p.name, p.unit, ${getGroupByClause(groupBy)}
      ORDER BY p.name, ${getGroupByClause(groupBy)}
    `;

    try {
      const [rows] = await analyticsPool.query(query, params);

      // Group data by product
      const productMap = new Map();

      rows.forEach((row) => {
        const productKey = `${row.id}_${row.name}_${row.unit}`;

        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            id: row.id,
            name: row.name,
            unit: row.unit,
            data: [],
          });
        }

        productMap.get(productKey).data.push({
          period: row.period,
          total_quantity: parseInt(row.total_quantity),
          order_count: parseInt(row.order_count),
          total_revenue: parseFloat(row.total_revenue),
        });
      });

      return Array.from(productMap.values());
    } catch (error) {
      console.error("Error in getAllProductsTrend:", error);
      throw error;
    }
  }

  // Get All Products Order Trend Data - Simple approach using order_items
  static async getAllProductsTrend(start, end, groupBy = "day", originalRange = null, page = 1) {
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Simple query for all products from food_orders table
    const query = `
      SELECT 
        f.id,
        f.name,
        f.unit,
        ${getGroupByClause(groupBy)},
        COALESCE(SUM(fo.quantity), 0) as total_quantity,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(fo.quantity * fo.price), 0) as total_revenue
      FROM orders o
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      LEFT JOIN foods f ON fo.food_id = f.id
      WHERE f.id IS NOT NULL ${dateFilter}
      GROUP BY f.id, f.name, f.unit, ${getGroupByClause(groupBy)}
      ORDER BY f.name, ${getGroupByClause(groupBy)}
      LIMIT 1000
    `;

    try {
      const [rows] = await analyticsPool.query(query, params);

      // Group data by product
      const productMap = new Map();

      rows.forEach((row) => {
        const productKey = `${row.id}_${row.name}_${row.unit}`;

        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            id: row.id,
            name: row.name,
            unit: row.unit,
            data: [],
          });
        }

        productMap.get(productKey).data.push({
          period: row.period,
          total_quantity: parseInt(row.total_quantity),
          order_count: parseInt(row.order_count),
          total_revenue: parseFloat(row.total_revenue),
        });
      });

      return Array.from(productMap.values());
    } catch (error) {
      console.error("Error in getAllProductsTrend:", error);
      throw error;
    }
  }

  // Get Revenue Trend Data - Simple approach using order_items for revenue analysis
  static async getRevenueTrend(start, end, groupBy = "day", originalRange = null, page = 1) {
    console.log("getRevenueTrend called with:", start, end, groupBy, originalRange, page);
    let dateFilter = "";
    let params = [];

    if (start && end) {
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [start, end];
    }

    // Get the GROUP BY clause
    let groupByClause;
    switch (groupBy) {
      case "hour":
        groupByClause = "DATE_FORMAT(o.order_date, '%Y-%m-%d %H:00:00') as period";
        break;
      case "day":
        groupByClause = "DATE_FORMAT(o.order_date, '%Y-%m-%d') as period";
        break;
      case "week":
        groupByClause = "DATE_FORMAT(o.order_date, '%Y-%u') as period";
        break;
      case "month":
        groupByClause = "DATE_FORMAT(o.order_date, '%Y-%m') as period";
        break;
      case "year":
        groupByClause = "DATE_FORMAT(o.order_date, '%Y') as period";
        break;
      default:
        groupByClause = "DATE_FORMAT(o.order_date, '%Y-%m-%d') as period";
    }

    // Simple query for revenue trend from food_orders table
    const query = `
      SELECT 
        ${groupByClause},
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(fo.quantity), 0) as total_quantity
      FROM orders o
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      WHERE 1=1 ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY ${groupByClause}
      LIMIT 1000
    `;

    try {
      const [rows] = await analyticsPool.query(query, params);

      // Format data to match the expected structure
      const result = [
        {
          id: "revenue",
          name: "Total Revenue",
          unit: "₹",
          data: rows.map((row) => ({
            period: row.period,
            total_quantity: parseInt(row.total_quantity),
            order_count: parseInt(row.order_count),
            total_revenue: parseFloat(row.total_revenue),
          })),
        },
      ];

      return result;
    } catch (error) {
      console.error("Error in getRevenueTrend:", error);
      throw error;
    }
  }

  // Get Milk Order Trend Data (Product Level) - Optimized for Performance
  static async getMilkOrderTrend(dateRange = { start: null, end: null }, groupBy = "day", page = 1, originalRange = null) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      // Apply strict date range limit for performance
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // For quarterly and yearly ranges, bypass all performance limits
      if (originalRange && (originalRange.startsWith("Q") || originalRange.match(/^\d{4}$/))) {
        // Use the dates as provided by the controller (already calculated for the specific page)
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (originalRange && ["last_30_days", "last_month", "this_month", "custom"].includes(originalRange)) {
        // For single-month ranges, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (groupBy === "month" && daysDiff > 60) {
        // Max 2 months for monthly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "week" && daysDiff > 30) {
        // Max 1 month for weekly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (daysDiff > 15) {
        // For ranges > 15 days, implement pagination
        let daysPerPage;

        // For other ranges, use the existing pagination logic
        if (start && start.includes("-") && start.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          daysPerPage = Math.ceil(daysDiff / 12);
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
        }

        const startOffset = (page - 1) * daysPerPage;
        const pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        const pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);

        // Don't exceed the original end date
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;

        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [pageStart.toISOString().split("T")[0], actualEnd.toISOString().split("T")[0]];
      } else {
        // For ranges <= 15 days, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      }
    } else {
      // Default to last 7 days if no date range provided for performance
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]];
    }

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    // Simplified query for better performance - use subquery to pre-filter
    const query = `
      SELECT 
        f.id as product_id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM (
        SELECT id, order_date 
        FROM orders 
        WHERE order_date >= ? AND order_date <= ?
      ) o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      INNER JOIN foods f ON fo.food_id = f.id
      INNER JOIN categories c ON f.category_id = c.id
      INNER JOIN sub_categories sc ON f.subcategory_id = sc.id AND c.id = sc.id
      WHERE c.name = 'Milk & Dairy' 
        AND sc.name = 'Milk'
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY f.name ASC, DATE_FORMAT(o.order_date, '${dateFormat}') ASC
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.product_id]) {
        result[row.product_id] = {
          id: row.product_id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.product_id].data.push({
        period: row.period,
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
      });
    });

    return Object.values(result);
  }

  // Get Curd Order Trend Data (Product Level)
  static async getCurdOrderTrend(dateRange = { start: null, end: null }, groupBy = "day", page = 1, originalRange = null) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // For quarterly and yearly ranges, bypass all performance limits
      if (originalRange && (originalRange.startsWith("Q") || originalRange.match(/^\d{4}$/))) {
        // Use the dates as provided by the controller (already calculated for the specific page)
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (originalRange && ["last_30_days", "last_month", "this_month", "custom"].includes(originalRange)) {
        // For single-month ranges, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (groupBy === "hour" && daysDiff > 7) {
        // Max 7 days for hourly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "day" && daysDiff > 14) {
        // Max 14 days for daily - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "month" && daysDiff > 60) {
        // Max 2 months for monthly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "week" && daysDiff > 30) {
        // Max 1 month for weekly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (daysDiff > 15) {
        // For ranges > 15 days, implement pagination
        let daysPerPage;

        // For other ranges, use the existing pagination logic
        if (start && start.includes("-") && start.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          daysPerPage = Math.ceil(daysDiff / 12);
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
        }

        const startOffset = (page - 1) * daysPerPage;
        const pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        const pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);

        // Don't exceed the original end date
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;

        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [pageStart.toISOString().split("T")[0], actualEnd.toISOString().split("T")[0]];
      } else {
        // For ranges <= 15 days, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      }
    } else {
      // Default to last 7 days if no date range provided for performance
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]];
    }

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id as product_id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM (
        SELECT id, order_date 
        FROM orders 
        WHERE order_date >= ? AND order_date <= ?
      ) o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      INNER JOIN foods f ON fo.food_id = f.id
      INNER JOIN categories c ON f.category_id = c.id
      INNER JOIN sub_categories sc ON f.subcategory_id = sc.id AND sc.category_id = c.id
      WHERE c.name = 'Milk & Dairy' 
        AND sc.name = 'Curd'
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY f.name ASC, DATE_FORMAT(o.order_date, '${dateFormat}') ASC
    `;

    const [rows] = await analyticsPool.query(query, [start, end]);

    // Group by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.product_id]) {
        result[row.product_id] = {
          id: row.product_id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.product_id].data.push({
        period: row.period,
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
      });
    });

    return Object.values(result);
  }

  // Get Paneer Order Trend Data (Product Level)
  static async getPaneerOrderTrend(dateRange = { start: null, end: null }, groupBy = "day", page = 1, originalRange = null) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // For quarterly and yearly ranges, bypass all performance limits
      if (originalRange && (originalRange.startsWith("Q") || originalRange.match(/^\d{4}$/))) {
        // Use the dates as provided by the controller (already calculated for the specific page)
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (originalRange && ["last_30_days", "last_month", "this_month", "custom"].includes(originalRange)) {
        // For single-month ranges, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (groupBy === "hour" && daysDiff > 7) {
        // Max 7 days for hourly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "day" && daysDiff > 14) {
        // Max 14 days for daily - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "month" && daysDiff > 60) {
        // Max 2 months for monthly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "week" && daysDiff > 30) {
        // Max 1 month for weekly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (daysDiff > 15) {
        // For ranges > 15 days, implement pagination
        let daysPerPage;

        // For other ranges, use the existing pagination logic
        if (start && start.includes("-") && start.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          daysPerPage = Math.ceil(daysDiff / 12);
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
        }

        const startOffset = (page - 1) * daysPerPage;
        const pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        const pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);

        // Don't exceed the original end date
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;

        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [pageStart.toISOString().split("T")[0], actualEnd.toISOString().split("T")[0]];
      } else {
        // For ranges <= 15 days, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      }
    } else {
      // Default to last 7 days if no date range provided for performance
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]];
    }

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id as product_id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM orders o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      INNER JOIN foods f ON fo.food_id = f.id
      INNER JOIN categories c ON f.category_id = c.id
      INNER JOIN sub_categories sc ON f.subcategory_id = sc.id
      WHERE c.name = 'Milk & Dairy' 
        AND sc.name = 'Paneer'
        ${dateFilter}
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY f.name ASC, DATE_FORMAT(o.order_date, '${dateFormat}') ASC
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.product_id]) {
        result[row.product_id] = {
          id: row.product_id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.product_id].data.push({
        period: row.period,
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
      });
    });

    return Object.values(result);
  }

  // Get Ghee Order Trend Data (Product Level)
  static async getGheeOrderTrend(dateRange = { start: null, end: null }, groupBy = "day", page = 1, originalRange = null) {
    const { start, end } = dateRange;
    let dateFilter = "";
    let params = [];

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // For quarterly and yearly ranges, bypass all performance limits
      if (originalRange && (originalRange.startsWith("Q") || originalRange.match(/^\d{4}$/))) {
        // Use the dates as provided by the controller (already calculated for the specific page)
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (originalRange && ["last_30_days", "last_month", "this_month", "custom"].includes(originalRange)) {
        // For single-month ranges, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      } else if (groupBy === "hour" && daysDiff > 7) {
        // Max 7 days for hourly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "day" && daysDiff > 14) {
        // Max 14 days for daily - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "month" && daysDiff > 60) {
        // Max 2 months for monthly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (groupBy === "week" && daysDiff > 30) {
        // Max 1 month for weekly - start from the beginning of requested range
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        const limitedEnd = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        params = [start, limitedEnd.toISOString().split("T")[0]];
      } else if (daysDiff > 15) {
        // For ranges > 15 days, implement pagination
        let daysPerPage;

        // For other ranges, use the existing pagination logic
        if (start && start.includes("-") && start.match(/^\d{4}$/)) {
          // Yearly: 12 pages (one month per page)
          daysPerPage = Math.ceil(daysDiff / 12);
        } else {
          // Default: 15 days per page
          daysPerPage = 15;
        }

        const startOffset = (page - 1) * daysPerPage;
        const pageStart = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000);
        const pageEnd = new Date(pageStart.getTime() + (daysPerPage - 1) * 24 * 60 * 60 * 1000);

        // Don't exceed the original end date
        const actualEnd = pageEnd > endDate ? endDate : pageEnd;

        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [pageStart.toISOString().split("T")[0], actualEnd.toISOString().split("T")[0]];
      } else {
        // For ranges <= 15 days, use the full date range without pagination
        dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
        params = [start, end];
      }
    } else {
      // Default to last 7 days if no date range provided for performance
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      dateFilter = "AND o.order_date >= ? AND o.order_date <= ?";
      params = [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]];
    }

    let dateFormat;
    switch (groupBy) {
      case "hour":
        dateFormat = "%Y-%m-%d %H:00:00";
        break;
      case "day":
        dateFormat = "%Y-%m-%d";
        break;
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "quarter":
        dateFormat = "%Y-%q";
        break;
      case "year":
        dateFormat = "%Y";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const query = `
      SELECT 
        f.id as product_id,
        f.name as product_name,
        f.unit,
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        SUM(fo.quantity) as total_quantity,
        COUNT(DISTINCT fo.order_id) as order_count,
        COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue
      FROM orders o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      INNER JOIN foods f ON fo.food_id = f.id
      INNER JOIN categories c ON f.category_id = c.id
      INNER JOIN sub_categories sc ON f.subcategory_id = sc.id
      WHERE c.name = 'Ghee' 
        AND sc.name = 'Ghee'
        ${dateFilter}
      GROUP BY f.id, f.name, f.unit, DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY f.name ASC, DATE_FORMAT(o.order_date, '${dateFormat}') ASC
    `;

    const [rows] = await analyticsPool.query(query, params);

    // Group by product
    const result = {};
    rows.forEach((row) => {
      if (!result[row.product_id]) {
        result[row.product_id] = {
          id: row.product_id,
          name: row.product_name,
          unit: row.unit,
          data: [],
        };
      }
      result[row.product_id].data.push({
        period: row.period,
        total_quantity: parseInt(row.total_quantity) || 0,
        order_count: parseInt(row.order_count) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
      });
    });

    return Object.values(result);
  }

  // Get products for filter dropdown (filtered by category/subcategory)
  static async getProductsForFilter(categoryId = null, subCategoryId = null) {
    let conditions = ["f.id IS NOT NULL"];
    let params = [];

    if (categoryId) {
      conditions.push("f.category_id = ?");
      params.push(categoryId);
    }
    if (subCategoryId) {
      conditions.push("f.subcategory_id = ?");
      params.push(subCategoryId);
    }

    const query = `
      SELECT DISTINCT f.id, f.name as product_name, f.unit, c.name as category_name
      FROM foods f
      LEFT JOIN categories c ON f.category_id = c.id
      INNER JOIN food_orders fo ON f.id = fo.food_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY f.name ASC
    `;
    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get filtered orders trend data with revenue
  static async getFilteredOrdersTrend(groupBy = "day", dateRange = { start: null, end: null }, filters = {}) {
    const { start, end } = dateRange;
    const { categoryId, subCategoryId, productId } = filters;
    const needsProductFilter = categoryId || subCategoryId || productId;

    // Date params always come first (for the subquery)
    let dateParams = [];
    let dateSubquery;
    if (start && end) {
      dateSubquery = `(SELECT id, order_date, order_type FROM orders WHERE order_date >= ? AND order_date <= ?)`;
      dateParams = [start, end];
    } else {
      dateSubquery = `orders`;
    }

    // Product filter params come after date params
    let productFilter = "";
    let filterParams = [];
    if (productId) {
      productFilter += " AND f.id = ?";
      filterParams.push(productId);
    }
    if (subCategoryId) {
      productFilter += " AND f.subcategory_id = ?";
      filterParams.push(subCategoryId);
    }
    if (categoryId) {
      productFilter += " AND f.category_id = ?";
      filterParams.push(categoryId);
    }

    const params = [...dateParams, ...filterParams];

    let dateFormat;
    switch (groupBy) {
      case "week":
        dateFormat = "%Y-%u";
        break;
      case "month":
        dateFormat = "%Y-%m";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    let query;
    if (needsProductFilter) {
      query = `
        SELECT
          DATE_FORMAT(o.order_date, '${dateFormat}') as period,
          COUNT(DISTINCT o.id) as total_orders,
          COUNT(DISTINCT CASE WHEN o.order_type = '2' THEN o.id END) as subscription_orders,
          COUNT(DISTINCT CASE WHEN o.order_type = '1' THEN o.id END) as regular_orders,
          SUM(fo.price * fo.quantity) as total_revenue,
          SUM(fo.quantity) as total_quantity
        FROM ${dateSubquery} o
        INNER JOIN food_orders fo ON o.id = fo.order_id
        INNER JOIN foods f ON fo.food_id = f.id
        WHERE 1=1 ${productFilter}
        GROUP BY DATE_FORMAT(o.order_date, '${dateFormat}')
        ORDER BY period ASC
      `;
    } else {
      query = `
        SELECT
          DATE_FORMAT(o.order_date, '${dateFormat}') as period,
          COUNT(DISTINCT o.id) as total_orders,
          COUNT(DISTINCT CASE WHEN o.order_type = '2' THEN o.id END) as subscription_orders,
          COUNT(DISTINCT CASE WHEN o.order_type = '1' THEN o.id END) as regular_orders,
          COALESCE(SUM(fo.price * fo.quantity), 0) as total_revenue,
          COALESCE(SUM(fo.quantity), 0) as total_quantity
        FROM ${dateSubquery} o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        WHERE 1=1
        GROUP BY DATE_FORMAT(o.order_date, '${dateFormat}')
        ORDER BY period ASC
      `;
    }

    const [rows] = await analyticsPool.query(query, params);
    return rows.map(row => ({
      period: row.period,
      total_orders: parseInt(row.total_orders) || 0,
      subscription_orders: parseInt(row.subscription_orders) || 0,
      regular_orders: parseInt(row.regular_orders) || 0,
      total_revenue: parseFloat(row.total_revenue) || 0,
      total_quantity: parseFloat(row.total_quantity) || 0,
    }));
  }

  // Get detailed order line items for CSV export
  static async getOrderTrendDetailedExport(dateRange = { start: null, end: null }, filters = {}) {
    const { start, end } = dateRange;
    const { categoryId, subCategoryId, productId } = filters;

    let whereConditions = ["1=1"];
    let params = [];

    if (start && end) {
      whereConditions.push("o.order_date >= ? AND o.order_date <= ?");
      params.push(start, end);
    }

    if (productId) {
      whereConditions.push("f.id = ?");
      params.push(productId);
    }
    if (subCategoryId) {
      whereConditions.push("f.subcategory_id = ?");
      params.push(subCategoryId);
    }
    if (categoryId) {
      whereConditions.push("f.category_id = ?");
      params.push(categoryId);
    }

    const query = `
      SELECT
        o.id as order_id,
        u.name as customer_name,
        u.phone as customer_phone,
        COALESCE(l.name, '') as locality_name,
        COALESCE(da.complete_address, da.address, '') as delivery_address,
        COALESCE(db.name, '') as delivery_boy_name,
        f.name as product_name,
        f.unit as unit_size,
        fo.price as selling_price,
        fo.quantity,
        (fo.price * fo.quantity) as total_price
      FROM orders o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      INNER JOIN foods f ON fo.food_id = f.id
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN delivery_addresses da ON da.id = o.delivery_address_id
      LEFT JOIN localities l ON l.id = da.locality_id
      LEFT JOIN delivery_boys db ON db.user_id = o.delivery_boy_id
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY o.id DESC, f.name ASC
      LIMIT 50000
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }
}
