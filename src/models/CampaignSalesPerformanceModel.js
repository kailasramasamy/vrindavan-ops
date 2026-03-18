import { opsPool } from "../db/pool.js";

class CampaignSalesPerformanceModel {
  // Get all product IDs from campaign target products
  static async getCampaignProductIds(campaignId) {
    try {
      const campaignIdInt = parseInt(campaignId);
      const [rows] = await opsPool.execute(
        `
        SELECT target_products 
        FROM campaigns 
        WHERE id = ?
      `,
        [campaignIdInt],
      );

      if (rows.length === 0) {
        return [];
      }

      const targetProducts = JSON.parse(rows[0].target_products || "[]");
      const productIds = [];

      // Extract product IDs from different target types
      targetProducts.forEach((item) => {
        if (item.type === "product") {
          productIds.push(item.id);
        } else if (item.type === "category") {
          // For categories, we'll need to get all products in that category
          // This will be handled in the sync process
        } else if (item.type === "sub-category") {
          // For subcategories, we'll need to get all products in that subcategory
          // This will be handled in the sync process
        }
      });

      return productIds;
    } catch (error) {
      console.error("Error getting campaign product IDs:", error);
      throw error;
    }
  }

  // Get all products from categories and subcategories
  static async getProductsFromTargets(campaignId) {
    try {
      const campaignIdInt = parseInt(campaignId);
      const [rows] = await opsPool.execute(
        `
        SELECT target_products 
        FROM campaigns 
        WHERE id = ?
      `,
        [campaignIdInt],
      );

      if (rows.length === 0) {
        return [];
      }

      const targetProducts = JSON.parse(rows[0].target_products || "[]");
      const allProductIds = new Set();

      for (const item of targetProducts) {
        if (item.type === "product") {
          allProductIds.add(item.id);
        } else if (item.type === "category") {
          // Get all products from category in source database
          const mysql = await import("mysql2/promise");
          const sourceConnection = await mysql.default.createConnection({
            host: process.env.APP_DB_HOST || "127.0.0.1",
            user: process.env.APP_DB_USER || "root",
            password: process.env.APP_DB_PASS || "root",
            database: process.env.APP_DB_NAME || "vrindavan_app_prod",
            port: process.env.APP_DB_PORT || 3306,
          });

          try {
            // Get products from category in source database
            const [categoryProducts] = await sourceConnection.execute(
              `
              SELECT f.id FROM foods f
              WHERE f.category_id = ? AND f.status = '1'
            `,
              [item.id],
            );
            categoryProducts.forEach((p) => allProductIds.add(p.id));
          } finally {
            await sourceConnection.end();
          }
        } else if (item.type === "sub-category") {
          // For subcategories, we need to get products from the source database
          // since subcategories are stored there, not in vrindavan_ops
          const mysql = await import("mysql2/promise");
          const sourceConnection = await mysql.default.createConnection({
            host: process.env.APP_DB_HOST || "127.0.0.1",
            user: process.env.APP_DB_USER || "root",
            password: process.env.APP_DB_PASS || "root",
            database: process.env.APP_DB_NAME || "vrindavan_app_prod",
            port: process.env.APP_DB_PORT || 3306,
          });

          try {
            // Get products from subcategory in source database
            const [subcategoryProducts] = await sourceConnection.execute(
              `
              SELECT f.id FROM foods f
              WHERE f.subcategory_id = ? AND f.status = '1'
            `,
              [item.id],
            );
            subcategoryProducts.forEach((p) => allProductIds.add(p.id));
          } finally {
            await sourceConnection.end();
          }
        }
      }

      return Array.from(allProductIds);
    } catch (error) {
      console.error("Error getting products from targets:", error);
      throw error;
    }
  }

  // Sync sales data from APP_DB to campaign_sales_performance
  static async syncSalesData(campaignId, startDate, endDate) {
    try {
      // Get all product IDs for this campaign
      const productIds = await this.getProductsFromTargets(campaignId);

      if (productIds.length === 0) {
        return { message: "No products found for this campaign", synced: 0 };
      }

      // Connect to the source database
      const mysql = await import("mysql2/promise");
      const sourceConnection = await mysql.default.createConnection({
        host: process.env.APP_DB_HOST || "127.0.0.1",
        user: process.env.APP_DB_USER || "root",
        password: process.env.APP_DB_PASS || "root",
        database: process.env.APP_DB_NAME || "vrindavan_app_prod",
        port: process.env.APP_DB_PORT || 3306,
      });

      let syncedCount = 0;

      // Get sales data for each day in the range
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);

      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split("T")[0];

        // Query sales data from source database
        const [salesData] = await sourceConnection.execute(
          `
        SELECT 
          fo.food_id as product_id,
          SUM(fo.quantity) as units_sold,
          SUM(fo.quantity * fo.price) as revenue
        FROM orders o
        JOIN food_orders fo ON o.id = fo.order_id
        JOIN foods f ON fo.food_id = f.id
        WHERE DATE(o.order_date) = ?
        AND fo.food_id IN (${productIds.map(() => "?").join(",")})
        AND o.active = 1
        GROUP BY fo.food_id
      `,
          [dateStr, ...productIds],
        );

        // Insert/update data in campaign_sales_performance
        for (const sale of salesData) {
          await opsPool.execute(
            `
            INSERT INTO campaign_sales_performance 
            (campaign_id, product_id, sales_date, units_sold, revenue)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            units_sold = VALUES(units_sold),
            revenue = VALUES(revenue),
            updated_at = CURRENT_TIMESTAMP
          `,
            [campaignId, sale.product_id, dateStr, sale.units_sold, sale.revenue],
          );

          syncedCount++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      await sourceConnection.end();
      return { message: "Sales data synced successfully", synced: syncedCount };
    } catch (error) {
      console.error("Error syncing sales data:", error);
      throw error;
    }
  }

  // Get performance metrics for dashboard
  static async getPerformanceMetrics(campaignId = null) {
    try {
      let whereClause = "";
      let params = [];

      if (campaignId) {
        whereClause = "WHERE csp.campaign_id = ?";
        params = [campaignId];
      }

      const [rows] = await opsPool.execute(
        `
        SELECT 
          csp.campaign_id,
          c.name as campaign_name,
          csp.sales_date,
          SUM(csp.units_sold) as total_units_sold,
          SUM(csp.revenue) as total_revenue,
          COUNT(DISTINCT csp.product_id) as products_count
        FROM campaign_sales_performance csp
        JOIN campaigns c ON csp.campaign_id = c.id
        ${whereClause}
        GROUP BY csp.campaign_id, csp.sales_date
        ORDER BY csp.sales_date DESC
        LIMIT 30
      `,
        params,
      );

      return rows;
    } catch (error) {
      console.error("Error getting performance metrics:", error);
      throw error;
    }
  }

  // Get campaign performance summary
  static async getCampaignPerformanceSummary(campaignId) {
    try {
      const campaignIdInt = parseInt(campaignId);
      const [rows] = await opsPool.execute(
        `
        SELECT 
          c.name as campaign_name,
          c.start_date,
          c.end_date,
          COUNT(DISTINCT csp.sales_date) as days_tracked,
          SUM(csp.units_sold) as total_units_sold,
          SUM(csp.revenue) as total_revenue,
          AVG(csp.units_sold) as avg_daily_units,
          AVG(csp.revenue) as avg_daily_revenue,
          COUNT(DISTINCT csp.product_id) as products_tracked
        FROM campaigns c
        LEFT JOIN campaign_sales_performance csp ON c.id = csp.campaign_id
        WHERE c.id = ?
        GROUP BY c.id, c.name, c.start_date, c.end_date
      `,
        [campaignIdInt],
      );

      return rows[0] || null;
    } catch (error) {
      console.error("Error getting campaign performance summary:", error);
      throw error;
    }
  }

  // Get daily performance data for a specific campaign
  static async getDailyPerformance(campaignId, days = 30) {
    try {
      const limitDays = parseInt(days) || 30;
      const campaignIdInt = parseInt(campaignId);
      const [rows] = await opsPool.execute(
        `
        SELECT 
          csp.sales_date,
          SUM(csp.units_sold) as units_sold,
          SUM(csp.revenue) as revenue,
          COUNT(DISTINCT csp.product_id) as products_sold
        FROM campaign_sales_performance csp
        WHERE csp.campaign_id = ?
        GROUP BY csp.sales_date
        ORDER BY csp.sales_date DESC
        LIMIT ${limitDays}
        `,
        [campaignIdInt],
      );

      return rows;
    } catch (error) {
      console.error("Error getting daily performance:", error);
      throw error;
    }
  }
}

export default CampaignSalesPerformanceModel;
