import { RentPaymentCycleModel } from "../models/RentPaymentCycleModel.js";
import { RentPaymentRecordModel } from "../models/RentPaymentRecordModel.js";
import { RentPaymentEntryModel } from "../models/RentPaymentEntryModel.js";
import { RentPaymentsService } from "../services/RentPaymentsService.js";
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

export class RentPaymentsController {
  static async renderRentPaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Rent Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/rent/index", {
        seo,
        pageKey: "ops/payments/rent/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("RentPaymentsController.renderRentPaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Rent Payments — Error" },
        pageKey: "ops/payments/rent/error",
        promo: false,
        user: req.user,
        title: "Unable to load Rent Payments",
        message: "Something went wrong while loading the Rent Payments module.",
        error,
      });
    }
  }

  static async renderRentPaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await RentPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Rent Payment Record — Not Found" },
          pageKey: "ops/payments/rent/record-not-found",
          promo: false,
          user: req.user,
          title: "Rent payment record not found",
          message: "We couldn't find the rent payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, cycleResult] = await Promise.all([
        RentPaymentEntryModel.listEntries(recordId),
        RentPaymentCycleModel.getCycleById(recordResult.record.cycle_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.property_name || "Property"} — Rent Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/rent/record", {
        seo,
        pageKey: "ops/payments/rent/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        selectedMonth,
      });
    } catch (error) {
      console.error("RentPaymentsController.renderRentPaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Rent Payments — Error" },
        pageKey: "ops/payments/rent/error",
        promo: false,
        user: req.user,
        title: "Unable to load rent payment record",
        message: "Something went wrong while loading the rent payment record.",
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

      const cycleResult = await RentPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }

      const cycle = cycleResult.cycle;
      const recordsResult = await RentPaymentRecordModel.listRecords({ cycleId: cycle.id });

      return res.json({
        success: true,
        cycle: cycle,
        records: recordsResult.success ? recordsResult.records : [],
      });
    } catch (error) {
      console.error("RentPaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async recalculateCycle(req, res) {
    try {
      const { month, properties } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const result = await RentPaymentsService.calculateRentPayments(null, month, properties);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to recalculate cycle" });
      }

      return res.json({
        success: true,
        cycle: result.cycle,
        records: result.records,
      });
    } catch (error) {
      console.error("RentPaymentsController.recalculateCycle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listRecords(req, res) {
    try {
      const { cycleId, status, limit = 200, offset = 0 } = req.query;
      const result = await RentPaymentRecordModel.listRecords({
        cycleId: cycleId ? Number(cycleId) : null,
        status: status || null,
        limit: Number(limit),
        offset: Number(offset),
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list rent payment records" });
      }
      return res.json({ success: true, records: result.records });
    } catch (error) {
      console.error("RentPaymentsController.listRecords error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRecordById(req, res) {
    try {
      const { recordId } = req.params;
      const result = await RentPaymentRecordModel.getRecordById(recordId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Rent payment record not found" });
      }
      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("RentPaymentsController.getRecordById error:", error);
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

      const result = await RentPaymentRecordModel.updateRecordStatus(recordId, status, paymentDate);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record status" });
      }

      await RentPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("RentPaymentsController.updateRecordStatus error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordRemarks(req, res) {
    try {
      const { recordId } = req.params;
      const { remarks } = req.body;

      const result = await RentPaymentRecordModel.updateRecordRemarks(recordId, remarks);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record remarks" });
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("RentPaymentsController.updateRecordRemarks error:", error);
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

      const result = await RentPaymentEntryModel.createEntry({
        record_id: Number(recordId),
        entry_type,
        amount: toNumber(amount),
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create entry" });
      }

      const refreshResult = await RentPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await RentPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await RentPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("RentPaymentsController.createEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listEntries(req, res) {
    try {
      const { recordId } = req.params;
      const result = await RentPaymentEntryModel.listEntries(recordId);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list entries" });
      }
      return res.json({ success: true, entries: result.entries });
    } catch (error) {
      console.error("RentPaymentsController.listEntries error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      const result = await RentPaymentEntryModel.updateEntry(entryId, {
        entry_type,
        amount: amount !== undefined ? toNumber(amount) : undefined,
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update entry" });
      }

      const entryResult = await RentPaymentEntryModel.getEntryById(entryId);
      const recordId = entryResult.success ? entryResult.entry.record_id : null;

      if (recordId) {
        const refreshResult = await RentPaymentRecordModel.refreshRecordAggregates(recordId);
        if (refreshResult.success && refreshResult.record) {
          await RentPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
        }
      }

      const updatedRecord = recordId ? await RentPaymentRecordModel.getRecordById(recordId) : null;

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord && updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("RentPaymentsController.updateEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;

      const entryResult = await RentPaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const recordId = entryResult.entry.record_id;

      const result = await RentPaymentEntryModel.deleteEntry(entryId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete entry" });
      }

      const refreshResult = await RentPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await RentPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await RentPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("RentPaymentsController.deleteEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default RentPaymentsController;

