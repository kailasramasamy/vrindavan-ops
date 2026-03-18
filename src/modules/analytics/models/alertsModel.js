// Alerts Model - Database queries for analytics alerts
import { analyticsPool } from '../../../db/pool.js';

export class AlertsModel {
  // Get order dip alert (compares today's orders with 7-day moving average)
  static async getOrderDipAlert() {
    const query = `
      WITH daily_orders AS (
        SELECT 
          DATE(created_at) as order_date,
          COUNT(DISTINCT id) as order_count
        FROM orders
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        AND order_status_id = (SELECT id FROM order_statuses WHERE status = 'Delivered')
        GROUP BY DATE(created_at)
        ORDER BY order_date DESC
      ),
      moving_avg AS (
        SELECT 
          order_date,
          order_count,
          AVG(order_count) OVER (
            ORDER BY order_date 
            ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING
          ) as moving_avg_7d
        FROM daily_orders
      )
      SELECT 
        order_date,
        order_count,
        moving_avg_7d,
        CASE 
          WHEN moving_avg_7d > 0 THEN ((order_count - moving_avg_7d) / moving_avg_7d) * 100
          ELSE 0
        END as percentage_change,
        CASE 
          WHEN order_count < moving_avg_7d * 0.7 THEN 'CRITICAL'
          WHEN order_count < moving_avg_7d * 0.85 THEN 'WARNING'
          ELSE 'OK'
        END as alert_level
      FROM moving_avg
      WHERE order_date = CURDATE()
      AND moving_avg_7d IS NOT NULL
    `;

    const [rows] = await analyticsPool.query(query);
    return rows[0] || null;
  }

  // Get order spike alert
  static async getOrderSpikeAlert() {
    const query = `
      WITH daily_orders AS (
        SELECT 
          DATE(created_at) as order_date,
          COUNT(DISTINCT id) as order_count
        FROM orders
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        AND order_status_id = (SELECT id FROM order_statuses WHERE status = 'Delivered')
        GROUP BY DATE(created_at)
        ORDER BY order_date DESC
      ),
      moving_avg AS (
        SELECT 
          order_date,
          order_count,
          AVG(order_count) OVER (
            ORDER BY order_date 
            ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING
          ) as moving_avg_7d
        FROM daily_orders
      )
      SELECT 
        order_date,
        order_count,
        moving_avg_7d,
        CASE 
          WHEN moving_avg_7d > 0 THEN ((order_count - moving_avg_7d) / moving_avg_7d) * 100
          ELSE 0
        END as percentage_change,
        CASE 
          WHEN order_count > moving_avg_7d * 1.5 THEN 'CRITICAL'
          WHEN order_count > moving_avg_7d * 1.3 THEN 'WARNING'
          ELSE 'OK'
        END as alert_level
      FROM moving_avg
      WHERE order_date = CURDATE()
      AND moving_avg_7d IS NOT NULL
    `;

    const [rows] = await analyticsPool.query(query);
    return rows[0] || null;
  }

  // Get low wallet balance alert
  static async getLowBalanceAlert(threshold = 100, limit = 50) {
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        COALESCE(wb.balance, 0) as balance,
        u.created_at as customer_since,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) as last_order_date,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id 
         AND o.order_status_id = (SELECT id FROM order_statuses WHERE status = 'Delivered')) as total_orders,
        CASE 
          WHEN COALESCE(wb.balance, 0) = 0 THEN 'CRITICAL'
          WHEN COALESCE(wb.balance, 0) < 50 THEN 'HIGH'
          WHEN COALESCE(wb.balance, 0) < 100 THEN 'MEDIUM'
          ELSE 'LOW'
        END as alert_level
      FROM users u
      LEFT JOIN wallet_balances wb ON u.id = wb.user_id
      WHERE COALESCE(wb.balance, 0) < ?
      ORDER BY COALESCE(wb.balance, 0) ASC, u.created_at DESC
      LIMIT ?
    `;

    const [rows] = await analyticsPool.query(query, [threshold, limit]);
    return rows;
  }

  // Get refund spike alert
  static async getRefundSpikeAlert(hours = 24) {
    const query = `
      WITH recent_refunds AS (
        SELECT 
          DATE(created_at) as refund_date,
          COUNT(DISTINCT id) as refund_count
        FROM orders
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND order_status_id = (SELECT id FROM order_statuses WHERE status = 'Cancelled')
        GROUP BY DATE(created_at)
      ),
      historical_avg AS (
        SELECT 
          AVG(daily_refunds.refund_count) as avg_daily_refunds
        FROM (
          SELECT 
            DATE(created_at) as refund_date,
            COUNT(DISTINCT id) as refund_count
          FROM orders
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          AND created_at < CURDATE()
          AND order_status_id = (SELECT id FROM order_statuses WHERE status = 'Cancelled')
          GROUP BY DATE(created_at)
        ) daily_refunds
      )
      SELECT 
        refund_date,
        refund_count,
        avg_daily_refunds,
        CASE 
          WHEN avg_daily_refunds > 0 THEN (refund_count / avg_daily_refunds) * 100
          ELSE 0
        END as percentage_of_avg,
        CASE 
          WHEN refund_count > avg_daily_refunds * 2 THEN 'CRITICAL'
          WHEN refund_count > avg_daily_refunds * 1.5 THEN 'WARNING'
          ELSE 'OK'
        END as alert_level
      FROM recent_refunds, historical_avg
      WHERE refund_date = CURDATE()
    `;

    const [rows] = await analyticsPool.query(query, [hours]);
    return rows[0] || null;
  }

  // Get new customer acquisition alert
  static async getNewCustomerAlert() {
    const query = `
      WITH daily_new_customers AS (
        SELECT 
          DATE(created_at) as registration_date,
          COUNT(DISTINCT id) as new_customers
        FROM users
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        GROUP BY DATE(created_at)
        ORDER BY registration_date DESC
      ),
      moving_avg AS (
        SELECT 
          registration_date,
          new_customers,
          AVG(new_customers) OVER (
            ORDER BY registration_date 
            ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING
          ) as moving_avg_7d
        FROM daily_new_customers
      )
      SELECT 
        registration_date,
        new_customers,
        moving_avg_7d,
        CASE 
          WHEN moving_avg_7d > 0 THEN ((new_customers - moving_avg_7d) / moving_avg_7d) * 100
          ELSE 0
        END as percentage_change,
        CASE 
          WHEN new_customers < moving_avg_7d * 0.5 THEN 'CRITICAL'
          WHEN new_customers < moving_avg_7d * 0.7 THEN 'WARNING'
          ELSE 'OK'
        END as alert_level
      FROM moving_avg
      WHERE registration_date = CURDATE()
      AND moving_avg_7d IS NOT NULL
    `;

    const [rows] = await analyticsPool.query(query);
    return rows[0] || null;
  }

  // Get revenue dip alert
  static async getRevenueDipAlert() {
    const query = `
      WITH daily_revenue AS (
        SELECT 
          DATE(o.created_at) as revenue_date,
          COALESCE(SUM(fo.price * fo.quantity), 0) as daily_revenue
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 8 DAY)
        AND o.order_status_id = (SELECT id FROM order_statuses WHERE status = 'Delivered')
        GROUP BY DATE(o.created_at)
        ORDER BY revenue_date DESC
      ),
      moving_avg AS (
        SELECT 
          revenue_date,
          daily_revenue,
          AVG(daily_revenue) OVER (
            ORDER BY revenue_date 
            ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING
          ) as moving_avg_7d
        FROM daily_revenue
      )
      SELECT 
        revenue_date,
        daily_revenue,
        moving_avg_7d,
        CASE 
          WHEN moving_avg_7d > 0 THEN ((daily_revenue - moving_avg_7d) / moving_avg_7d) * 100
          ELSE 0
        END as percentage_change,
        CASE 
          WHEN daily_revenue < moving_avg_7d * 0.7 THEN 'CRITICAL'
          WHEN daily_revenue < moving_avg_7d * 0.85 THEN 'WARNING'
          ELSE 'OK'
        END as alert_level
      FROM moving_avg
      WHERE revenue_date = CURDATE()
      AND moving_avg_7d IS NOT NULL
    `;

    const [rows] = await analyticsPool.query(query);
    return rows[0] || null;
  }

  // Get all active alerts
  static async getAllAlerts() {
    const [
      orderDip,
      orderSpike,
      lowBalance,
      refundSpike,
      newCustomerDip,
      revenueDip
    ] = await Promise.all([
      AlertsModel.getOrderDipAlert(),
      AlertsModel.getOrderSpikeAlert(),
      AlertsModel.getLowBalanceAlert(100, 10),
      AlertsModel.getRefundSpikeAlert(24),
      AlertsModel.getNewCustomerAlert(),
      AlertsModel.getRevenueDipAlert()
    ]);

    const alerts = [];

    // Order Dip Alert
    if (orderDip && ['CRITICAL', 'WARNING'].includes(orderDip.alert_level)) {
      alerts.push({
        id: 'order_dip',
        type: 'orders',
        level: orderDip.alert_level,
        title: 'Order Volume Dip Detected',
        message: `Today's orders (${orderDip.order_count}) are ${Math.abs(orderDip.percentage_change).toFixed(1)}% below the 7-day average (${orderDip.moving_avg_7d.toFixed(0)})`,
        timestamp: new Date(),
        data: orderDip
      });
    }

    // Order Spike Alert
    if (orderSpike && ['CRITICAL', 'WARNING'].includes(orderSpike.alert_level)) {
      alerts.push({
        id: 'order_spike',
        type: 'orders',
        level: orderSpike.alert_level,
        title: 'Order Volume Spike Detected',
        message: `Today's orders (${orderSpike.order_count}) are ${orderSpike.percentage_change.toFixed(1)}% above the 7-day average (${orderSpike.moving_avg_7d.toFixed(0)})`,
        timestamp: new Date(),
        data: orderSpike
      });
    }

    // Low Balance Alert
    if (lowBalance && lowBalance.length > 0) {
      const criticalCount = lowBalance.filter(c => c.alert_level === 'CRITICAL').length;
      const highCount = lowBalance.filter(c => c.alert_level === 'HIGH').length;
      
      alerts.push({
        id: 'low_balance',
        type: 'customers',
        level: criticalCount > 0 ? 'CRITICAL' : highCount > 5 ? 'WARNING' : 'INFO',
        title: 'Low Wallet Balance Alert',
        message: `${criticalCount} customers have ₹0 balance, ${highCount} customers have < ₹50 balance`,
        timestamp: new Date(),
        data: { customers: lowBalance, count: lowBalance.length }
      });
    }

    // Refund Spike Alert
    if (refundSpike && ['CRITICAL', 'WARNING'].includes(refundSpike.alert_level)) {
      alerts.push({
        id: 'refund_spike',
        type: 'revenue',
        level: refundSpike.alert_level,
        title: 'Refund Volume Spike',
        message: `Today's refunds (${refundSpike.refund_count}) are ${refundSpike.percentage_of_avg.toFixed(1)}% of the 30-day average`,
        timestamp: new Date(),
        data: refundSpike
      });
    }

    // New Customer Dip Alert
    if (newCustomerDip && ['CRITICAL', 'WARNING'].includes(newCustomerDip.alert_level)) {
      alerts.push({
        id: 'new_customer_dip',
        type: 'customers',
        level: newCustomerDip.alert_level,
        title: 'New Customer Acquisition Dip',
        message: `Today's new customers (${newCustomerDip.new_customers}) are ${Math.abs(newCustomerDip.percentage_change).toFixed(1)}% below the 7-day average`,
        timestamp: new Date(),
        data: newCustomerDip
      });
    }

    // Revenue Dip Alert
    if (revenueDip && ['CRITICAL', 'WARNING'].includes(revenueDip.alert_level)) {
      alerts.push({
        id: 'revenue_dip',
        type: 'revenue',
        level: revenueDip.alert_level,
        title: 'Revenue Dip Detected',
        message: `Today's revenue (₹${revenueDip.daily_revenue.toLocaleString()}) is ${Math.abs(revenueDip.percentage_change).toFixed(1)}% below the 7-day average`,
        timestamp: new Date(),
        data: revenueDip
      });
    }

    return alerts.sort((a, b) => {
      const levelOrder = { 'CRITICAL': 3, 'WARNING': 2, 'INFO': 1 };
      return levelOrder[b.level] - levelOrder[a.level];
    });
  }

  // Get alert configuration
  static async getAlertConfig() {
    // This would typically come from a database table
    // For now, return default configuration
    return {
      orderDip: {
        enabled: true,
        threshold: 0.15, // 15% below average triggers warning
        criticalThreshold: 0.3 // 30% below average triggers critical
      },
      lowBalance: {
        enabled: true,
        warningThreshold: 100,
        criticalThreshold: 50
      },
      refundSpike: {
        enabled: true,
        warningThreshold: 1.5, // 150% of average
        criticalThreshold: 2.0 // 200% of average
      },
      newCustomerDip: {
        enabled: true,
        warningThreshold: 0.3,
        criticalThreshold: 0.5
      }
    };
  }
}
