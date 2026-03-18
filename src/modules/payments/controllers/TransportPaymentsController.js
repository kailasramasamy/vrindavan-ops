import { TransportPaymentCycleModel } from "../models/TransportPaymentCycleModel.js";
import { TransportPaymentRecordModel } from "../models/TransportPaymentRecordModel.js";
import { TransportPaymentEntryModel } from "../models/TransportPaymentEntryModel.js";
import { TransportPaymentsService } from "../services/TransportPaymentsService.js";
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

export class TransportPaymentsController {
  static async renderTransportPaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Transport Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/transport/index", {
        seo,
        pageKey: "ops/payments/transport/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("TransportPaymentsController.renderTransportPaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Transport Payments — Error" },
        pageKey: "ops/payments/transport/error",
        promo: false,
        user: req.user,
        title: "Unable to load Transport Payments",
        message: "Something went wrong while loading the Transport Payments module.",
        error,
      });
    }
  }

  static async renderTransportPaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await TransportPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Transport Payment Record — Not Found" },
          pageKey: "ops/payments/transport/record-not-found",
          promo: false,
          user: req.user,
          title: "Transport payment record not found",
          message: "We couldn't find the transport payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, cycleResult] = await Promise.all([
        TransportPaymentEntryModel.listEntries(recordId),
        TransportPaymentCycleModel.getCycleById(recordResult.record.cycle_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.vehicle_name || "Vehicle"} — Transport Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/transport/record", {
        seo,
        pageKey: "ops/payments/transport/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        selectedMonth,
      });
    } catch (error) {
      console.error("TransportPaymentsController.renderTransportPaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Transport Payments — Error" },
        pageKey: "ops/payments/transport/error",
        promo: false,
        user: req.user,
        title: "Unable to load transport payment record",
        message: "Something went wrong while loading the transport payment record.",
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

      const cycleResult = await TransportPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }

      const cycle = cycleResult.cycle;
      const recordsResult = await TransportPaymentRecordModel.listRecords({ cycleId: cycle.id });

      return res.json({
        success: true,
        cycle: cycle,
        records: recordsResult.success ? recordsResult.records : [],
      });
    } catch (error) {
      console.error("TransportPaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async recalculateCycle(req, res) {
    try {
      const { month, vehicles } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const result = await TransportPaymentsService.calculateTransportPayments(null, month, vehicles);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to recalculate cycle" });
      }

      return res.json({
        success: true,
        cycle: result.cycle,
        records: result.records,
      });
    } catch (error) {
      console.error("TransportPaymentsController.recalculateCycle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listRecords(req, res) {
    try {
      const { cycleId, status, limit = 200, offset = 0 } = req.query;
      const result = await TransportPaymentRecordModel.listRecords({
        cycleId: cycleId ? Number(cycleId) : null,
        status: status || null,
        limit: Number(limit),
        offset: Number(offset),
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list transport payment records" });
      }
      return res.json({ success: true, records: result.records });
    } catch (error) {
      console.error("TransportPaymentsController.listRecords error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRecordById(req, res) {
    try {
      const { recordId } = req.params;
      const result = await TransportPaymentRecordModel.getRecordById(recordId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Transport payment record not found" });
      }
      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("TransportPaymentsController.getRecordById error:", error);
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

      const result = await TransportPaymentRecordModel.updateRecordStatus(recordId, status, paymentDate);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record status" });
      }

      await TransportPaymentCycleModel.updateCycleAggregates(result.record.cycle_id);

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("TransportPaymentsController.updateRecordStatus error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordRemarks(req, res) {
    try {
      const { recordId } = req.params;
      const { remarks } = req.body;

      const result = await TransportPaymentRecordModel.updateRecordRemarks(recordId, remarks);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record remarks" });
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("TransportPaymentsController.updateRecordRemarks error:", error);
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

      const result = await TransportPaymentEntryModel.createEntry({
        record_id: Number(recordId),
        entry_type,
        amount: toNumber(amount),
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create entry" });
      }

      const refreshResult = await TransportPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await TransportPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await TransportPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("TransportPaymentsController.createEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listEntries(req, res) {
    try {
      const { recordId } = req.params;
      const result = await TransportPaymentEntryModel.listEntries(recordId);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list entries" });
      }
      return res.json({ success: true, entries: result.entries });
    } catch (error) {
      console.error("TransportPaymentsController.listEntries error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      const result = await TransportPaymentEntryModel.updateEntry(entryId, {
        entry_type,
        amount: amount !== undefined ? toNumber(amount) : undefined,
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update entry" });
      }

      const entryResult = await TransportPaymentEntryModel.getEntryById(entryId);
      const recordId = entryResult.success ? entryResult.entry.record_id : null;

      if (recordId) {
        const refreshResult = await TransportPaymentRecordModel.refreshRecordAggregates(recordId);
        if (refreshResult.success && refreshResult.record) {
          await TransportPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
        }
      }

      const updatedRecord = recordId ? await TransportPaymentRecordModel.getRecordById(recordId) : null;

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord && updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("TransportPaymentsController.updateEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;

      const entryResult = await TransportPaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const recordId = entryResult.entry.record_id;

      const result = await TransportPaymentEntryModel.deleteEntry(entryId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete entry" });
      }

      const refreshResult = await TransportPaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await TransportPaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await TransportPaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("TransportPaymentsController.deleteEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default TransportPaymentsController;

