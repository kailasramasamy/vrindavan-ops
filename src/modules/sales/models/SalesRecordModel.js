import pool from "../../../db/pool.js";

export class SalesRecordModel {
  // Get sales records for a date
  static async getSalesByDate(date) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sr.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name,
          sp.partner_name,
          sp.partner_code
        FROM sales_records sr
        JOIN products p ON sr.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN sales_partners sp ON sr.partner_id = sp.id
        WHERE sr.sale_date = ?
        ORDER BY p.name ASC, sp.partner_name ASC`,
        [date],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales by date:", error);
      return { success: false, error: error.message };
    }
  }

  // Get sales records for a date range
  static async getSalesByDateRange(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sr.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          p.image_url,
          pc.name as category_name,
          sp.partner_name,
          sp.partner_code
        FROM sales_records sr
        JOIN products p ON sr.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN sales_partners sp ON sr.partner_id = sp.id
        WHERE sr.sale_date BETWEEN ? AND ?
        ORDER BY sr.sale_date DESC, p.name ASC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales by date range:", error);
      return { success: false, error: error.message };
    }
  }

  // Get sales by product
  static async getSalesByProduct(productId, startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sr.*,
          sp.partner_name,
          sp.partner_code
        FROM sales_records sr
        LEFT JOIN sales_partners sp ON sr.partner_id = sp.id
        WHERE sr.product_id = ? AND sr.sale_date BETWEEN ? AND ?
        ORDER BY sr.sale_date DESC`,
        [productId, startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales by product:", error);
      return { success: false, error: error.message };
    }
  }

  // Get sales by partner
  static async getSalesByPartner(partnerId, startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sr.*,
          p.name as product_name,
          p.unit_size,
          p.milk_type
        FROM sales_records sr
        JOIN products p ON sr.product_id = p.id
        WHERE sr.partner_id = ? AND sr.sale_date BETWEEN ? AND ?
        ORDER BY sr.sale_date DESC, p.name ASC`,
        [partnerId, startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales by partner:", error);
      return { success: false, error: error.message };
    }
  }

  // Create sales record
  static async createSalesRecord(data) {
    try {
      const { sale_date, product_id, partner_id, sales_channel, quantity_sold, unit_price, total_amount, notes, is_manual_entry = 1, api_reference, created_by } = data;

      // Sanitize numeric fields - convert empty strings to 0
      const sanitizedQuantitySold = quantity_sold === "" || quantity_sold === null || quantity_sold === undefined ? 0 : parseFloat(quantity_sold);
      const sanitizedUnitPrice = unit_price === "" || unit_price === null || unit_price === undefined ? 0 : parseFloat(unit_price);
      const sanitizedTotalAmount = total_amount === "" || total_amount === null || total_amount === undefined ? 0 : parseFloat(total_amount);

      const [result] = await pool.execute(
        `INSERT INTO sales_records 
        (sale_date, product_id, partner_id, sales_channel, quantity_sold, unit_price, 
         total_amount, notes, is_manual_entry, api_reference, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sale_date, product_id, partner_id || null, sales_channel, sanitizedQuantitySold, sanitizedUnitPrice, sanitizedTotalAmount, notes || null, is_manual_entry, api_reference || null, created_by || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating sales record:", error);
      return { success: false, error: error.message };
    }
  }

  // Update sales record
  static async updateSalesRecord(id, data) {
    try {
      const { sale_date, product_id, partner_id, sales_channel, quantity_sold, unit_price, total_amount, notes } = data;

      // Sanitize numeric fields - convert empty strings to 0
      const sanitizedQuantitySold = quantity_sold === "" || quantity_sold === null || quantity_sold === undefined ? 0 : parseFloat(quantity_sold);
      const sanitizedUnitPrice = unit_price === "" || unit_price === null || unit_price === undefined ? 0 : parseFloat(unit_price);
      const sanitizedTotalAmount = total_amount === "" || total_amount === null || total_amount === undefined ? 0 : parseFloat(total_amount);

      const [result] = await pool.execute(
        `UPDATE sales_records 
        SET sale_date = ?, product_id = ?, partner_id = ?, sales_channel = ?, 
            quantity_sold = ?, unit_price = ?, total_amount = ?, notes = ?
        WHERE id = ?`,
        [sale_date, product_id, partner_id || null, sales_channel, sanitizedQuantitySold, sanitizedUnitPrice, sanitizedTotalAmount, notes || null, id],
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Record not found or no changes made" };
      }

      return { success: true };
    } catch (error) {
      console.error("Error updating sales record:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete sales record
  static async deleteSalesRecord(id) {
    try {
      await pool.execute(`DELETE FROM sales_records WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting sales record:", error);
      return { success: false, error: error.message };
    }
  }

  // Upsert sales record (for API sync)
  static async upsertSalesRecord(data) {
    try {
      const { sale_date, product_id, partner_id, sales_channel, quantity_sold, unit_price, total_amount, notes, is_manual_entry = 0, api_reference, created_by } = data;

      // Sanitize numeric fields - convert empty strings to 0
      const sanitizedQuantitySold = quantity_sold === "" || quantity_sold === null || quantity_sold === undefined ? 0 : parseFloat(quantity_sold);
      const sanitizedUnitPrice = unit_price === "" || unit_price === null || unit_price === undefined ? 0 : parseFloat(unit_price);
      const sanitizedTotalAmount = total_amount === "" || total_amount === null || total_amount === undefined ? 0 : parseFloat(total_amount);

      const [result] = await pool.execute(
        `INSERT INTO sales_records 
        (sale_date, product_id, partner_id, sales_channel, quantity_sold, unit_price, 
         total_amount, notes, is_manual_entry, api_reference, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          quantity_sold = VALUES(quantity_sold),
          unit_price = VALUES(unit_price),
          total_amount = VALUES(total_amount),
          notes = VALUES(notes)`,
        [sale_date, product_id, partner_id || null, sales_channel, sanitizedQuantitySold, sanitizedUnitPrice, sanitizedTotalAmount, notes || null, is_manual_entry, api_reference || null, created_by || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error upserting sales record:", error);
      return { success: false, error: error.message };
    }
  }

  // Get sales aggregated by channel
  static async getSalesGroupedByChannel(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          sales_channel,
          sp.partner_name,
          COUNT(*) as record_count,
          SUM(quantity_sold) as total_quantity,
          SUM(total_amount) as total_revenue
        FROM sales_records sr
        LEFT JOIN sales_partners sp ON sr.partner_id = sp.id
        WHERE sale_date BETWEEN ? AND ?
        GROUP BY sales_channel, sp.partner_name
        ORDER BY total_quantity DESC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales grouped by channel:", error);
      return { success: false, error: error.message };
    }
  }

  // Get sales aggregated by product
  static async getSalesGroupedByProduct(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          p.id as product_id,
          p.name as product_name,
          p.unit_size,
          p.milk_type,
          pc.name as category_name,
          SUM(sr.quantity_sold) as total_quantity,
          SUM(sr.total_amount) as total_revenue,
          COUNT(DISTINCT sr.sale_date) as sales_days
        FROM sales_records sr
        JOIN products p ON sr.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE sr.sale_date BETWEEN ? AND ?
        GROUP BY p.id, p.name, p.unit_size, p.milk_type, pc.name
        ORDER BY total_quantity DESC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching sales grouped by product:", error);
      return { success: false, error: error.message };
    }
  }

  // Get partner sales trends for chart (daily breakdown with product details)
  static async getPartnerSalesTrends(startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          DATE_FORMAT(sr.sale_date, '%Y-%m-%d') as sale_date,
          sr.partner_id,
          sp.partner_name,
          sr.product_id,
          p.name as product_name,
          p.milk_type,
          SUM(sr.quantity_sold) as total_quantity
        FROM sales_records sr
        JOIN products p ON sr.product_id = p.id
        JOIN sales_partners sp ON sr.partner_id = sp.id
        WHERE sr.sale_date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(sr.sale_date, '%Y-%m-%d'), sr.partner_id, sp.partner_name, sr.product_id, p.name, p.milk_type
        ORDER BY sr.partner_id, DATE_FORMAT(sr.sale_date, '%Y-%m-%d') ASC, total_quantity DESC`,
        [startDate, endDate],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching partner sales trends:", error);
      return { success: false, error: error.message };
    }
  }
}
