import { opsPool } from "../../../db/pool.js";

export class LabelOrderModel {
  static async generateOrderNumber() {
    try {
      const prefix = "LAB";
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateStr = `${year}${month}${day}`;

      // Get the last order number for today
      const [rows] = await opsPool.query(
        "SELECT order_number FROM label_orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1",
        [`${prefix}-${dateStr}-%`]
      );

      let sequence = 1;
      if (rows.length > 0) {
        const lastOrderNumber = rows[0].order_number;
        const lastSequence = parseInt(lastOrderNumber.split("-")[3] || "0", 10);
        sequence = lastSequence + 1;
      }

      return `${prefix}-${dateStr}-${String(sequence).padStart(4, "0")}`;
    } catch (error) {
      console.error("LabelOrderModel.generateOrderNumber error:", error);
      // Fallback to timestamp-based number
      return `LAB-${Date.now()}`;
    }
  }

  static async listOrders({ limit = 100, offset = 0, search = "", vendorId = null, status = null } = {}) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      let query = `
        SELECT 
          o.*,
          v.name as vendor_name,
          v.contact_person as vendor_contact_person,
          v.email as vendor_email,
          v.phone as vendor_phone,
          (SELECT COUNT(*) FROM label_order_items WHERE order_id = o.id) as item_count
        FROM label_orders o
        LEFT JOIN printing_vendors v ON v.id = o.vendor_id
        WHERE 1=1
      `;
      const params = [];

      if (search) {
        query += " AND (o.order_number LIKE ? OR v.name LIKE ?)";
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      if (vendorId) {
        query += " AND o.vendor_id = ?";
        params.push(vendorId);
      }

      if (status) {
        query += " AND o.status = ?";
        params.push(status);
      }

      query += " ORDER BY o.order_date DESC, o.id DESC LIMIT ? OFFSET ?";
      params.push(Number(limit), Number(offset));

      const [orders] = await opsPool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM label_orders o
        LEFT JOIN printing_vendors v ON v.id = o.vendor_id
        WHERE 1=1
      `;
      const countParams = [];

      if (search) {
        countQuery += " AND (o.order_number LIKE ? OR v.name LIKE ?)";
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm);
      }

      if (vendorId) {
        countQuery += " AND o.vendor_id = ?";
        countParams.push(vendorId);
      }

      if (status) {
        countQuery += " AND o.status = ?";
        countParams.push(status);
      }

      const [countResult] = await opsPool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      return { success: true, orders, total };
    } catch (error) {
      console.error("LabelOrderModel.listOrders error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getOrderById(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [orders] = await opsPool.query(
        `SELECT 
          o.*,
          v.name as vendor_name,
          v.contact_person as vendor_contact_person,
          v.email as vendor_email,
          v.phone as vendor_phone,
          v.address as vendor_address,
          v.city as vendor_city,
          v.state as vendor_state,
          v.pincode as vendor_pincode,
          v.gst_number as vendor_gst_number
        FROM label_orders o
        LEFT JOIN printing_vendors v ON v.id = o.vendor_id
        WHERE o.id = ?`,
        [id]
      );

      if (orders.length === 0) {
        return { success: false, error: "Order not found" };
      }

      const order = orders[0];

      // Get order items
      const [items] = await opsPool.query(
        `SELECT 
          oi.*,
          pl.name as label_name,
          pl.unit_size,
          pl.label_type,
          pl.label_material,
          pl.cutting,
          pl.design_file_path,
          pl.design_file_name,
          p.name as product_name
        FROM label_order_items oi
        LEFT JOIN product_labels pl ON pl.id = oi.label_id
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC`,
        [id]
      );

      order.items = items;

      return { success: true, order };
    } catch (error) {
      console.error("LabelOrderModel.getOrderById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async generateShareCode() {
    // Generate a unique 8-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  static async generatePasscode() {
    // Generate a 6-digit numeric passcode
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  static async getOrderByOrderNumber(orderNumber) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [orders] = await opsPool.query(
        `SELECT 
          o.*,
          v.name as vendor_name,
          v.contact_person as vendor_contact_person,
          v.email as vendor_email,
          v.phone as vendor_phone,
          v.address as vendor_address,
          v.city as vendor_city,
          v.state as vendor_state,
          v.pincode as vendor_pincode,
          v.gst_number as vendor_gst_number
        FROM label_orders o
        LEFT JOIN printing_vendors v ON v.id = o.vendor_id
        WHERE o.order_number = ?`,
        [orderNumber]
      );

      if (orders.length === 0) {
        return { success: false, error: "Order not found" };
      }

      const order = orders[0];

      // Get order items
      const [items] = await opsPool.query(
        `SELECT 
          oi.*,
          pl.name as label_name,
          pl.unit_size,
          pl.label_type,
          pl.label_material,
          pl.cutting,
          pl.design_file_path,
          pl.design_file_name,
          p.name as product_name
        FROM label_order_items oi
        LEFT JOIN product_labels pl ON pl.id = oi.label_id
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC`,
        [order.id]
      );

      order.items = items;

      return { success: true, order };
    } catch (error) {
      console.error("LabelOrderModel.getOrderByOrderNumber error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createOrder(orderData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        vendor_id,
        status = "draft",
        order_date,
        expected_delivery_date,
        total_quantity = 0,
        total_cost,
        notes,
        created_by,
        items = [],
      } = orderData;

      // Generate order number
      const order_number = await this.generateOrderNumber();

      // Start transaction
      await opsPool.query("START TRANSACTION");

      try {
        // Create order
        const [orderResult] = await opsPool.query(
          `INSERT INTO label_orders 
          (order_number, vendor_id, status, order_date, expected_delivery_date, total_quantity, total_cost, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [order_number, vendor_id, status, order_date, expected_delivery_date || null, total_quantity, total_cost || null, notes || null, created_by || null]
        );

        const orderId = orderResult.insertId;

        // Create order items
        if (items.length > 0) {
          for (const item of items) {
            const { label_id, quantity, unit_price, total_price, notes: itemNotes } = item;
            await opsPool.query(
              `INSERT INTO label_order_items 
              (order_id, label_id, quantity, unit_price, total_price, notes)
              VALUES (?, ?, ?, ?, ?, ?)`,
              [orderId, label_id, quantity, unit_price || null, total_price || null, itemNotes || null]
            );
          }
        }

        await opsPool.query("COMMIT");

        return { success: true, id: orderId, order_number };
      } catch (error) {
        await opsPool.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("LabelOrderModel.createOrder error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateOrder(id, orderData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        vendor_id,
        status,
        order_date,
        expected_delivery_date,
        actual_delivery_date,
        total_quantity,
        total_cost,
        notes,
      } = orderData;

      const fields = [];
      const values = [];

      if (vendor_id !== undefined) {
        fields.push("vendor_id = ?");
        values.push(vendor_id);
      }
      if (status !== undefined) {
        fields.push("status = ?");
        values.push(status);
      }
      if (order_date !== undefined) {
        fields.push("order_date = ?");
        values.push(order_date);
      }
      if (expected_delivery_date !== undefined) {
        fields.push("expected_delivery_date = ?");
        values.push(expected_delivery_date);
      }
      if (actual_delivery_date !== undefined) {
        fields.push("actual_delivery_date = ?");
        values.push(actual_delivery_date);
      }
      if (total_quantity !== undefined) {
        fields.push("total_quantity = ?");
        values.push(total_quantity);
      }
      if (total_cost !== undefined) {
        fields.push("total_cost = ?");
        values.push(total_cost);
      }
      if (notes !== undefined) {
        fields.push("notes = ?");
        values.push(notes);
      }

      if (fields.length === 0) {
        return { success: false, error: "No fields to update" };
      }

      values.push(id);

      const [result] = await opsPool.query(
        `UPDATE label_orders SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Order not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("LabelOrderModel.updateOrder error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateOrderItems(orderId, items) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      await opsPool.query("START TRANSACTION");

      try {
        // Delete existing items
        await opsPool.query("DELETE FROM label_order_items WHERE order_id = ?", [orderId]);

        // Insert new items
        if (items.length > 0) {
          for (const item of items) {
            const { label_id, quantity, unit_price, total_price, notes: itemNotes } = item;
            await opsPool.query(
              `INSERT INTO label_order_items 
              (order_id, label_id, quantity, unit_price, total_price, notes)
              VALUES (?, ?, ?, ?, ?, ?)`,
              [orderId, label_id, quantity, unit_price || null, total_price || null, itemNotes || null]
            );
          }
        }

        // Recalculate total quantity
        const [quantityResult] = await opsPool.query(
          "SELECT SUM(quantity) as total FROM label_order_items WHERE order_id = ?",
          [orderId]
        );
        const totalQuantity = quantityResult[0]?.total || 0;

        // Recalculate total cost
        const [costResult] = await opsPool.query(
          "SELECT SUM(total_price) as total FROM label_order_items WHERE order_id = ?",
          [orderId]
        );
        const totalCost = costResult[0]?.total || null;

        await opsPool.query(
          "UPDATE label_orders SET total_quantity = ?, total_cost = ? WHERE id = ?",
          [totalQuantity, totalCost, orderId]
        );

        await opsPool.query("COMMIT");

        return { success: true };
      } catch (error) {
        await opsPool.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("LabelOrderModel.updateOrderItems error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteOrder(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await opsPool.query("DELETE FROM label_orders WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Order not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("LabelOrderModel.deleteOrder error:", error);
      return { success: false, error: error.message };
    }
  }

  static async generateOrGetShareCode(orderId) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      // Check if share_code already exists
      const [existing] = await opsPool.query(
        "SELECT share_code, share_passcode FROM label_orders WHERE id = ?",
        [orderId]
      );

      if (existing.length > 0 && existing[0].share_code && existing[0].share_passcode) {
        return {
          success: true,
          share_code: existing[0].share_code,
          passcode: existing[0].share_passcode,
        };
      }

      // Generate new share code and passcode
      let shareCode = await this.generateShareCode();
      let passcode = await this.generatePasscode();

      // Ensure uniqueness of share_code
      let attempts = 0;
      while (attempts < 10) {
        const [duplicate] = await opsPool.query(
          "SELECT id FROM label_orders WHERE share_code = ?",
          [shareCode]
        );
        if (duplicate.length === 0) {
          break;
        }
        shareCode = await this.generateShareCode();
        attempts++;
      }

      // Update order with share code and passcode
      await opsPool.query(
        "UPDATE label_orders SET share_code = ?, share_passcode = ? WHERE id = ?",
        [shareCode, passcode, orderId]
      );

      return {
        success: true,
        share_code: shareCode,
        passcode: passcode,
      };
    } catch (error) {
      console.error("LabelOrderModel.generateOrGetShareCode error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getOrderByShareCode(shareCode) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [orders] = await opsPool.query(
        `SELECT 
          o.*,
          v.name as vendor_name,
          v.contact_person as vendor_contact_person,
          v.email as vendor_email,
          v.phone as vendor_phone,
          v.address as vendor_address,
          v.city as vendor_city,
          v.state as vendor_state,
          v.pincode as vendor_pincode,
          v.gst_number as vendor_gst_number
        FROM label_orders o
        LEFT JOIN printing_vendors v ON v.id = o.vendor_id
        WHERE o.share_code = ?`,
        [shareCode]
      );

      if (orders.length === 0) {
        return { success: false, error: "Order not found" };
      }

      const order = orders[0];

      // Get order items
      const [items] = await opsPool.query(
        `SELECT 
          oi.*,
          pl.name as label_name,
          pl.unit_size,
          pl.label_type,
          pl.label_material,
          pl.cutting,
          pl.design_file_path,
          pl.design_file_name,
          p.name as product_name
        FROM label_order_items oi
        LEFT JOIN product_labels pl ON pl.id = oi.label_id
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC`,
        [order.id]
      );

      order.items = items;

      return { success: true, order };
    } catch (error) {
      console.error("LabelOrderModel.getOrderByShareCode error:", error);
      return { success: false, error: error.message };
    }
  }

  static async verifySharePasscode(shareCode, passcode) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [orders] = await opsPool.query(
        "SELECT id FROM label_orders WHERE share_code = ? AND share_passcode = ?",
        [shareCode, passcode]
      );

      if (orders.length === 0) {
        return { success: false, error: "Invalid passcode" };
      }

      return { success: true };
    } catch (error) {
      console.error("LabelOrderModel.verifySharePasscode error:", error);
      return { success: false, error: error.message };
    }
  }
}


