import pool from "../../../db/pool.js";

export class SalesSummaryModel {
  // Get summary for a specific date
  static async getSummaryByDate(date, page = 1, limit = 25) {
    try {
      // Ensure page and limit are integers
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 25;
      const offset = (pageNum - 1) * limitNum;
      
      // Get total count
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total
        FROM sales_summary ss
        JOIN products p ON ss.product_id = p.id
        WHERE ss.summary_date = ?`,
        [date],
      );
      const total = countResult[0]?.total || 0;
      
      // Get paginated rows
      // Note: Using string interpolation for LIMIT/OFFSET as MySQL prepared statements
      // have issues with these parameters. These values are safe integers we control.
      const [rows] = await pool.execute(
        `SELECT 
          ss.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name
        FROM sales_summary ss
        JOIN products p ON ss.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE ss.summary_date = ?
        ORDER BY p.id ASC
        LIMIT ${limitNum} OFFSET ${offset}`,
        [date],
      );
      
      const totalPages = Math.ceil(total / limitNum);
      
      return { 
        success: true, 
        rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages
        }
      };
    } catch (error) {
      console.error("Error fetching summary by date:", error);
      return { success: false, error: error.message };
    }
  }

  // Get summary for a date range
  static async getSummaryByDateRange(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          ss.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name
        FROM sales_summary ss
        JOIN products p ON ss.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE ss.summary_date BETWEEN ? AND ?
        ORDER BY ss.summary_date DESC, p.name ASC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching summary by date range:", error);
      return { success: false, error: error.message };
    }
  }

  // Compute and save daily summary
  static async computeDailySummary(date) {
    try {
      // Get all products
      const [products] = await pool.execute(`SELECT id FROM products WHERE is_active = 1`);

      for (const product of products) {
        const productId = product.id;

        // Get production quantity
        const [production] = await pool.execute(
          `SELECT COALESCE(SUM(quantity_produced), 0) as quantity_produced 
           FROM daily_production 
           WHERE DATE(production_date) = ? AND product_id = ?`,
          [date, productId],
        );
        const quantityProduced = parseFloat(production[0]?.quantity_produced || 0);

        // Get app sales
        const [appSales] = await pool.execute(
          `SELECT COALESCE(SUM(quantity_sold), 0) as quantity_sold 
           FROM sales_records 
           WHERE sale_date = ? AND product_id = ? AND sales_channel = 'app'`,
          [date, productId],
        );
        const quantitySoldApp = parseFloat(appSales[0]?.quantity_sold || 0);

        // Get partner sales
        const [partnerSales] = await pool.execute(
          `SELECT COALESCE(SUM(quantity_sold), 0) as quantity_sold 
           FROM sales_records 
           WHERE sale_date = ? AND product_id = ? AND sales_channel = 'partner'`,
          [date, productId],
        );
        const quantitySoldPartners = parseFloat(partnerSales[0]?.quantity_sold || 0);

        // Calculate totals
        const quantitySoldTotal = quantitySoldApp + quantitySoldPartners;

        // Get opening stock from previous day's closing stock
        const previousDate = new Date(date);
        previousDate.setDate(previousDate.getDate() - 1);
        const prevDateStr = previousDate.toISOString().split("T")[0];

        const [prevSummary] = await pool.execute(`SELECT closing_stock FROM sales_summary WHERE summary_date = ? AND product_id = ?`, [prevDateStr, productId]);
        const openingStock = parseFloat(prevSummary[0]?.closing_stock || 0);

        // Calculate closing stock: opening + produced - sold
        const closingStock = openingStock + quantityProduced - quantitySoldTotal;
        const quantityUnsold = Math.max(0, closingStock);

        // Upsert summary
        await pool.execute(
          `INSERT INTO sales_summary 
          (summary_date, product_id, quantity_produced, quantity_sold_app, quantity_sold_partners, 
           quantity_sold_total, quantity_unsold, opening_stock, closing_stock)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            quantity_produced = VALUES(quantity_produced),
            quantity_sold_app = VALUES(quantity_sold_app),
            quantity_sold_partners = VALUES(quantity_sold_partners),
            quantity_sold_total = VALUES(quantity_sold_total),
            quantity_unsold = VALUES(quantity_unsold),
            opening_stock = VALUES(opening_stock),
            closing_stock = VALUES(closing_stock)`,
          [date, productId, quantityProduced, quantitySoldApp, quantitySoldPartners, quantitySoldTotal, quantityUnsold, openingStock, closingStock],
        );
      }

      return { success: true, message: "Daily summary computed successfully" };
    } catch (error) {
      console.error("Error computing daily summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get aggregated dashboard metrics
  static async getDashboardMetrics(date) {
    try {
      const [metrics] = await pool.execute(
        `SELECT 
          COALESCE(SUM(quantity_produced), 0) as total_produced,
          COALESCE(SUM(quantity_sold_app), 0) as total_sold_app,
          COALESCE(SUM(quantity_sold_partners), 0) as total_sold_partners,
          COALESCE(SUM(quantity_sold_total), 0) as total_sold,
          COALESCE(SUM(quantity_unsold), 0) as total_unsold,
          COALESCE(SUM(opening_stock), 0) as total_opening_stock,
          COALESCE(SUM(closing_stock), 0) as total_closing_stock,
          COUNT(DISTINCT product_id) as product_count
        FROM sales_summary
        WHERE summary_date = ?`,
        [date],
      );

      // Return the first row directly as the metrics object
      return {
        success: true,
        rows: metrics[0] || {
          total_produced: 0,
          total_sold_app: 0,
          total_sold_partners: 0,
          total_sold: 0,
          total_unsold: 0,
          total_opening_stock: 0,
          total_closing_stock: 0,
          product_count: 0,
        },
      };
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      return {
        success: false,
        error: error.message,
        rows: {
          total_produced: 0,
          total_sold_app: 0,
          total_sold_partners: 0,
          total_sold: 0,
          total_unsold: 0,
          total_opening_stock: 0,
          total_closing_stock: 0,
          product_count: 0,
        },
      };
    }
  }

  // Get product-wise summary
  static async getProductWiseSummary(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          p.id as product_id,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          pc.name as category_name,
          SUM(ss.quantity_produced) as total_produced,
          SUM(ss.quantity_sold_app) as total_sold_app,
          SUM(ss.quantity_sold_partners) as total_sold_partners,
          SUM(ss.quantity_sold_total) as total_sold,
          SUM(ss.quantity_unsold) as total_unsold,
          AVG(ss.quantity_produced) as avg_produced,
          AVG(ss.quantity_sold_total) as avg_sold,
          COUNT(ss.summary_date) as days_count
        FROM sales_summary ss
        JOIN products p ON ss.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE ss.summary_date BETWEEN ? AND ?
        GROUP BY p.id, p.name, p.unit_size, p.milk_type, pc.name
        ORDER BY total_sold DESC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching product-wise summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get daily trends for charts
  static async getDailyTrends(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          summary_date,
          SUM(quantity_produced) as total_produced,
          SUM(quantity_sold_app) as total_sold_app,
          SUM(quantity_sold_partners) as total_sold_partners,
          SUM(quantity_sold_total) as total_sold,
          SUM(quantity_unsold) as total_unsold
        FROM sales_summary
        WHERE summary_date BETWEEN ? AND ?
        GROUP BY summary_date
        ORDER BY summary_date ASC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching daily trends:", error);
      return { success: false, error: error.message };
    }
  }

  // Manual adjustment
  static async applyManualAdjustment(date, productId, adjustmentAmount, reason, userId) {
    try {
      // Get current summary
      const [current] = await pool.execute(`SELECT * FROM sales_summary WHERE summary_date = ? AND product_id = ?`, [date, productId]);

      if (current.length === 0) {
        return { success: false, error: "Summary not found for this date and product" };
      }

      const quantityBefore = parseFloat(current[0].closing_stock);
      const quantityAfter = quantityBefore + parseFloat(adjustmentAmount);

      // Update summary
      await pool.execute(
        `UPDATE sales_summary 
        SET manual_adjustment = manual_adjustment + ?, 
            closing_stock = ?,
            adjustment_reason = ?
        WHERE summary_date = ? AND product_id = ?`,
        [adjustmentAmount, quantityAfter, reason, date, productId],
      );

      // Log adjustment
      await pool.execute(
        `INSERT INTO sales_adjustments 
        (adjustment_date, product_id, adjustment_type, quantity_before, quantity_after, 
         adjustment_amount, reason, adjusted_by)
        VALUES (?, ?, 'stock', ?, ?, ?, ?, ?)`,
        [date, productId, quantityBefore, quantityAfter, adjustmentAmount, reason, userId],
      );

      return { success: true, message: "Adjustment applied successfully" };
    } catch (error) {
      console.error("Error applying manual adjustment:", error);
      return { success: false, error: error.message };
    }
  }

  // Get adjustment history
  static async getAdjustmentHistory(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sa.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type
        FROM sales_adjustments sa
        JOIN products p ON sa.product_id = p.id
        WHERE sa.adjustment_date BETWEEN ? AND ?
        ORDER BY sa.created_at DESC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching adjustment history:", error);
      return { success: false, error: error.message };
    }
  }
}
