import { ItServicesPaymentCycleModel } from "../models/ItServicesPaymentCycleModel.js";
import { ItServicesPaymentRecordModel } from "../models/ItServicesPaymentRecordModel.js";
import { ItServicesPaymentEntryModel } from "../models/ItServicesPaymentEntryModel.js";
import { ItServicesPaymentsService } from "../services/ItServicesPaymentsService.js";
import { buildSEO } from "../../../utils/seo.js";

function parseMonth(queryMonth) {
  if (!queryMonth) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
    return `${year}-${month}`;
  }
  return queryMonth;
}

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class ItServicesPaymentsController {
  static async renderItServicesPaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "IT Services Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/it-services/index", {
        seo,
        pageKey: "ops/payments/it-services/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.renderItServicesPaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "IT Services Payments — Error" },
        pageKey: "ops/payments/it-services/error",
        promo: false,
        user: req.user,
        title: "Unable to load IT Services Payments",
        message: "Something went wrong while loading the IT Services Payments module.",
        error,
      });
    }
  }

  static async renderItServicesPaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await ItServicesPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "IT Services Payment Record — Not Found" },
          pageKey: "ops/payments/it-services/record-not-found",
          promo: false,
          user: req.user,
          title: "IT services payment record not found",
          message: "We couldn't find the IT services payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, cycleResult] = await Promise.all([
        ItServicesPaymentEntryModel.listEntries(recordId),
        ItServicesPaymentCycleModel.getCycleById(recordResult.record.cycle_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.service_name || "Service"} — IT Services Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/it-services/record", {
        seo,
        pageKey: "ops/payments/it-services/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        selectedMonth,
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.renderItServicesPaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "IT Services Payments — Error" },
        pageKey: "ops/payments/it-services/error",
        promo: false,
        user: req.user,
        title: "Unable to load IT services payment record",
        message: "Something went wrong while loading the IT services payment record.",
        error,
      });
    }
  }

  static async getCycleByMonth(req, res) {
    try {
      const { month } = req.query;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const cycleResult = await ItServicesPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }

      const cycle = cycleResult.cycle;
      const recordsResult = await ItServicesPaymentRecordModel.listRecords({ cycleId: cycle.id });

      return res.json({
        success: true,
        cycle: cycle,
        records: recordsResult.success ? recordsResult.records : [],
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async recalculateCycle(req, res) {
    try {
      const { month, invoices } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const result = await ItServicesPaymentsService.calculateItServicesPayments(null, month, invoices);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to recalculate cycle" });
      }

      return res.json({
        success: true,
        cycle: result.cycle,
        records: result.records,
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.recalculateCycle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listRecords(req, res) {
    try {
      const { cycleId, status, limit = 200, offset = 0 } = req.query;
      const result = await ItServicesPaymentRecordModel.listRecords({
        cycleId: cycleId ? Number(cycleId) : null,
        status: status || null,
        limit: Number(limit),
        offset: Number(offset),
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list IT services payment records" });
      }
      return res.json({ success: true, records: result.records });
    } catch (error) {
      console.error("ItServicesPaymentsController.listRecords error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRecordById(req, res) {
    try {
      const { recordId } = req.params;
      const result = await ItServicesPaymentRecordModel.getRecordById(recordId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "IT services payment record not found" });
      }
      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ItServicesPaymentsController.getRecordById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordStatus(req, res) {
    try {
      const { recordId } = req.params;
      const { status, paymentDate } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, error: "Status is required" });
      }

      const result = await ItServicesPaymentRecordModel.updateRecordStatus(recordId, status, paymentDate);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record status" });
      }

      await ItServicesPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ItServicesPaymentsController.updateRecordStatus error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordRemarks(req, res) {
    try {
      const { recordId } = req.params;
      const { remarks } = req.body;

      const result = await ItServicesPaymentRecordModel.updateRecordRemarks(recordId, remarks);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record remarks" });
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ItServicesPaymentsController.updateRecordRemarks error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateInvoiceDetails(req, res) {
    try {
      const { recordId } = req.params;
      const { invoice_amount, invoice_number, invoice_date } = req.body;

      if (invoice_amount === undefined && invoice_number === undefined && invoice_date === undefined) {
        return res.status(400).json({ success: false, error: "At least one invoice field is required" });
      }

      const result = await ItServicesPaymentRecordModel.updateInvoiceDetails(recordId, {
        invoice_amount,
        invoice_number,
        invoice_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update invoice details" });
      }

      // Update cycle aggregates
      if (result.record) {
        await ItServicesPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ItServicesPaymentsController.updateInvoiceDetails error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createRecordFromService(req, res) {
    try {
      const { month, service_id, invoice_amount, invoice_number, invoice_date } = req.body;

      if (!month || !service_id || invoice_amount === undefined) {
        return res.status(400).json({ success: false, error: "Month, service_id, and invoice_amount are required" });
      }

      // Get or create cycle
      let cycleResult = await ItServicesPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        cycleResult = await ItServicesPaymentCycleModel.createCycle({
          monthLike: month,
        });
      }

      if (!cycleResult.success || !cycleResult.cycle) {
        return res.status(500).json({ success: false, error: "Failed to get or create cycle" });
      }

      // Fetch service details
      const { ItServiceModel } = await import("../../it-services/models/ItServiceModel.js");
      const serviceResult = await ItServiceModel.getServiceById(service_id);
      if (!serviceResult.success) {
        return res.status(404).json({ success: false, error: "IT service not found" });
      }

      const service = serviceResult.service;
      const invoiceAmount = toNumber(invoice_amount);
      const netPay = invoiceAmount; // Start with invoice amount, adjustments will be added later

      // Create payment record
      const recordResult = await ItServicesPaymentRecordModel.createRecord({
        cycle_id: cycleResult.cycle.id,
        service_name: service.service_name,
        service_type: service.service_type || 'other',
        invoice_number: invoice_number || null,
        invoice_date: invoice_date || null,
        invoice_amount: invoiceAmount,
        total_adjustments: 0,
        net_pay: netPay,
      });

      if (!recordResult.success) {
        return res.status(500).json({ success: false, error: recordResult.error || "Unable to create payment record" });
      }

      // Update cycle aggregates
      await ItServicesPaymentCycleModel.updateCycleAggregates(cycleResult.cycle.id);

      return res.json({ success: true, record: recordResult.record });
    } catch (error) {
      console.error("ItServicesPaymentsController.createRecordFromService error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createEntry(req, res) {
    try {
      const { recordId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      if (!entry_type || amount === undefined) {
        return res.status(400).json({ success: false, error: "Entry type and amount are required" });
      }

      const result = await ItServicesPaymentEntryModel.createEntry({
        record_id: Number(recordId),
        entry_type,
        amount: toNumber(amount),
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create entry" });
      }

      const refreshResult = await ItServicesPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await ItServicesPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await ItServicesPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.createEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listEntries(req, res) {
    try {
      const { recordId } = req.params;
      const result = await ItServicesPaymentEntryModel.listEntries(recordId);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list entries" });
      }
      return res.json({ success: true, entries: result.entries });
    } catch (error) {
      console.error("ItServicesPaymentsController.listEntries error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      const result = await ItServicesPaymentEntryModel.updateEntry(entryId, {
        entry_type,
        amount: amount !== undefined ? toNumber(amount) : undefined,
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update entry" });
      }

      const entryResult = await ItServicesPaymentEntryModel.getEntryById(entryId);
      const recordId = entryResult.success ? entryResult.entry.record_id : null;

      if (recordId) {
        const refreshResult = await ItServicesPaymentRecordModel.refreshRecordAggregates(recordId);
        if (refreshResult.success && refreshResult.record) {
          await ItServicesPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
        }
      }

      const updatedRecord = recordId ? await ItServicesPaymentRecordModel.getRecordById(recordId) : null;

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord && updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.updateEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;

      const entryResult = await ItServicesPaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const recordId = entryResult.entry.record_id;

      const result = await ItServicesPaymentEntryModel.deleteEntry(entryId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete entry" });
      }

      const refreshResult = await ItServicesPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await ItServicesPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await ItServicesPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ItServicesPaymentsController.deleteEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default ItServicesPaymentsController;

