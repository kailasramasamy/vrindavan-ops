import pool from "../../../db/pool.js";

class PurchaseOrderModel {
  // Generate PO number
  static async generatePONumber() {
    try {
      const [result] = await pool.execute(`SELECT po_number FROM purchase_orders ORDER BY id DESC LIMIT 1`);

      if (result.length === 0) {
        return `PO${new Date().getFullYear()}0001`;
      }

      const lastPO = result[0].po_number;
      const lastNumber = parseInt(lastPO.slice(-4));
      const newNumber = (lastNumber + 1).toString().padStart(4, "0");
      return `PO${new Date().getFullYear()}${newNumber}`;
    } catch (error) {
      console.error("Error generating PO number:", error);
      return `PO${new Date().getFullYear()}${Date.now().toString().slice(-4)}`;
    }
  }

  // Get all purchase orders with filters
  static async getAllPOs(filters = {}) {
    try {
      let query = `
        SELECT 
          po.*,
          v.name as vendor_name,
          v.gstin as vendor_gstin,
          v.contact_person_name,
          v.contact_person_phone,
          COUNT(DISTINCT poi.id) as item_count,
          SUM(CASE WHEN pop.id IS NOT NULL THEN pop.amount ELSE 0 END) as total_paid,
          COUNT(DISTINCT inv.id) as invoice_count
        FROM purchase_orders po
        LEFT JOIN po_vendors v ON po.vendor_id = v.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.po_id
        LEFT JOIN po_payments pop ON po.id = pop.po_id
        LEFT JOIN po_invoices inv ON po.id = inv.po_id
        WHERE 1=1
      `;

      const params = [];

      if (filters.search) {
        query += ` AND (po.po_number LIKE ? OR v.name LIKE ?)`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
      }

      if (filters.vendor_id) {
        query += ` AND po.vendor_id = ?`;
        params.push(filters.vendor_id);
      }

      if (filters.status) {
        query += ` AND po.status = ?`;
        params.push(filters.status);
      }

      if (filters.payment_status) {
        query += ` AND po.payment_status = ?`;
        params.push(filters.payment_status);
      }

      if (filters.from_date) {
        query += ` AND po.po_date >= ?`;
        params.push(filters.from_date);
      }

      if (filters.to_date) {
        query += ` AND po.po_date <= ?`;
        params.push(filters.to_date);
      }

      query += ` GROUP BY po.id`;

      // Add filter for missing invoices
      if (filters.missing_invoice === "true" || filters.missing_invoice === true) {
        query += ` HAVING invoice_count = 0 AND po.status NOT IN ('draft', 'cancelled')`;
      }

      query += ` ORDER BY po.po_number DESC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      return { success: false, error: error.message };
    }
  }

  // Get PO by ID with full details
  static async getPOById(id) {
    try {
      const [pos] = await pool.execute(
        `SELECT 
          po.*,
          v.name as vendor_name,
          v.gstin as vendor_gstin,
          v.address as vendor_address,
          v.city as vendor_city,
          v.state as vendor_state,
          v.pincode as vendor_pincode,
          v.contact_person_name,
          v.contact_person_phone,
          v.contact_person_email,
          lp.company_name as logistics_partner_name,
          lp.contact_person as logistics_contact_person,
          lp.phone as logistics_phone,
          lp.email as logistics_email,
          lp.city as logistics_partner_city
        FROM purchase_orders po
        LEFT JOIN po_vendors v ON po.vendor_id = v.id
        LEFT JOIN logistics_partners lp ON po.logistics_partner_id = lp.id
        WHERE po.id = ?`,
        [id],
      );

      if (pos.length === 0) {
        return { success: false, error: "Purchase order not found" };
      }

      const po = pos[0];

      // Get line items
      const [items] = await pool.execute(
        `SELECT 
          poi.*,
          p.name as product_name,
          p.sku_code as product_sku,
          pv.name as variant_name
        FROM purchase_order_items poi
        JOIN po_procurement_items p ON poi.procurement_item_id = p.id
        LEFT JOIN po_product_variants pv ON poi.variant_id = pv.id
        WHERE poi.po_id = ?`,
        [id],
      );

      // Get status history
      const [statusHistory] = await pool.execute(`SELECT * FROM po_status_history WHERE po_id = ? ORDER BY changed_at DESC`, [id]);

      // Get invoices
      const [invoices] = await pool.execute(`SELECT * FROM po_invoices WHERE po_id = ? ORDER BY invoice_date DESC`, [id]);

      // Get shipments
      const [shipments] = await pool.execute(`SELECT * FROM po_shipments WHERE po_id = ? ORDER BY created_at DESC`, [id]);

      // Get payments
      const [payments] = await pool.execute(`SELECT * FROM po_payments WHERE po_id = ? ORDER BY payment_date DESC`, [id]);

      // Calculate totals
      const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const balanceAmount = parseFloat(po.total_amount) - totalPaid;

      return {
        success: true,
        data: {
          ...po,
          items,
          status_history: statusHistory,
          invoices,
          shipments,
          payments,
          total_paid: totalPaid,
          balance_amount: balanceAmount,
        },
      };
    } catch (error) {
      console.error("Error fetching PO details:", error);
      return { success: false, error: error.message };
    }
  }

  // Create purchase order
  static async createPO(poData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { vendor_id, po_type, po_date, payment_terms, expected_delivery_date, notes, items, created_by, status, shipping_cost, logistics_partner_id } = poData;

      const po_number = await this.generatePONumber();

      // Calculate totals
      let subtotal = 0;
      let gst_amount = 0;

      for (const item of items) {
        // Handle items with or without unit_cost
        const unitCost = item.unit_cost && parseFloat(item.unit_cost) > 0 ? parseFloat(item.unit_cost) : 0;
        const itemTotal = parseFloat(item.quantity) * unitCost;
        const itemGST = (itemTotal * parseFloat(item.gst_percentage || 0)) / 100;
        subtotal += itemTotal;
        gst_amount += itemGST;
      }

      const shippingCost = parseFloat(shipping_cost || 0);
      const total_amount = subtotal + gst_amount; // Exclude shipping cost from total

      // Insert PO
      const [result] = await connection.execute(
        `INSERT INTO purchase_orders 
        (po_number, po_type, vendor_id, po_date, subtotal, gst_amount, total_amount, shipping_cost, logistics_partner_id, payment_terms, expected_delivery_date, notes, created_by, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [po_number, po_type || "product", vendor_id, po_date, subtotal, gst_amount, total_amount, shippingCost, logistics_partner_id || null, payment_terms || null, expected_delivery_date || null, notes || null, created_by, status || "draft"],
      );

      const poId = result.insertId;

      // Insert line items
      for (const item of items) {
        // Handle items with or without unit_cost
        const unitCost = item.unit_cost && parseFloat(item.unit_cost) > 0 ? parseFloat(item.unit_cost) : 0;
        const itemTotal = parseFloat(item.quantity) * unitCost;
        const itemGST = (itemTotal * parseFloat(item.gst_percentage || 0)) / 100;
        const itemTotalWithGST = itemTotal + itemGST;

        // For material POs, use material_name instead of procurement_item_id
        if (item.material_name && !item.procurement_item_id) {
          await connection.execute(
            `INSERT INTO purchase_order_items 
            (po_id, material_name, variant_id, base_unit, quantity, unit_cost, gst_percentage, gst_amount, total_amount, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [poId, item.material_name, null, item.base_unit || "pc", item.quantity, unitCost, item.gst_percentage || 0, itemGST, itemTotalWithGST, item.notes || null],
          );
        } else {
          await connection.execute(
            `INSERT INTO purchase_order_items 
            (po_id, procurement_item_id, variant_id, base_unit, quantity, unit_cost, gst_percentage, gst_amount, total_amount, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [poId, item.procurement_item_id, item.variant_id || null, item.base_unit || "pc", item.quantity, unitCost, item.gst_percentage || 0, itemGST, itemTotalWithGST, item.notes || null],
          );
        }
      }

      // Log status change
      await connection.execute(`INSERT INTO po_status_history (po_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)`, [poId, null, status || "draft", created_by]);

      await connection.commit();
      return { success: true, data: { id: poId, po_number } };
    } catch (error) {
      await connection.rollback();
      console.error("Error creating PO:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Update purchase order
  static async updatePO(id, poData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { vendor_id, po_date, payment_terms, expected_delivery_date, notes, items, updated_by, status, payment_status, shipping_cost, logistics_partner_id } = poData;

      // Validate required fields
      if (!vendor_id || !po_date) {
        return { success: false, error: "Vendor ID and PO date are required" };
      }

      // Calculate totals if items are provided
      if (items) {
        let subtotal = 0;
        let gst_amount = 0;

        for (const item of items) {
          // Validate required item fields (unit_cost is optional for TBD items)
          if (!item.procurement_item_id || !item.quantity) {
            throw new Error("Item must have procurement_item_id and quantity");
          }

          // Only calculate totals for items with unit_cost
          if (item.unit_cost && parseFloat(item.unit_cost) > 0) {
            const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_cost);
            const itemGST = (itemTotal * parseFloat(item.gst_percentage || 0)) / 100;
            subtotal += itemTotal;
            gst_amount += itemGST;
          }
        }

        const shippingCost = parseFloat(shipping_cost || 0);
        const total_amount = subtotal + gst_amount; // Exclude shipping cost from total

        await connection.execute(
          `UPDATE purchase_orders 
          SET vendor_id = ?, po_date = ?, subtotal = ?, gst_amount = ?, total_amount = ?, shipping_cost = ?, logistics_partner_id = ?,
              payment_terms = ?, expected_delivery_date = ?, notes = ?, updated_by = ?, updated_at = NOW(),
              status = ?, payment_status = ?
          WHERE id = ?`,
          [vendor_id, po_date, subtotal, gst_amount, total_amount, shippingCost, logistics_partner_id || null, payment_terms || null, expected_delivery_date || null, notes || null, updated_by, status || "draft", payment_status || "pending", id],
        );

        // Delete existing items and insert new ones
        await connection.execute(`DELETE FROM purchase_order_items WHERE po_id = ?`, [id]);

        for (const item of items) {
          // Validate required item fields (unit_cost is optional for TBD items)
          if (!item.procurement_item_id || !item.quantity) {
            throw new Error("Item must have procurement_item_id and quantity");
          }

          // Handle items with or without unit_cost
          const unitCost = item.unit_cost && parseFloat(item.unit_cost) > 0 ? parseFloat(item.unit_cost) : 0;
          const itemTotal = parseFloat(item.quantity) * unitCost;
          const itemGST = (itemTotal * parseFloat(item.gst_percentage || 0)) / 100;
          const itemTotalWithGST = itemTotal + itemGST;

          await connection.execute(
            `INSERT INTO purchase_order_items 
            (po_id, procurement_item_id, variant_id, base_unit, quantity, unit_cost, gst_percentage, gst_amount, total_amount, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, item.procurement_item_id, item.variant_id || null, item.base_unit || "pc", item.quantity, unitCost, item.gst_percentage || 0, itemGST, itemTotalWithGST, item.notes || null],
          );
        }
      } else {
        const shippingCost = parseFloat(shipping_cost || 0);

        // Get current subtotal and gst_amount to recalculate total_amount
        const [currentPO] = await connection.execute(`SELECT subtotal, gst_amount FROM purchase_orders WHERE id = ?`, [id]);

        const currentSubtotal = parseFloat(currentPO[0]?.subtotal || 0);
        const currentGstAmount = parseFloat(currentPO[0]?.gst_amount || 0);
        const newTotalAmount = parseFloat((currentSubtotal + currentGstAmount).toFixed(2)); // Exclude shipping cost from total

        await connection.execute(
          `UPDATE purchase_orders 
          SET vendor_id = ?, po_date = ?, shipping_cost = ?, logistics_partner_id = ?, total_amount = ?, payment_terms = ?, expected_delivery_date = ?, notes = ?, updated_by = ?, updated_at = NOW(),
              status = ?, payment_status = ?
          WHERE id = ?`,
          [vendor_id, po_date, shippingCost, logistics_partner_id || null, newTotalAmount, payment_terms || null, expected_delivery_date || null, notes || null, updated_by, status || "draft", payment_status || "pending", id],
        );
      }

      // Log status change if status was provided
      if (status) {
        // Get current status for logging
        const [currentStatus] = await connection.execute(`SELECT status FROM purchase_orders WHERE id = ?`, [id]);
        const oldStatus = currentStatus[0]?.status;

        if (oldStatus !== status) {
          await connection.execute(`INSERT INTO po_status_history (po_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)`, [id, oldStatus, status, updated_by]);
        }
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Error updating PO:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Change PO status
  static async changeStatus(id, newStatus, changedBy, notes = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get current status
      const [pos] = await connection.execute(`SELECT status FROM purchase_orders WHERE id = ?`, [id]);
      const oldStatus = pos[0]?.status;

      // Update status
      await connection.execute(`UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?`, [newStatus, id]);

      // Log status change
      await connection.execute(`INSERT INTO po_status_history (po_id, from_status, to_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`, [id, oldStatus, newStatus, changedBy, notes]);

      // Update actual delivery date if status is 'received'
      if (newStatus === "received") {
        await connection.execute(`UPDATE purchase_orders SET actual_delivery_date = CURDATE() WHERE id = ?`, [id]);
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Error changing PO status:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Add invoice
  static async addInvoice(invoiceData) {
    try {
      const { po_id, invoice_number, invoice_date, invoice_amount, invoice_file_url, notes, uploaded_by } = invoiceData;

      const [result] = await pool.execute(
        `INSERT INTO po_invoices 
        (po_id, invoice_number, invoice_date, invoice_amount, invoice_file_url, notes, uploaded_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [po_id, invoice_number, invoice_date, invoice_amount, invoice_file_url, notes, uploaded_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error adding invoice:", error);
      return { success: false, error: error.message };
    }
  }

  // Add/Update shipment
  static async updateShipment(shipmentData) {
    try {
      const { po_id, awb_number, logistics_partner, shipped_date, expected_delivery_date, actual_delivery_date, delivery_proof_url, grn_number, grn_date, notes, created_by } = shipmentData;

      const [existing] = await pool.execute(`SELECT id FROM po_shipments WHERE po_id = ?`, [po_id]);

      if (existing.length > 0) {
        await pool.execute(
          `UPDATE po_shipments 
          SET awb_number = ?, logistics_partner = ?, shipped_date = ?, expected_delivery_date = ?, 
              actual_delivery_date = ?, delivery_proof_url = ?, grn_number = ?, grn_date = ?, notes = ?, updated_at = NOW()
          WHERE po_id = ?`,
          [awb_number, logistics_partner, shipped_date, expected_delivery_date, actual_delivery_date, delivery_proof_url, grn_number, grn_date, notes, po_id],
        );
        return { success: true, data: { id: existing[0].id } };
      } else {
        const [result] = await pool.execute(
          `INSERT INTO po_shipments 
          (po_id, awb_number, logistics_partner, shipped_date, expected_delivery_date, actual_delivery_date, delivery_proof_url, grn_number, grn_date, notes, created_by) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [po_id, awb_number, logistics_partner, shipped_date, expected_delivery_date, actual_delivery_date, delivery_proof_url, grn_number, grn_date, notes, created_by],
        );
        return { success: true, data: { id: result.insertId } };
      }
    } catch (error) {
      console.error("Error updating shipment:", error);
      return { success: false, error: error.message };
    }
  }

  // Add payment
  static async addPayment(paymentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { po_id, payment_date, amount, payment_mode, reference_number, transaction_id, notes, created_by } = paymentData;

      // Insert payment
      const [result] = await connection.execute(
        `INSERT INTO po_payments 
        (po_id, payment_date, amount, payment_mode, reference_number, transaction_id, notes, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [po_id, payment_date, amount, payment_mode, reference_number, transaction_id, notes, created_by],
      );

      // Calculate total paid
      const [payments] = await connection.execute(`SELECT SUM(amount) as total_paid FROM po_payments WHERE po_id = ?`, [po_id]);

      const totalPaid = parseFloat(payments[0].total_paid) || 0;

      // Get PO total
      const [po] = await connection.execute(`SELECT total_amount FROM purchase_orders WHERE id = ?`, [po_id]);

      const totalAmount = parseFloat(po[0].total_amount);

      // Update payment status
      let paymentStatus = "pending";
      if (totalPaid >= totalAmount) {
        paymentStatus = "paid";
      } else if (totalPaid > 0) {
        paymentStatus = "partially_paid";
      }

      await connection.execute(`UPDATE purchase_orders SET payment_status = ? WHERE id = ?`, [paymentStatus, po_id]);

      await connection.commit();
      return { success: true, data: { id: result.insertId, payment_status: paymentStatus } };
    } catch (error) {
      await connection.rollback();
      console.error("Error adding payment:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Delete PO
  static async deletePO(id) {
    try {
      const [result] = await pool.execute(`DELETE FROM purchase_orders WHERE id = ?`, [id]);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting PO:", error);
      return { success: false, error: error.message };
    }
  }

  // Get dashboard statistics
  static async getDashboardStats(filters = {}) {
    try {
      const whereClause = [];
      const params = [];

      if (filters.from_date) {
        whereClause.push(`po_date >= ?`);
        params.push(filters.from_date);
      }

      if (filters.to_date) {
        whereClause.push(`po_date <= ?`);
        params.push(filters.to_date);
      }

      const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

      const [stats] = await pool.execute(
        `SELECT 
          COUNT(*) as total_pos,
          SUM(total_amount) as total_value,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
          SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit_count,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received_count,
          SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_payment_count,
          SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as pending_payment_value,
          AVG(DATEDIFF(actual_delivery_date, po_date)) as avg_cycle_time,
          SUM(CASE 
            WHEN status NOT IN ('draft', 'cancelled') 
            AND (SELECT COUNT(*) FROM po_invoices WHERE po_id = purchase_orders.id) = 0 
            THEN 1 ELSE 0 
          END) as pending_invoice_count
        FROM purchase_orders
        ${where}`,
        params,
      );

      return { success: true, data: stats[0] || {} };
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      return { success: false, error: error.message };
    }
  }

  // Get invoices report
  static async getInvoicesReport(filters = {}) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const whereClause = [];
      const params = [];

      if (filters.from_date) {
        whereClause.push(`inv.invoice_date >= ?`);
        params.push(filters.from_date);
      }

      if (filters.to_date) {
        whereClause.push(`inv.invoice_date <= ?`);
        params.push(filters.to_date);
      }

      const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

      const [invoices] = await pool.execute(
        `SELECT 
          inv.id as invoice_id,
          inv.invoice_number,
          inv.invoice_date,
          inv.invoice_amount,
          inv.invoice_file_url,
          inv.notes as invoice_notes,
          inv.created_at as uploaded_at,
          po.id as po_id,
          po.po_number,
          po.po_date,
          po.total_amount as po_total_amount,
          po.status as po_status,
          po.payment_status,
          v.id as vendor_id,
          v.name as vendor_name,
          v.gstin as vendor_gstin,
          v.contact_person_name as vendor_contact_person,
          v.contact_person_phone as vendor_contact_phone
        FROM po_invoices inv
        INNER JOIN purchase_orders po ON inv.po_id = po.id
        LEFT JOIN po_vendors v ON po.vendor_id = v.id
        ${where}
        ORDER BY inv.invoice_date DESC, inv.created_at DESC`,
        params,
      );

      return { success: true, data: invoices };
    } catch (error) {
      console.error("Error fetching invoices report:", error);
      return { success: false, error: error.message };
    }
  }

  // Get PO items
  static async getPOItems(poId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [items] = await pool.execute(
        `
        SELECT 
          poi.id,
          poi.po_id,
          poi.procurement_item_id,
          poi.variant_id,
          poi.quantity,
          poi.unit_cost,
          COALESCE(pi.gst_percentage, poi.gst_percentage) as gst_percentage,
          (poi.quantity * poi.unit_cost * COALESCE(pi.gst_percentage, poi.gst_percentage) / 100) as gst_amount,
          (poi.quantity * poi.unit_cost * (1 + COALESCE(pi.gst_percentage, poi.gst_percentage) / 100)) as total_amount,
          poi.base_unit,
          poi.notes,
          poi.created_at,
          poi.updated_at,
          pi.name as item_name,
          pi.sku_code as item_sku,
          pv.name as variant_name
        FROM purchase_order_items poi
        LEFT JOIN po_procurement_items pi ON poi.procurement_item_id = pi.id
        LEFT JOIN po_product_variants pv ON poi.variant_id = pv.id
        WHERE poi.po_id = ?
        ORDER BY poi.id
      `,
        [poId],
      );

      return { success: true, data: items };
    } catch (error) {
      console.error("Error fetching PO items:", error);
      return { success: false, error: error.message };
    }
  }

  // Record payment
  static async recordPayment(poId, paymentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { amount, payment_date, payment_method, reference_number, notes, recorded_by } = paymentData;

      // Insert payment record
      const [result] = await connection.execute(
        `INSERT INTO po_payments (po_id, amount, payment_date, payment_mode, reference_number, notes, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [poId, amount, payment_date, payment_method, reference_number, notes, recorded_by || null],
      );

      // Update PO payment status and total paid amount
      const [payments] = await connection.execute(`SELECT SUM(amount) as total_paid FROM po_payments WHERE po_id = ?`, [poId]);

      const totalPaid = payments[0]?.total_paid || 0;
      const [poData] = await connection.execute(`SELECT total_amount FROM purchase_orders WHERE id = ?`, [poId]);

      const totalAmount = poData[0]?.total_amount || 0;
      let paymentStatus = "pending";

      if (totalPaid >= totalAmount) {
        paymentStatus = "paid";
      } else if (totalPaid > 0) {
        paymentStatus = "partial";
      }

      // Additional status logic for overdue payments
      const [poDetails] = await connection.execute(`SELECT po_date, expected_delivery_date FROM purchase_orders WHERE id = ?`, [poId]);

      if (poDetails[0]) {
        const poDate = new Date(poDetails[0].po_date);
        const expectedDelivery = poDetails[0].expected_delivery_date ? new Date(poDetails[0].expected_delivery_date) : null;
        const today = new Date();

        // If expected delivery date has passed and payment is not full, mark as overdue
        if (expectedDelivery && today > expectedDelivery && paymentStatus !== "paid") {
          paymentStatus = "overdue";
        }
      }

      await connection.execute(`UPDATE purchase_orders SET payment_status = ?, total_paid = ?, updated_at = NOW() WHERE id = ?`, [paymentStatus, totalPaid, poId]);

      await connection.commit();
      return { success: true, data: { id: result.insertId, payment_status: paymentStatus, total_paid: totalPaid } };
    } catch (error) {
      await connection.rollback();
      console.error("Error recording payment:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Get payment history
  static async getPaymentHistory(poId) {
    try {
      const [payments] = await pool.execute(
        `SELECT id, amount, payment_date, payment_mode as payment_method, reference_number, notes, created_at 
         FROM po_payments 
         WHERE po_id = ? 
         ORDER BY payment_date DESC, created_at DESC`,
        [poId],
      );

      return { success: true, data: payments };
    } catch (error) {
      console.error("Error fetching payment history:", error);
      return { success: false, error: error.message };
    }
  }
}

export default PurchaseOrderModel;
