import { ElectricityPaymentCycleModel } from "../models/ElectricityPaymentCycleModel.js";
import { ElectricityPaymentRecordModel } from "../models/ElectricityPaymentRecordModel.js";
import { ElectricityPaymentEntryModel } from "../models/ElectricityPaymentEntryModel.js";
import { ElectricityPaymentsService } from "../services/ElectricityPaymentsService.js";
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

export class ElectricityPaymentsController {
  static async renderElectricityPaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Electricity Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/electricity/index", {
        seo,
        pageKey: "ops/payments/electricity/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.renderElectricityPaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Electricity Payments — Error" },
        pageKey: "ops/payments/electricity/error",
        promo: false,
        user: req.user,
        title: "Unable to load Electricity Payments",
        message: "Something went wrong while loading the Electricity Payments module.",
        error,
      });
    }
  }

  static async renderElectricityPaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await ElectricityPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Electricity Payment Record — Not Found" },
          pageKey: "ops/payments/electricity/record-not-found",
          promo: false,
          user: req.user,
          title: "Electricity payment record not found",
          message: "We couldn't find the electricity payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, cycleResult] = await Promise.all([
        ElectricityPaymentEntryModel.listEntries(recordId),
        ElectricityPaymentCycleModel.getCycleById(recordResult.record.cycle_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.meter_name || "Meter"} — Electricity Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/electricity/record", {
        seo,
        pageKey: "ops/payments/electricity/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        selectedMonth,
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.renderElectricityPaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Electricity Payments — Error" },
        pageKey: "ops/payments/electricity/error",
        promo: false,
        user: req.user,
        title: "Unable to load electricity payment record",
        message: "Something went wrong while loading the electricity payment record.",
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

      const cycleResult = await ElectricityPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }

      const cycle = cycleResult.cycle;
      const recordsResult = await ElectricityPaymentRecordModel.listRecords({ cycleId: cycle.id });

      return res.json({
        success: true,
        cycle: cycle,
        records: recordsResult.success ? recordsResult.records : [],
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async recalculateCycle(req, res) {
    try {
      const { month, invoices } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const result = await ElectricityPaymentsService.calculateElectricityPayments(null, month, invoices);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to recalculate cycle" });
      }

      return res.json({
        success: true,
        cycle: result.cycle,
        records: result.records,
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.recalculateCycle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listRecords(req, res) {
    try {
      const { cycleId, status, limit = 200, offset = 0 } = req.query;
      const result = await ElectricityPaymentRecordModel.listRecords({
        cycleId: cycleId ? Number(cycleId) : null,
        status: status || null,
        limit: Number(limit),
        offset: Number(offset),
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list electricity payment records" });
      }
      return res.json({ success: true, records: result.records });
    } catch (error) {
      console.error("ElectricityPaymentsController.listRecords error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRecordById(req, res) {
    try {
      const { recordId } = req.params;
      const result = await ElectricityPaymentRecordModel.getRecordById(recordId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Electricity payment record not found" });
      }
      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ElectricityPaymentsController.getRecordById error:", error);
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

      const result = await ElectricityPaymentRecordModel.updateRecordStatus(recordId, status, paymentDate);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record status" });
      }

      await ElectricityPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ElectricityPaymentsController.updateRecordStatus error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordRemarks(req, res) {
    try {
      const { recordId } = req.params;
      const { remarks } = req.body;

      const result = await ElectricityPaymentRecordModel.updateRecordRemarks(recordId, remarks);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record remarks" });
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ElectricityPaymentsController.updateRecordRemarks error:", error);
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

      const result = await ElectricityPaymentRecordModel.updateInvoiceDetails(recordId, {
        invoice_amount,
        invoice_number,
        invoice_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update invoice details" });
      }

      // Update cycle aggregates
      if (result.record) {
        await ElectricityPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("ElectricityPaymentsController.updateInvoiceDetails error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createRecord(req, res) {
    try {
      const { month, meter_name, meter_type, invoice_amount, invoice_number, invoice_date } = req.body;

      if (!month || !meter_name || invoice_amount === undefined) {
        return res.status(400).json({ success: false, error: "Month, meter_name, and invoice_amount are required" });
      }

      // Get or create cycle
      let cycleResult = await ElectricityPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        cycleResult = await ElectricityPaymentCycleModel.createCycle({
          monthLike: month,
        });
      }

      if (!cycleResult.success || !cycleResult.cycle) {
        return res.status(500).json({ success: false, error: "Failed to get or create cycle" });
      }

      const invoiceAmount = toNumber(invoice_amount);
      const netPay = invoiceAmount; // Start with invoice amount, adjustments will be added later

      // Create payment record
      const recordResult = await ElectricityPaymentRecordModel.createRecord({
        cycle_id: cycleResult.cycle.id,
        meter_name: meter_name,
        meter_type: meter_type || 'commercial',
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
      await ElectricityPaymentCycleModel.updateCycleAggregates(cycleResult.cycle.id);

      return res.json({ success: true, record: recordResult.record });
    } catch (error) {
      console.error("ElectricityPaymentsController.createRecord error:", error);
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

      const result = await ElectricityPaymentEntryModel.createEntry({
        record_id: Number(recordId),
        entry_type,
        amount: toNumber(amount),
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create entry" });
      }

      const refreshResult = await ElectricityPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await ElectricityPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await ElectricityPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.createEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listEntries(req, res) {
    try {
      const { recordId } = req.params;
      const result = await ElectricityPaymentEntryModel.listEntries(recordId);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list entries" });
      }
      return res.json({ success: true, entries: result.entries });
    } catch (error) {
      console.error("ElectricityPaymentsController.listEntries error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      const result = await ElectricityPaymentEntryModel.updateEntry(entryId, {
        entry_type,
        amount: amount !== undefined ? toNumber(amount) : undefined,
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update entry" });
      }

      const entryResult = await ElectricityPaymentEntryModel.getEntryById(entryId);
      const recordId = entryResult.success ? entryResult.entry.record_id : null;

      if (recordId) {
        const refreshResult = await ElectricityPaymentRecordModel.refreshRecordAggregates(recordId);
        if (refreshResult.success && refreshResult.record) {
          await ElectricityPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
        }
      }

      const updatedRecord = recordId ? await ElectricityPaymentRecordModel.getRecordById(recordId) : null;

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord && updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.updateEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;

      const entryResult = await ElectricityPaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const recordId = entryResult.entry.record_id;

      const result = await ElectricityPaymentEntryModel.deleteEntry(entryId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete entry" });
      }

      const refreshResult = await ElectricityPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await ElectricityPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await ElectricityPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("ElectricityPaymentsController.deleteEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default ElectricityPaymentsController;


