import pool from "../../../db/pool.js";

export class InwardPoModel {
  static async createFromWebhook(poData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Accept both camelCase (from WMS webhook) and snake_case
      const wms_po_id = poData.wms_po_id || poData.poId;
      const wms_po_number = poData.wms_po_number || poData.poNumber;
      const warehouse_name = poData.warehouse_name || poData.warehouseName;
      const po_pdf_url = poData.po_pdf_url || poData.poPdfUrl || null;
      const rawDate = poData.expected_delivery_date || poData.expectedDate || null;
      const expected_delivery_date = rawDate ? rawDate.substring(0, 10) : null; // MySQL DATE format YYYY-MM-DD
      const notes = poData.notes || null;
      const items = poData.items || [];

      // Calculate totals from items (accept both camelCase and snake_case)
      // NOTE: WMS unit_cost is GST-inclusive (landing price)
      // So total = qty × unitCost, and GST is extracted (not added on top)
      let totalAmount = 0;
      let gstAmount = 0;
      for (const item of items) {
        const qty = parseFloat(item.ordered_qty || item.orderedQty || 0);
        const costInclGst = parseFloat(item.unit_cost || item.unitCost || 0);
        const gstPct = parseFloat(item.gst_pct || item.gstPct || 0);
        const lineTotal = qty * costInclGst; // GST inclusive
        const baseRate = gstPct > 0 ? lineTotal / (1 + gstPct / 100) : lineTotal;
        const lineGst = lineTotal - baseRate;
        totalAmount += lineTotal;
        gstAmount += lineGst;
      }
      const subtotal = totalAmount - gstAmount;

      const [result] = await connection.execute(
        `INSERT INTO inward_purchase_orders
         (wms_po_id, wms_po_number, warehouse_name, po_data, po_pdf_url,
          subtotal, gst_amount, total_amount, expected_delivery_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          wms_po_id,
          wms_po_number,
          warehouse_name || null,
          JSON.stringify(poData),
          po_pdf_url || null,
          subtotal,
          gstAmount,
          totalAmount,
          expected_delivery_date || null,
          notes || null,
        ],
      );

      const inwardPoId = result.insertId;

      for (const item of items) {
        const qty = parseFloat(item.ordered_qty || item.orderedQty || 0);
        const cost = parseFloat(item.unit_cost || item.unitCost || 0);
        const gstPct = parseFloat(item.gst_pct || item.gstPct || 0);
        const lineTotal = qty * cost;
        await connection.execute(
          `INSERT INTO inward_po_items
           (inward_po_id, product_name, sku, unit_of_measure,
            ordered_qty, unit_cost, gst_pct, line_total,
            wms_product_id, wms_variant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            inwardPoId,
            item.product_name || item.productName || null,
            item.sku || null,
            item.unit_of_measure || item.unitOfMeasure || null,
            qty,
            cost,
            gstPct,
            lineTotal,
            item.wms_product_id || item.productId || null,
            item.wms_variant_id || item.variantId || null,
          ],
        );
      }

      // Log initial status
      await connection.execute(
        `INSERT INTO inward_po_status_history
         (inward_po_id, from_status, to_status, notes)
         VALUES (?, NULL, 'received', 'PO received via webhook')`,
        [inwardPoId],
      );

      await connection.commit();
      return { success: true, data: { id: inwardPoId, wms_po_number } };
    } catch (error) {
      await connection.rollback();
      console.error("Error creating inward PO from webhook:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  static async processGrn(grnData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const wmsPoId = grnData.poId;
      if (!wmsPoId) {
        return { success: false, error: "Missing poId in GRN data" };
      }

      // 1. Find inward PO by wms_po_id
      const [pos] = await connection.execute(
        `SELECT id, status, po_data FROM inward_purchase_orders WHERE wms_po_id = ?`,
        [wmsPoId],
      );
      if (pos.length === 0) {
        await connection.rollback();
        return { success: false, error: `Inward PO not found for wms_po_id=${wmsPoId}` };
      }

      const inwardPo = pos[0];
      const inwardPoId = inwardPo.id;
      const oldStatus = inwardPo.status;

      // 2. Append GRN data to po_data JSON
      let poDataJson = {};
      try {
        poDataJson = typeof inwardPo.po_data === "string"
          ? JSON.parse(inwardPo.po_data)
          : inwardPo.po_data || {};
      } catch {
        poDataJson = {};
      }
      poDataJson.grn = {
        grnId: grnData.grnId,
        grnNumber: grnData.grnNumber,
        completedAt: grnData.completedAt,
        items: grnData.items,
      };

      await connection.execute(
        `UPDATE inward_purchase_orders SET po_data = ? WHERE id = ?`,
        [JSON.stringify(poDataJson), inwardPoId],
      );

      // 3. Update inward_po_items with received/accepted quantities
      const items = grnData.items || [];
      for (const item of items) {
        const receivedQty = item.receivedQty || 0;
        const acceptedQty = item.acceptedQty || 0;
        const quality = item.quality || null;

        // Match by wms_product_id + SKU (best effort)
        await connection.execute(
          `UPDATE inward_po_items
           SET received_qty = ?, accepted_qty = ?, quality = ?
           WHERE inward_po_id = ?
             AND (sku = ? OR product_name = ?)
           LIMIT 1`,
          [receivedQty, acceptedQty, quality, inwardPoId, item.sku, item.productName],
        );
      }

      // 4. Recalculate totals based on accepted quantities
      const [updatedItems] = await connection.execute(
        `SELECT accepted_qty, unit_cost, gst_pct FROM inward_po_items WHERE inward_po_id = ?`,
        [inwardPoId],
      );

      // unit_cost is GST-inclusive — extract GST, don't add
      let totalAmount = 0;
      let gstAmount = 0;
      for (const row of updatedItems) {
        const qty = Number(row.accepted_qty) || 0;
        const costInclGst = Number(row.unit_cost) || 0;
        const gstPct = Number(row.gst_pct) || 0;
        const lineTotal = qty * costInclGst;
        const baseRate = gstPct > 0 ? lineTotal / (1 + gstPct / 100) : lineTotal;
        totalAmount += lineTotal;
        gstAmount += lineTotal - baseRate;
      }
      const subtotal = totalAmount - gstAmount;

      // 5. Update PO status to processing
      await connection.execute(
        `UPDATE inward_purchase_orders SET status = 'processing' WHERE id = ?`,
        [inwardPoId],
      );
      await connection.execute(
        `INSERT INTO inward_po_status_history
         (inward_po_id, from_status, to_status, notes)
         VALUES (?, ?, 'processing', 'GRN received from WMS')`,
        [inwardPoId, oldStatus],
      );

      // 6. Auto-generate invoice
      const today = new Date().toISOString().slice(0, 10);
      const dateStr = today.replace(/-/g, "");
      const [seqRows] = await connection.execute(
        `SELECT COUNT(*) AS cnt FROM inward_po_invoices
         WHERE invoice_number LIKE ?`,
        [`INV-${dateStr}-%`],
      );
      const seq = (seqRows[0]?.cnt || 0) + 1;
      const invoiceNumber = `INV-${dateStr}-${String(seq).padStart(4, "0")}`;

      const [invoiceResult] = await connection.execute(
        `INSERT INTO inward_po_invoices
         (inward_po_id, invoice_number, invoice_date, subtotal,
          gst_amount, total_amount, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [
          inwardPoId,
          invoiceNumber,
          today,
          subtotal,
          gstAmount,
          totalAmount,
          `Auto-generated from GRN ${grnData.grnNumber || grnData.grnId}`,
        ],
      );
      const invoiceId = invoiceResult.insertId;

      // 7. Update PO status to invoiced
      await connection.execute(
        `UPDATE inward_purchase_orders SET status = 'invoiced' WHERE id = ?`,
        [inwardPoId],
      );
      await connection.execute(
        `INSERT INTO inward_po_status_history
         (inward_po_id, from_status, to_status, notes)
         VALUES (?, 'processing', 'invoiced', 'Auto-invoice generated from GRN')`,
        [inwardPoId],
      );

      await connection.commit();

      // 8. Fire-and-forget: send invoice to WMS
      InwardPoModel.sendAutoInvoiceToWms(wmsPoId, {
        invoiceId,
        invoiceNumber,
        invoiceDate: today,
        subtotal,
        gstAmount,
        totalAmount,
        grnNumber: grnData.grnNumber,
      }).catch((err) => {
        console.error("Auto-send invoice to WMS failed:", err);
      });

      return {
        success: true,
        data: {
          inwardPoId,
          invoiceId,
          invoiceNumber,
          subtotal,
          gstAmount,
          totalAmount,
        },
      };
    } catch (error) {
      await connection.rollback();
      console.error("Error processing GRN:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  static async sendAutoInvoiceToWms(wmsPoId, invoiceData) {
    const wmsApiUrl = process.env.WMS_API_URL || "http://localhost:4001/api/v1";
    const wmsApiKey = process.env.WMS_API_KEY || "dev-wms-key";

    const response = await fetch(`${wmsApiUrl}/purchase-orders/${wmsPoId}/supplier-invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": wmsApiKey,
      },
      body: JSON.stringify({
        invoice_number: invoiceData.invoiceNumber,
        invoice_date: invoiceData.invoiceDate,
        invoice_amount: invoiceData.subtotal,
        gst_amount: invoiceData.gstAmount,
        notes: `Auto-generated from GRN ${invoiceData.grnNumber}`,
      }),
    });

    if (response.ok) {
      // Update sent_to_wms_at on success
      await pool.execute(
        `UPDATE inward_po_invoices SET sent_to_wms_at = NOW() WHERE id = ?`,
        [invoiceData.invoiceId],
      );
    } else {
      const errBody = await response.text();
      console.error("WMS invoice push failed:", response.status, errBody);
    }
  }

  static async getAll(filters = {}) {
    try {
      let query = `
        SELECT ipo.*,
               inv.invoice_number,
               inv.invoice_date,
               inv.total_amount AS invoice_amount,
               inv.status AS invoice_status,
               inv.sent_to_wms_at,
               inv.payment_date,
               inv.payment_reference,
               JSON_UNQUOTE(JSON_EXTRACT(ipo.po_data, '$.grn.grnNumber')) AS grn_number,
               JSON_UNQUOTE(JSON_EXTRACT(ipo.po_data, '$.grn.completedAt')) AS grn_completed_at
        FROM inward_purchase_orders ipo
        LEFT JOIN inward_po_invoices inv ON ipo.id = inv.inward_po_id
        WHERE 1=1
      `;
      const params = [];

      if (filters.status) {
        query += ` AND ipo.status = ?`;
        params.push(filters.status);
      }
      if (filters.search) {
        query += ` AND (ipo.wms_po_number LIKE ? OR ipo.warehouse_name LIKE ?)`;
        const term = `%${filters.search}%`;
        params.push(term, term);
      }
      if (filters.has_grn === 'yes') {
        query += ` AND JSON_EXTRACT(ipo.po_data, '$.grn') IS NOT NULL`;
      } else if (filters.has_grn === 'no') {
        query += ` AND JSON_EXTRACT(ipo.po_data, '$.grn') IS NULL`;
      }
      if (filters.has_invoice === 'yes') {
        query += ` AND inv.id IS NOT NULL`;
      } else if (filters.has_invoice === 'no') {
        query += ` AND inv.id IS NULL`;
      }
      if (filters.from_date) {
        query += ` AND DATE(ipo.created_at) >= ?`;
        params.push(filters.from_date);
      }
      if (filters.to_date) {
        query += ` AND DATE(ipo.created_at) <= ?`;
        params.push(filters.to_date);
      }

      query += ` ORDER BY ipo.created_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ?`;
        params.push(Number(filters.limit));
        if (filters.offset) {
          query += ` OFFSET ?`;
          params.push(Number(filters.offset));
        }
      }

      const [rows] = await pool.query(query, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching inward POs:", error);
      return { success: false, error: error.message };
    }
  }

  static async getById(id) {
    try {
      const [pos] = await pool.execute(
        `SELECT * FROM inward_purchase_orders WHERE id = ?`,
        [id],
      );
      if (pos.length === 0) {
        return { success: false, error: "Inward PO not found" };
      }

      const po = pos[0];

      const [items] = await pool.execute(
        `SELECT * FROM inward_po_items WHERE inward_po_id = ? ORDER BY id`,
        [id],
      );

      const [invoices] = await pool.execute(
        `SELECT * FROM inward_po_invoices WHERE inward_po_id = ? ORDER BY created_at DESC`,
        [id],
      );

      const [statusHistory] = await pool.execute(
        `SELECT * FROM inward_po_status_history WHERE inward_po_id = ? ORDER BY created_at DESC`,
        [id],
      );

      return {
        success: true,
        data: { ...po, items, invoices, status_history: statusHistory },
      };
    } catch (error) {
      console.error("Error fetching inward PO detail:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateStatus(id, status, userId, notes) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        `SELECT status FROM inward_purchase_orders WHERE id = ?`,
        [id],
      );
      if (current.length === 0) {
        await connection.rollback();
        return { success: false, error: "Inward PO not found" };
      }

      const oldStatus = current[0].status;

      await connection.execute(
        `UPDATE inward_purchase_orders SET status = ? WHERE id = ?`,
        [status, id],
      );

      await connection.execute(
        `INSERT INTO inward_po_status_history
         (inward_po_id, from_status, to_status, notes, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [id, oldStatus, status, notes || null, userId || null],
      );

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Error updating inward PO status:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  static async getStats() {
    try {
      const [rows] = await pool.execute(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) AS received_count,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
          SUM(CASE WHEN status = 'invoiced' THEN 1 ELSE 0 END) AS invoiced_count,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
          SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) AS disputed_count,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
          SUM(total_amount) AS total_value,
          SUM(CASE WHEN status IN ('received','processing') THEN total_amount ELSE 0 END) AS pending_invoice_value,
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) AS paid_value
        FROM inward_purchase_orders
      `);
      return { success: true, data: rows[0] || {} };
    } catch (error) {
      console.error("Error fetching inward PO stats:", error);
      return { success: false, error: error.message };
    }
  }

  static async createInvoice(inwardPoId, invoiceData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        invoice_number,
        invoice_date,
        subtotal,
        gst_amount,
        total_amount,
        invoice_pdf_url,
        notes,
        created_by,
      } = invoiceData;

      const [result] = await connection.execute(
        `INSERT INTO inward_po_invoices
         (inward_po_id, invoice_number, invoice_date, subtotal,
          gst_amount, total_amount, invoice_pdf_url, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          inwardPoId,
          invoice_number,
          invoice_date || new Date().toISOString().slice(0, 10),
          subtotal || 0,
          gst_amount || 0,
          total_amount || 0,
          invoice_pdf_url || null,
          notes || null,
          created_by || null,
        ],
      );

      // Update PO status to invoiced
      const [current] = await connection.execute(
        `SELECT status FROM inward_purchase_orders WHERE id = ?`,
        [inwardPoId],
      );
      const oldStatus = current[0]?.status;

      if (oldStatus && oldStatus !== "paid") {
        await connection.execute(
          `UPDATE inward_purchase_orders SET status = 'invoiced' WHERE id = ?`,
          [inwardPoId],
        );
        await connection.execute(
          `INSERT INTO inward_po_status_history
           (inward_po_id, from_status, to_status, notes, created_by)
           VALUES (?, ?, 'invoiced', 'Invoice created', ?)`,
          [inwardPoId, oldStatus, created_by || null],
        );
      }

      await connection.commit();
      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      await connection.rollback();
      console.error("Error creating invoice:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  static async updateInvoiceStatus(invoiceId, status) {
    try {
      await pool.execute(
        `UPDATE inward_po_invoices SET status = ? WHERE id = ?`,
        [status, invoiceId],
      );
      return { success: true };
    } catch (error) {
      console.error("Error updating invoice status:", error);
      return { success: false, error: error.message };
    }
  }

  static async markAsPaid(invoiceId, paymentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { payment_date, payment_reference } = paymentData;

      await connection.execute(
        `UPDATE inward_po_invoices
         SET status = 'paid', payment_date = ?, payment_reference = ?
         WHERE id = ?`,
        [payment_date || new Date().toISOString().slice(0, 10), payment_reference || null, invoiceId],
      );

      // Get the parent PO
      const [inv] = await connection.execute(
        `SELECT inward_po_id FROM inward_po_invoices WHERE id = ?`,
        [invoiceId],
      );
      if (inv.length > 0) {
        const poId = inv[0].inward_po_id;
        const [current] = await connection.execute(
          `SELECT status FROM inward_purchase_orders WHERE id = ?`,
          [poId],
        );
        const oldStatus = current[0]?.status;

        await connection.execute(
          `UPDATE inward_purchase_orders SET status = 'paid' WHERE id = ?`,
          [poId],
        );
        await connection.execute(
          `INSERT INTO inward_po_status_history
           (inward_po_id, from_status, to_status, notes)
           VALUES (?, ?, 'paid', 'Invoice marked as paid')`,
          [poId, oldStatus],
        );
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Error marking invoice as paid:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  static async getInvoiceById(invoiceId) {
    try {
      const [rows] = await pool.execute(
        `SELECT inv.*, ipo.wms_po_number, ipo.warehouse_name
         FROM inward_po_invoices inv
         JOIN inward_purchase_orders ipo ON inv.inward_po_id = ipo.id
         WHERE inv.id = ?`,
        [invoiceId],
      );
      if (rows.length === 0) {
        return { success: false, error: "Invoice not found" };
      }
      return { success: true, data: rows[0] };
    } catch (error) {
      console.error("Error fetching invoice:", error);
      return { success: false, error: error.message };
    }
  }
}
