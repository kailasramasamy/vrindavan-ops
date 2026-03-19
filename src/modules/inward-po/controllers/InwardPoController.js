import { buildSEO } from "../../../utils/seo.js";
import { InwardPoModel } from "../models/InwardPoModel.js";

export class InwardPoController {
  static async getDashboard(req, res) {
    try {
      const filters = {
        status: req.query.status || null,
        search: req.query.search || null,
        has_grn: req.query.has_grn || null,
        has_invoice: req.query.has_invoice || null,
        from_date: req.query.from_date || null,
        to_date: req.query.to_date || null,
        limit: 20,
      };
      const statsResult = await InwardPoModel.getStats();
      const recentResult = await InwardPoModel.getAll(filters);

      const seo = buildSEO({ title: "Inward POs Dashboard", url: req.path });
      res.render("pages/ops/inward-po/dashboard", {
        seo,
        section: "Inward PO",
        subsection: "Dashboard",
        user: req.user,
        stats: statsResult.success ? statsResult.data : {},
        recentPOs: recentResult.success ? recentResult.data : [],
        filters,
      });
    } catch (error) {
      console.error("Error rendering inward PO dashboard:", error);
      res.status(500).send("Error loading inward PO dashboard");
    }
  }

  static async getPoList(req, res) {
    try {
      const filters = {
        status: req.query.status || null,
        search: req.query.search || null,
        from_date: req.query.from_date || null,
        to_date: req.query.to_date || null,
      };
      const result = await InwardPoModel.getAll(filters);

      const seo = buildSEO({ title: "Inward POs List", url: req.path });
      res.render("pages/ops/inward-po/list", {
        seo,
        section: "Inward PO",
        subsection: "List",
        user: req.user,
        pos: result.success ? result.data : [],
        filters,
      });
    } catch (error) {
      console.error("Error rendering inward PO list:", error);
      res.status(500).send("Error loading inward PO list");
    }
  }

  static async getPoDetail(req, res) {
    try {
      const { id } = req.params;
      const result = await InwardPoModel.getById(id);

      if (!result.success) {
        return res.status(404).send("Inward PO not found");
      }

      const seo = buildSEO({ title: `Inward PO #${result.data.wms_po_number}`, url: req.path });
      res.render("pages/ops/inward-po/detail", {
        seo,
        section: "Inward PO",
        subsection: "Detail",
        user: req.user,
        po: result.data,
      });
    } catch (error) {
      console.error("Error rendering inward PO detail:", error);
      res.status(500).send("Error loading inward PO detail");
    }
  }

  static async createInvoice(req, res) {
    try {
      const { id } = req.params;
      const invoiceData = {
        ...req.body,
        created_by: req.user?.id || null,
      };

      const result = await InwardPoModel.createInvoice(id, invoiceData);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result.data });
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ success: false, error: "Failed to create invoice" });
    }
  }

  static async downloadInvoicePdf(req, res) {
    try {
      const { id } = req.params;
      const result = await InwardPoModel.getById(id);
      if (!result.success || !result.data) {
        return res.status(404).send("Inward PO not found");
      }

      const po = result.data;
      const invoice = po.invoices?.[0];
      const invoiceNumber = invoice?.invoice_number || "invoice";

      // Parse supplier info from webhook po_data
      let poDataObj = {};
      try {
        poDataObj = typeof po.po_data === "string" ? JSON.parse(po.po_data) : po.po_data || {};
      } catch { poDataObj = {}; }

      const { generateInvoicePdf } = await import("../../../utils/invoice-pdf.js");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoiceNumber}.pdf"`);

      generateInvoicePdf({
        invoiceNumber,
        invoiceDate: invoice?.invoice_date
          ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
          : new Date().toLocaleDateString("en-IN"),
        poNumber: po.wms_po_number,
        supplier: {
          name: poDataObj.supplierName || "Vrindavan Dairy LLP",
          contactName: poDataObj.supplierContact || null,
          phone: poDataObj.supplierPhone || null,
          email: poDataObj.supplierEmail || null,
          address: poDataObj.supplierAddress || null,
          gstNumber: poDataObj.supplierGstn || null,
        },
        buyer: {
          name: poDataObj.buyerName || "Think Fresh",
          entityName: poDataObj.buyerEntityName || null,
          address: poDataObj.buyerAddress || null,
          phone: poDataObj.buyerPhone || null,
          email: poDataObj.buyerEmail || null,
          gstn: poDataObj.buyerGstn || null,
        },
        warehouse: {
          name: po.warehouse_name || poDataObj.warehouseName || "Warehouse",
          code: poDataObj.warehouseCode || "",
          address: poDataObj.warehouseAddress || null,
        },
        items: po.items || [],
        notes: invoice?.notes || null,
      }, res);
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      res.status(500).send("Failed to generate invoice PDF");
    }
  }

  static async sendInvoiceToWms(req, res) {
    try {
      const { id } = req.params;
      const { invoice_id } = req.body;

      const invoiceResult = await InwardPoModel.getInvoiceById(invoice_id);
      if (!invoiceResult.success) {
        return res.status(404).json({ success: false, error: "Invoice not found" });
      }

      const wmsApiUrl = process.env.WMS_API_URL || "http://localhost:4001/api/v1";
      const wmsApiKey = process.env.WMS_API_KEY || "dev-wms-key";

      const response = await fetch(`${wmsApiUrl}/po/invoice-received`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": wmsApiKey,
        },
        body: JSON.stringify({
          wms_po_number: invoiceResult.data.wms_po_number,
          invoice_number: invoiceResult.data.invoice_number,
          invoice_date: invoiceResult.data.invoice_date,
          total_amount: invoiceResult.data.total_amount,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("WMS API error:", errBody);
        return res.status(502).json({
          success: false,
          error: "Failed to send invoice to WMS",
        });
      }

      // Update invoice status to sent
      await InwardPoModel.updateInvoiceStatus(invoice_id, "sent");

      // Record sent timestamp
      const pool = (await import("../../../db/pool.js")).default;
      await pool.execute(
        `UPDATE inward_po_invoices SET sent_to_wms_at = NOW() WHERE id = ?`,
        [invoice_id],
      );

      res.json({ success: true, message: "Invoice sent to WMS" });
    } catch (error) {
      console.error("Error sending invoice to WMS:", error);
      res.status(500).json({ success: false, error: "Failed to send invoice to WMS" });
    }
  }

  // API endpoints for AJAX calls
  static async apiUpdateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const userId = req.user?.id || null;

      const result = await InwardPoModel.updateStatus(id, status, userId, notes);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ success: false, error: "Failed to update status" });
    }
  }

  static async apiMarkAsPaid(req, res) {
    try {
      const { invoice_id, payment_date, payment_reference } = req.body;

      const result = await InwardPoModel.markAsPaid(invoice_id, {
        payment_date,
        payment_reference,
      });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking as paid:", error);
      res.status(500).json({ success: false, error: "Failed to mark as paid" });
    }
  }

  static async apiGetStats(req, res) {
    try {
      const result = await InwardPoModel.getStats();
      res.json({ success: result.success, data: result.data });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  }
}
