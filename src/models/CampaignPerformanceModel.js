import { marketingPool, salesDataPool } from "../db/marketingPool.js";

class CampaignPerformanceModel {
  // Create a new performance record
  static async create(performanceData) {
    const { campaign_id, metric_type, metric_value, metric_unit, measurement_date, source, notes, created_by } = performanceData;

    const query = `
      INSERT INTO campaign_performance (
        campaign_id, metric_type, metric_value, metric_unit, 
        measurement_date, source, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [campaign_id, metric_type, metric_value, metric_unit, measurement_date, source, notes, created_by];

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Error creating performance record:", error);
      throw error;
    }
  }

  // Get performance data for a campaign
  static async getByCampaignId(campaignId, filters = {}) {
    let query = `
      SELECT cp.*, u.name as created_by_name, c.name as campaign_name
      FROM campaign_performance cp
      LEFT JOIN users u ON cp.created_by = u.id
      LEFT JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.campaign_id = ?
    `;

    const values = [campaignId];

    if (filters.metric_type) {
      query += " AND cp.metric_type = ?";
      values.push(filters.metric_type);
    }

    if (filters.date_from) {
      query += " AND cp.measurement_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND cp.measurement_date <= ?";
      values.push(filters.date_to);
    }

    query += " ORDER BY cp.measurement_date DESC, cp.created_at DESC";

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting performance by campaign ID:", error);
      throw error;
    }
  }

  // Get performance record by ID
  static async getById(id) {
    const query = `
      SELECT cp.*, u.name as created_by_name, c.name as campaign_name
      FROM campaign_performance cp
      LEFT JOIN users u ON cp.created_by = u.id
      LEFT JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error("Error getting performance by ID:", error);
      throw error;
    }
  }

  // Update performance record
  static async update(id, updateData) {
    const allowedFields = ["metric_type", "metric_value", "metric_unit", "measurement_date", "source", "notes"];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);

    const query = `
      UPDATE campaign_performance 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating performance record:", error);
      throw error;
    }
  }

  // Delete performance record
  static async delete(id) {
    const query = "DELETE FROM campaign_performance WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting performance record:", error);
      throw error;
    }
  }

  // Get performance summary for a campaign
  static async getPerformanceSummary(campaignId) {
    const query = `
      SELECT 
        metric_type,
        SUM(metric_value) as total_value,
        AVG(metric_value) as avg_value,
        MIN(metric_value) as min_value,
        MAX(metric_value) as max_value,
        COUNT(*) as measurement_count,
        MIN(measurement_date) as first_measurement,
        MAX(measurement_date) as last_measurement
      FROM campaign_performance 
      WHERE campaign_id = ?
      GROUP BY metric_type
      ORDER BY metric_type
    `;

    try {
      const [rows] = await marketingPool.execute(query, [campaignId]);
      return rows;
    } catch (error) {
      console.error("Error getting performance summary:", error);
      throw error;
    }
  }

  // Get performance analytics across all campaigns
  static async getPerformanceAnalytics(filters = {}) {
    let query = `
      SELECT 
        c.name as campaign_name,
        c.type as campaign_type,
        c.channel,
        cp.metric_type,
        SUM(cp.metric_value) as total_value,
        AVG(cp.metric_value) as avg_value,
        COUNT(*) as measurement_count,
        MIN(cp.measurement_date) as first_measurement,
        MAX(cp.measurement_date) as last_measurement
      FROM campaign_performance cp
      LEFT JOIN campaigns c ON cp.campaign_id = c.id
      WHERE 1=1
    `;

    const values = [];

    if (filters.date_from) {
      query += " AND cp.measurement_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND cp.measurement_date <= ?";
      values.push(filters.date_to);
    }

    if (filters.campaign_type) {
      query += " AND c.type = ?";
      values.push(filters.campaign_type);
    }

    if (filters.channel) {
      query += " AND c.channel = ?";
      values.push(filters.channel);
    }

    query += `
      GROUP BY c.id, cp.metric_type
      ORDER BY total_value DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting performance analytics:", error);
      throw error;
    }
  }

  // Get ROI data for campaigns
  static async getROIData(filters = {}) {
    let query = `
      SELECT 
        c.id,
        c.name,
        c.type,
        c.channel,
        COALESCE(SUM(ce.amount), 0) as total_spend,
        COALESCE(SUM(CASE WHEN cp.metric_type = 'revenue' THEN cp.metric_value ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN cp.metric_type = 'leads' THEN cp.metric_value ELSE 0 END), 0) as total_leads,
        COALESCE(SUM(CASE WHEN cp.metric_type = 'sales_conversion' THEN cp.metric_value ELSE 0 END), 0) as total_conversions
      FROM campaigns c
      LEFT JOIN campaign_expenses ce ON c.id = ce.campaign_id
      LEFT JOIN campaign_performance cp ON c.id = cp.campaign_id
      WHERE 1=1
    `;

    const values = [];

    if (filters.date_from) {
      query += " AND c.start_date >= ?";
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      query += " AND c.end_date <= ?";
      values.push(filters.date_to);
    }

    query += `
      GROUP BY c.id
      HAVING total_spend > 0 OR total_revenue > 0
      ORDER BY total_revenue DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows.map((row) => {
        const roi = row.total_spend > 0 ? ((row.total_revenue - row.total_spend) / row.total_spend) * 100 : 0;
        return {
          ...row,
          roi: roi.toFixed(2),
          roi_percentage: roi,
        };
      });
    } catch (error) {
      console.error("Error getting ROI data:", error);
      throw error;
    }
  }

  // Get sales data from APP_DB for comparison
  static async getSalesDataForCampaign(campaignId, dateRange) {
    const { start_date, end_date } = dateRange;

    const query = `
      SELECT 
        DATE(order_date) as date,
        COUNT(*) as order_count,
        SUM(total_amount) as total_revenue,
        COUNT(DISTINCT customer_id) as unique_customers
      FROM orders 
      WHERE order_date >= ? AND order_date <= ?
        AND order_status = 'delivered'
      GROUP BY DATE(order_date)
      ORDER BY date
    `;

    try {
      const [rows] = await salesDataPool.execute(query, [start_date, end_date]);
      return rows;
    } catch (error) {
      console.error("Error getting sales data:", error);
      throw error;
    }
  }

  // Get product-wise sales data for campaign analysis
  static async getProductSalesData(campaignId, dateRange) {
    const { start_date, end_date } = dateRange;

    const query = `
      SELECT 
        f.name as product_name,
        SUM(fo.quantity) as total_quantity,
        SUM(fo.quantity * fo.price) as total_revenue,
        COUNT(DISTINCT fo.order_id) as order_count
      FROM food_orders fo
      JOIN foods f ON fo.food_id = f.id
      JOIN orders o ON fo.order_id = o.id
      WHERE o.order_date >= ? AND o.order_date <= ?
        AND o.order_status = 'delivered'
      GROUP BY f.id, f.name
      ORDER BY total_revenue DESC
    `;

    try {
      const [rows] = await salesDataPool.execute(query, [start_date, end_date]);
      return rows;
    } catch (error) {
      console.error("Error getting product sales data:", error);
      throw error;
    }
  }

  // Calculate campaign effectiveness metrics
  static async calculateEffectivenessMetrics(campaignId) {
    try {
      const campaign = await require("./CampaignModel").getById(campaignId);
      if (!campaign) throw new Error("Campaign not found");

      const performance = await this.getPerformanceSummary(campaignId);
      const salesData = await this.getSalesDataForCampaign(campaignId, {
        start_date: campaign.start_date,
        end_date: campaign.end_date,
      });

      const metrics = {
        total_revenue: 0,
        total_leads: 0,
        total_conversions: 0,
        total_reach: 0,
        total_impressions: 0,
        total_clicks: 0,
      };

      performance.forEach((metric) => {
        switch (metric.metric_type) {
          case "revenue":
            metrics.total_revenue = metric.total_value;
            break;
          case "leads":
            metrics.total_leads = metric.total_value;
            break;
          case "sales_conversion":
            metrics.total_conversions = metric.total_value;
            break;
          case "reach":
            metrics.total_reach = metric.total_value;
            break;
          case "impressions":
            metrics.total_impressions = metric.total_value;
            break;
          case "clicks":
            metrics.total_clicks = metric.total_value;
            break;
        }
      });

      // Calculate additional metrics
      const totalOrders = salesData.reduce((sum, day) => sum + day.order_count, 0);
      const totalSalesRevenue = salesData.reduce((sum, day) => sum + day.total_revenue, 0);
      const uniqueCustomers = new Set(salesData.map((day) => day.unique_customers)).size;

      return {
        ...metrics,
        total_orders: totalOrders,
        total_sales_revenue: totalSalesRevenue,
        unique_customers: uniqueCustomers,
        conversion_rate: metrics.total_leads > 0 ? (metrics.total_conversions / metrics.total_leads) * 100 : 0,
        ctr: metrics.total_impressions > 0 ? (metrics.total_clicks / metrics.total_impressions) * 100 : 0,
        cost_per_lead: metrics.total_leads > 0 ? campaign.total_expenses / metrics.total_leads : 0,
        cost_per_conversion: metrics.total_conversions > 0 ? campaign.total_expenses / metrics.total_conversions : 0,
      };
    } catch (error) {
      console.error("Error calculating effectiveness metrics:", error);
      throw error;
    }
  }
}

export default CampaignPerformanceModel;
