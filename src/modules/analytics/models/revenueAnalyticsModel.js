// Revenue Analytics Model - Database queries for revenue analytics
import { analyticsPool } from '../../../db/pool.js';

export class RevenueAnalyticsModel {
  // Get revenue overview metrics
  static async getRevenueMetrics(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    const query = `
      SELECT 
        -- Gross Revenue (before taxes and fees)
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as gross_revenue,
        
        -- Net Revenue (after taxes and fees)
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as net_revenue,
        
        -- Tax and Fee breakdown
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) as total_tax,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as total_delivery_fees,
        
        -- Order metrics
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        
        -- Average values
        CASE 
          WHEN COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) > 0 
          THEN COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) / 
               COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END)
          ELSE 0 
        END as avg_order_value,
        
        -- Discount analysis (if discount_price exists)
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' AND f.discount_price IS NOT NULL AND f.discount_price > 0 
          THEN (f.price - f.discount_price) * fo.quantity END), 0) as total_discounts,
        
        -- Refund analysis (cancelled orders)
        COALESCE(SUM(CASE WHEN os.status = 'Cancelled' THEN fo.price * fo.quantity END), 0) as lost_revenue
        
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      LEFT JOIN foods f ON fo.food_id = f.id
      ${dateFilter}
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows[0];
  }

  // Get revenue trend data
  static async getRevenueTrend(groupBy = 'day', dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    let dateFormat = '';
    switch (groupBy) {
      case 'hour':
        dateFormat = '%Y-%m-%d %H:00:00';
        break;
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      case 'month':
        dateFormat = '%Y-%m';
        break;
      default:
        dateFormat = '%Y-%m-%d';
    }

    const query = `
      SELECT 
        DATE_FORMAT(o.order_date, '${dateFormat}') as period,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as net_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) as tax_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as delivery_fees,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      ${dateFilter}
      GROUP BY DATE_FORMAT(o.order_date, '${dateFormat}')
      ORDER BY period ASC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get revenue by product
  static async getRevenueByProduct(limit = 10, dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [limit];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end, limit];
    }

    const query = `
      SELECT 
        f.id,
        f.name as product_name,
        f.price as base_price,
        f.discount_price,
        c.name as category_name,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.quantity END), 0) as total_quantity,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN fo.order_id END) as order_count,
        COALESCE(AVG(CASE WHEN os.status = 'Delivered' THEN fo.price END), 0) as avg_unit_price,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' AND f.discount_price IS NOT NULL AND f.discount_price > 0 
          THEN (f.price - f.discount_price) * fo.quantity END), 0) as total_discounts
      FROM foods f
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN categories c ON f.category_id = c.id
      WHERE f.id IS NOT NULL ${dateFilter}
      GROUP BY f.id, f.name, f.price, f.discount_price, c.name
      ORDER BY gross_revenue DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get revenue by channel
  static async getRevenueByChannel(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    const query = `
      SELECT 
        CASE 
          WHEN o.order_type = '1' THEN 'Regular Orders'
          WHEN o.order_type = '2' THEN 'Subscription Orders'
          ELSE 'Other'
        END as channel,
        o.order_type,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) + 
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as net_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.tax END), 0) as tax_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN o.delivery_fee END), 0) as delivery_fees,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN o.id END) as completed_orders,
        COUNT(DISTINCT o.user_id) as unique_customers,
        COALESCE(AVG(CASE WHEN os.status = 'Delivered' THEN fo.total_line_value END), 0) as avg_order_value
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN (
        SELECT order_id, SUM(price * quantity) as total_line_value
        FROM food_orders
        GROUP BY order_id
      ) fo ON o.id = fo.order_id
      ${dateFilter}
      GROUP BY o.order_type
      ORDER BY gross_revenue DESC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get revenue by category
  static async getRevenueByCategory(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    const query = `
      SELECT 
        c.id,
        c.name as category_name,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.price * fo.quantity END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN os.status = 'Delivered' THEN fo.quantity END), 0) as total_quantity,
        COUNT(DISTINCT CASE WHEN os.status = 'Delivered' THEN fo.order_id END) as order_count,
        COUNT(DISTINCT f.id) as product_count,
        COALESCE(AVG(CASE WHEN os.status = 'Delivered' THEN fo.price END), 0) as avg_unit_price
      FROM categories c
      LEFT JOIN foods f ON c.id = f.category_id
      LEFT JOIN food_orders fo ON f.id = fo.food_id
      LEFT JOIN orders o ON fo.order_id = o.id
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      ${dateFilter}
      GROUP BY c.id, c.name
      ORDER BY gross_revenue DESC
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows;
  }

  // Get discount analysis
  static async getDiscountAnalysis(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    const query = `
      SELECT 
        COUNT(DISTINCT CASE WHEN f.discount_price IS NOT NULL AND f.discount_price > 0 AND os.status = 'Delivered' 
          THEN fo.order_id END) as discounted_orders,
        COALESCE(SUM(CASE WHEN f.discount_price IS NOT NULL AND f.discount_price > 0 AND os.status = 'Delivered' 
          THEN (f.price - f.discount_price) * fo.quantity END), 0) as total_discounts,
        COALESCE(AVG(CASE WHEN f.discount_price IS NOT NULL AND f.discount_price > 0 AND os.status = 'Delivered' 
          THEN ((f.price - f.discount_price) / f.price) * 100 END), 0) as avg_discount_percentage,
        COUNT(DISTINCT CASE WHEN f.discount_price IS NOT NULL AND f.discount_price > 0 AND os.status = 'Delivered' 
          THEN f.id END) as discounted_products
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN food_orders fo ON o.id = fo.order_id
      LEFT JOIN foods f ON fo.food_id = f.id
      ${dateFilter}
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows[0];
  }

  // Get refund analysis
  static async getRefundAnalysis(dateRange = { start: null, end: null }) {
    const { start, end } = dateRange;
    let dateFilter = '';
    let params = [];

    if (start && end) {
      dateFilter = 'AND o.order_date >= ? AND o.order_date <= ?';
      params = [start, end];
    }

    const query = `
      SELECT 
        COUNT(DISTINCT CASE WHEN os.status = 'Cancelled' THEN o.id END) as cancelled_orders,
        COALESCE(SUM(CASE WHEN os.status = 'Cancelled' THEN fo.price * fo.quantity END), 0) as lost_revenue,
        COALESCE(AVG(CASE WHEN os.status = 'Cancelled' THEN fo.total_line_value END), 0) as avg_cancelled_order_value,
        COUNT(DISTINCT CASE WHEN os.status = 'Cancelled' THEN o.user_id END) as affected_customers
      FROM orders o
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN (
        SELECT order_id, SUM(price * quantity) as total_line_value
        FROM food_orders
        GROUP BY order_id
      ) fo ON o.id = fo.order_id
      ${dateFilter}
    `;

    const [rows] = await analyticsPool.query(query, params);
    return rows[0];
  }

  // Get detailed revenue list with pagination
  static async getRevenueList(page = 1, limit = 25, filters = {}) {
    const offset = (page - 1) * limit;
    let whereConditions = [];
    let params = [];

    // Date range filter
    if (filters.start && filters.end) {
      whereConditions.push('o.order_date >= ? AND o.order_date <= ?');
      params.push(filters.start, filters.end);
    }

    // Status filter (only delivered orders for revenue)
    whereConditions.push('os.status = "Delivered"');

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        o.id as order_id,
        o.order_date,
        u.name as customer_name,
        u.email as customer_email,
        fo.total_line_value as gross_revenue,
        o.tax,
        o.delivery_fee,
        (fo.total_line_value + COALESCE(o.tax, 0) + COALESCE(o.delivery_fee, 0)) as net_revenue,
        fo.item_count,
        CASE 
          WHEN o.order_type = '1' THEN 'Regular Orders'
          WHEN o.order_type = '2' THEN 'Subscription Orders'
          ELSE 'Other'
        END as channel
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
}
