import { marketingPool } from "../db/marketingPool.js";
import { stageCopyPool } from "../db/pool.js";

class CampaignModel {
  // Create a new campaign
  static async create(campaignData) {
    const { name, type, channel, objective, target_products, start_date, end_date, target_audience, target_location, expected_reach, expected_goal_metrics, creative_assets, campaign_content, created_by } = campaignData;

    const query = `
      INSERT INTO campaigns (
        name, type, channel, objective, target_products, start_date, end_date,
        target_audience, target_location, expected_reach, expected_goal_metrics,
        creative_assets, campaign_content, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Convert undefined values to null to prevent MySQL errors
    const values = [name || null, type || null, channel || null, objective || null, target_products ? JSON.stringify(target_products) : null, start_date || null, end_date || null, target_audience || null, target_location || null, expected_reach || null, expected_goal_metrics ? JSON.stringify(expected_goal_metrics) : null, creative_assets ? JSON.stringify(creative_assets) : null, campaign_content || null, created_by || null];

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Error creating campaign:", error);
      throw error;
    }
  }

  // Get all campaigns with optional filters
  static async getAll(filters = {}) {
    let query = `
      SELECT c.*, 
             COALESCE(SUM(ce.amount), 0) as total_expenses,
             COUNT(ce.id) as expense_count
      FROM campaigns c
      LEFT JOIN campaign_expenses ce ON c.id = ce.campaign_id
    `;

    const conditions = [];
    const values = [];

    if (filters.status) {
      conditions.push("c.status = ?");
      values.push(filters.status);
    }

    if (filters.type) {
      conditions.push("c.type = ?");
      values.push(filters.type);
    }

    if (filters.channel) {
      conditions.push("c.channel = ?");
      values.push(filters.channel);
    }

    if (filters.date_from) {
      conditions.push("c.start_date >= ?");
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push("c.end_date <= ?");
      values.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY c.id ORDER BY c.created_at DESC";

    if (filters.limit) {
      query += ` LIMIT ${parseInt(filters.limit)}`;
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows.map((row) => ({
        ...row,
        target_products: JSON.parse(row.target_products || "[]"),
        expected_goal_metrics: JSON.parse(row.expected_goal_metrics || "{}"),
        creative_assets: JSON.parse(row.creative_assets || "[]"),
        campaign_content: row.campaign_content || "",
      }));
    } catch (error) {
      console.error("Error getting campaigns:", error);
      throw error;
    }
  }

  // Get campaign by ID
  static async getById(id) {
    const query = `
      SELECT c.*, 
             COALESCE(SUM(ce.amount), 0) as total_expenses,
             COUNT(ce.id) as expense_count,
             u.name as created_by_name,
             u.email as created_by_email
      FROM campaigns c
      LEFT JOIN campaign_expenses ce ON c.id = ce.campaign_id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
      GROUP BY c.id, u.name, u.email
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      if (rows.length === 0) return null;

      const campaign = rows[0];
      return {
        ...campaign,
        target_products: JSON.parse(campaign.target_products || "[]"),
        expected_goal_metrics: JSON.parse(campaign.expected_goal_metrics || "{}"),
        creative_assets: JSON.parse(campaign.creative_assets || "[]"),
      };
    } catch (error) {
      console.error("Error getting campaign by ID:", error);
      throw error;
    }
  }

  // Get performance chart data for campaign
  static async getPerformanceChartData(id) {
    try {
      // Get campaign details to extract target products and dates
      const campaign = await this.getById(id);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      // Parse target products
      let targetProducts = [];
      if (campaign.target_products) {
        const targetProductsData = typeof campaign.target_products === "string" ? JSON.parse(campaign.target_products) : campaign.target_products;
        targetProducts = targetProductsData;
      }

      if (targetProducts.length === 0) {
        return {
          labels: [],
          datasets: [],
        };
      }

      // Get all product IDs from categories, subcategories, and individual products
      const allProductIds = await this.getAllProductIdsFromTargets(targetProducts);

      if (allProductIds.length === 0) {
        return {
          labels: [],
          datasets: [],
        };
      }

      // Set date range: 15/10 to 13/11 (30 days as requested)
      const startDate = new Date("2025-10-15");
      const endDate = new Date("2025-11-13");

      // Generate date labels for the chart (DD/MM format)
      const labels = [];
      const productData = {};

      // Get product details for all product IDs
      const productDetails = await this.getProductDetailsByIds(allProductIds);

      // Initialize product data
      productDetails.forEach((product) => {
        productData[product.id] = {
          name: product.name,
          data: [],
        };
      });

      // Generate all dates for the range
      const allDates = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Use local date for both date string and labels to match database timezone
        const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        const labelStr = d.getDate().toString().padStart(2, "0") + "/" + (d.getMonth() + 1).toString().padStart(2, "0");
        labels.push(labelStr);
        allDates.push(dateStr);
      }

      // Optimized query using date range instead of individual dates
      const productPlaceholders = allProductIds.map(() => "?").join(",");

      // Highly optimized query with index hints and better performance
      const salesQuery = `
        SELECT /*+ USE_INDEX(o, idx_orders_order_date) USE_INDEX(fo, idx_food_orders_food_id) */
          DATE(o.order_date) as order_date,
          fo.food_id as product_id,
          f.name as product_name,
          SUM(fo.quantity) as daily_quantity
        FROM food_orders fo
        INNER JOIN orders o ON fo.order_id = o.id
        INNER JOIN foods f ON fo.food_id = f.id
        WHERE o.order_date >= ? 
          AND o.order_date < ?
          AND fo.food_id IN (${productPlaceholders})
        GROUP BY DATE(o.order_date), fo.food_id, f.name
        ORDER BY DATE(o.order_date), fo.food_id
        LIMIT 1000
      `;

      // Add one day to end date to be inclusive
      const endDateInclusive = new Date(endDate);
      endDateInclusive.setDate(endDateInclusive.getDate() + 1);
      const queryParams = [startDate.toISOString().split("T")[0], endDateInclusive.toISOString().split("T")[0], ...allProductIds];
      const [salesResults] = await stageCopyPool.execute(salesQuery, queryParams);

      // Process results and fill in data for each product and date
      const resultsMap = {};
      salesResults.forEach((row) => {
        // Convert order_date to YYYY-MM-DD format to match allDates
        const orderDate = new Date(row.order_date);
        // Use local date instead of UTC to match the database timezone
        const orderDateStr = orderDate.getFullYear() + "-" + String(orderDate.getMonth() + 1).padStart(2, "0") + "-" + String(orderDate.getDate()).padStart(2, "0");
        const key = `${orderDateStr}_${row.product_id}`;
        resultsMap[key] = parseInt(row.daily_quantity);
      });

      // Fill in data for each product and date
      productDetails.forEach((product) => {
        allDates.forEach((dateStr) => {
          const key = `${dateStr}_${product.id}`;
          productData[product.id].data.push(resultsMap[key] || 0);
        });
      });

      // Convert to Chart.js format
      const datasets = productDetails.map((product, index) => {
        const colors = [
          { border: "#3b82f6", background: "rgba(59, 130, 246, 0.1)" },
          { border: "#10b981", background: "rgba(16, 185, 129, 0.1)" },
          { border: "#f59e0b", background: "rgba(245, 158, 11, 0.1)" },
          { border: "#ef4444", background: "rgba(239, 68, 68, 0.1)" },
          { border: "#8b5cf6", background: "rgba(139, 92, 246, 0.1)" },
        ];

        const color = colors[index % colors.length];

        return {
          label: product.unit ? `${product.name} (${product.unit})` : product.name,
          data: productData[product.id].data,
          borderColor: color.border,
          backgroundColor: color.background,
          borderWidth: 2,
          fill: false,
          tension: 0.4,
        };
      });

      const result = {
        labels,
        datasets,
      };

      return result;
    } catch (error) {
      console.error("Error getting performance chart data:", error);
      throw error;
    }
  }

  // Update campaign
  static async update(id, updateData) {
    const allowedFields = ["name", "type", "channel", "objective", "target_products", "start_date", "end_date", "target_audience", "target_location", "expected_reach", "expected_goal_metrics", "creative_assets", "campaign_content", "status"];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        if (key === "target_products" || key === "expected_goal_metrics" || key === "creative_assets") {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);

    const query = `
      UPDATE campaigns 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating campaign:", error);
      throw error;
    }
  }

  // Delete campaign
  static async delete(id) {
    const query = "DELETE FROM campaigns WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting campaign:", error);
      throw error;
    }
  }

  // Get all product IDs from target products (categories, subcategories, and individual products)
  static async getAllProductIdsFromTargets(targetProducts) {
    const allProductIds = new Set();

    // Separate individual products from categories/subcategories
    const individualProducts = targetProducts.filter((item) => item && item.type === "product" && (item.id || item.product_id));
    const categories = [];
    const subcategories = [];

    // Handle both new format (with explicit types) and legacy format
    for (const item of targetProducts) {
      if (item && item.type === "product") {
        // Individual products
        allProductIds.add(item.id || item.product_id);
      } else if (item && item.type === "category" && item.id) {
        // Check if this is actually a subcategory by looking at the database
        const isSubcategory = await this.isSubcategory(item.id);
        if (isSubcategory) {
          subcategories.push(item);
        } else {
          categories.push(item);
        }
      } else if (item && item.type === "sub-category" && item.id) {
        subcategories.push(item);
      }
    }

    // Get products from categories (including all subcategories)
    for (const category of categories) {
      try {
        const products = await this.getProductsByCategory(category.id);
        products.forEach((product) => allProductIds.add(product.id));
      } catch (error) {
        console.error(`Error fetching products for category ${category.id}:`, error);
      }
    }

    // Get products from subcategories
    for (const subcategory of subcategories) {
      try {
        const products = await this.getProductsBySubcategory(subcategory.id);
        products.forEach((product) => allProductIds.add(product.id));
      } catch (error) {
        console.error(`Error fetching products for subcategory ${subcategory.id}:`, error);
      }
    }

    return Array.from(allProductIds);
  }

  // Check if an ID is a subcategory
  static async isSubcategory(id) {
    const query = `
      SELECT COUNT(*) as count 
      FROM sub_categories 
      WHERE id = ?
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [id]);
      return rows[0].count > 0;
    } catch (error) {
      console.error("Error checking if ID is subcategory:", error);
      return false;
    }
  }

  // Get product details by IDs
  static async getProductDetailsByIds(productIds) {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    const placeholders = productIds.map(() => "?").join(",");
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code, status
      FROM foods 
      WHERE id IN (${placeholders})
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, productIds);
      return rows;
    } catch (error) {
      console.error("Error getting product details by IDs:", error);
      throw error;
    }
  }

  // Get products by category (including all subcategories)
  static async getProductsByCategory(categoryId) {
    const query = `
      SELECT DISTINCT f.id, f.name, f.category_id, f.subcategory_id, f.price, f.discount_price, f.description, f.unit, f.sku_code, f.status
      FROM foods f
      LEFT JOIN sub_categories sc ON f.subcategory_id = sc.id
      WHERE (f.category_id = ? OR sc.category_id = ?) AND f.status = '1'
      ORDER BY f.name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [categoryId, categoryId]);
      return rows;
    } catch (error) {
      console.error("Error getting products by category:", error);
      throw error;
    }
  }

  // Get products by subcategory
  static async getProductsBySubcategory(subcategoryId) {
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code, status
      FROM foods 
      WHERE subcategory_id = ? AND status = '1'
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [subcategoryId]);
      return rows;
    } catch (error) {
      console.error("Error getting products by subcategory:", error);
      throw error;
    }
  }

  // Get campaign performance summary
  static async getPerformanceSummary(id) {
    const query = `
      SELECT 
        metric_type,
        SUM(metric_value) as total_value,
        AVG(metric_value) as avg_value,
        COUNT(*) as measurement_count,
        MAX(measurement_date) as last_measurement
      FROM campaign_performance 
      WHERE campaign_id = ?
      GROUP BY metric_type
      ORDER BY metric_type
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows;
    } catch (error) {
      console.error("Error getting campaign performance:", error);
      throw error;
    }
  }

  // Get campaign ROI
  static async getROI(id) {
    const query = `
      SELECT 
        c.id,
        c.name,
        COALESCE(SUM(ce.amount), 0) as total_spend,
        COALESCE(SUM(CASE WHEN cp.metric_type = 'revenue' THEN cp.metric_value ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN cp.metric_type = 'leads' THEN cp.metric_value ELSE 0 END), 0) as total_leads
      FROM campaigns c
      LEFT JOIN campaign_expenses ce ON c.id = ce.campaign_id
      LEFT JOIN campaign_performance cp ON c.id = cp.campaign_id
      WHERE c.id = ?
      GROUP BY c.id
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      if (rows.length === 0) return null;

      const data = rows[0];
      const roi = data.total_spend > 0 ? ((data.total_revenue - data.total_spend) / data.total_spend) * 100 : 0;

      return {
        ...data,
        roi: roi.toFixed(2),
        roi_percentage: roi,
      };
    } catch (error) {
      console.error("Error calculating campaign ROI:", error);
      throw error;
    }
  }

  // Get campaigns by status
  static async getByStatus(status) {
    const query = `
      SELECT * FROM campaigns 
      WHERE status = ? 
      ORDER BY created_at DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, [status]);
      return rows.map((row) => ({
        ...row,
        target_products: JSON.parse(row.target_products || "[]"),
        expected_goal_metrics: JSON.parse(row.expected_goal_metrics || "{}"),
        creative_assets: JSON.parse(row.creative_assets || "[]"),
        campaign_content: row.campaign_content || "",
      }));
    } catch (error) {
      console.error("Error getting campaigns by status:", error);
      throw error;
    }
  }

  // Get active campaigns
  static async getActive() {
    return this.getByStatus("active");
  }

  // Get campaign statistics
  static async getStatistics(filters = {}) {
    let query = `
      SELECT 
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_campaigns,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_campaigns,
        COUNT(CASE WHEN type = 'online' THEN 1 END) as online_campaigns,
        COUNT(CASE WHEN type = 'offline' THEN 1 END) as offline_campaigns,
        COALESCE(SUM(ce.amount), 0) as total_spend,
        COALESCE(AVG(ce.amount), 0) as avg_spend_per_campaign
      FROM campaigns c
      LEFT JOIN campaign_expenses ce ON c.id = ce.campaign_id
    `;

    const conditions = [];
    const values = [];

    if (filters.date_from) {
      conditions.push("c.start_date >= ?");
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push("c.end_date <= ?");
      values.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows[0];
    } catch (error) {
      console.error("Error getting campaign statistics:", error);
      throw error;
    }
  }

  // Get monthly campaign expenses for the last 12 months
  static async getMonthlyExpenses() {
    try {
      const currentDate = new Date();
      const monthlyExpenses = [];

      // Generate last 12 months including current month
      for (let i = 11; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        // Query expenses for the specific month
        const query = `
          SELECT 
            COALESCE(SUM(ce.amount), 0) as monthly_total
          FROM campaign_expenses ce
          WHERE ce.expense_date >= ?
            AND ce.expense_date <= ?
        `;

        const [results] = await marketingPool.execute(query, [monthStart.toISOString().split("T")[0], monthEnd.toISOString().split("T")[0]]);

        const monthlyTotal = results[0]?.monthly_total || 0;

        monthlyExpenses.push({
          month: date.toLocaleDateString("en-US", { month: "short" }) + "-" + date.getFullYear().toString().slice(-2),
          year: date.getFullYear(),
          monthNumber: date.getMonth() + 1,
          total: parseFloat(monthlyTotal),
        });
      }

      return monthlyExpenses;
    } catch (error) {
      console.error("Error getting monthly expenses:", error);
      throw error;
    }
  }
}

export default CampaignModel;
