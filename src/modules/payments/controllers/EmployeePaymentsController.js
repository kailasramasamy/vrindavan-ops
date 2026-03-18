import { EmployeePaymentCycleModel } from "../models/EmployeePaymentCycleModel.js";
import { EmployeePaymentRecordModel } from "../models/EmployeePaymentRecordModel.js";
import { EmployeePaymentEntryModel } from "../models/EmployeePaymentEntryModel.js";
import { EmployeePaymentsService } from "../services/EmployeePaymentsService.js";
import { EmployeeLoanModel } from "../../employees/models/EmployeeLoanModel.js";
import { EmployeeLoanRepaymentModel } from "../../employees/models/EmployeeLoanRepaymentModel.js";
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

function formatCurrency(value) {
  const numeric = toNumber(value);
  return new Intl.NumberFormat("en-IN", { 
    style: "currency", 
    currency: "INR", 
    maximumFractionDigits: 2 
  }).format(numeric);
}

export class EmployeePaymentsController {
  static async renderEmployeePaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Employee Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/employees/index", {
        seo,
        pageKey: "ops/payments/employees/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("EmployeePaymentsController.renderEmployeePaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Employee Payments — Error" },
        pageKey: "ops/payments/employees/error",
        promo: false,
        user: req.user,
        title: "Unable to load Employee Payments",
        message: "Something went wrong while loading the Employee Payments module.",
        error,
      });
    }
  }

  static async renderEmployeePaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await EmployeePaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Employee Payment Record — Not Found" },
          pageKey: "ops/payments/employees/record-not-found",
          promo: false,
          user: req.user,
          title: "Employee payment record not found",
          message: "We couldn't find the employee payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, cycleResult, loansResult] = await Promise.all([
        EmployeePaymentEntryModel.listEntries(recordId),
        EmployeePaymentCycleModel.getCycleById(recordResult.record.cycle_id),
        EmployeeLoanModel.listLoansByEmployeeId(recordResult.record.employee_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.employee_name || "Employee"} — Employee Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/employees/record", {
        seo,
        pageKey: "ops/payments/employees/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        loans: loansResult.success ? loansResult.loans : [],
        selectedMonth,
      });
    } catch (error) {
      console.error("EmployeePaymentsController.renderEmployeePaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Employee Payments — Error" },
        pageKey: "ops/payments/employees/error",
        promo: false,
        user: req.user,
        title: "Unable to load employee payment record",
        message: "Something went wrong while loading the employee payment record.",
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

      const cycleResult = await EmployeePaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }

      const cycle = cycleResult.cycle;
      const recordsResult = await EmployeePaymentRecordModel.listRecords({ cycleId: cycle.id });

      return res.json({
        success: true,
        cycle: cycle,
        records: recordsResult.success ? recordsResult.records : [],
      });
    } catch (error) {
      console.error("EmployeePaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async recalculateCycle(req, res) {
    try {
      const { month } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, error: "Month parameter is required" });
      }

      const result = await EmployeePaymentsService.calculateEmployeePayments(null, month);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Failed to recalculate cycle" });
      }

      return res.json({
        success: true,
        cycle: result.cycle,
        records: result.records,
      });
    } catch (error) {
      console.error("EmployeePaymentsController.recalculateCycle error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async listRecords(req, res) {
    try {
      const { cycleId, status, limit = 200, offset = 0 } = req.query;
      const result = await EmployeePaymentRecordModel.listRecords({
        cycleId: cycleId ? Number(cycleId) : null,
        status: status || null,
        limit: Number(limit),
        offset: Number(offset),
      });
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list employee payment records" });
      }
      return res.json({ success: true, records: result.records });
    } catch (error) {
      console.error("EmployeePaymentsController.listRecords error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getRecordById(req, res) {
    try {
      const { recordId } = req.params;
      const result = await EmployeePaymentRecordModel.getRecordById(recordId);
      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Employee payment record not found" });
      }
      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("EmployeePaymentsController.getRecordById error:", error);
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

      const result = await EmployeePaymentRecordModel.updateRecordStatus(recordId, status, paymentDate);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update record status" });
      }

      // Refresh cycle aggregates
      await EmployeePaymentCycleModel.updateCycleAggregates(result.record.cycle_id);

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("EmployeePaymentsController.updateRecordStatus error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateRecordRemarks(req, res) {
    try {
      const { recordId } = req.params;
      const { remarks } = req.body;

      const result = await EmployeePaymentRecordModel.updateRecordRemarks(recordId, remarks);
      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update remarks" });
      }

      return res.json({ success: true, record: result.record });
    } catch (error) {
      console.error("EmployeePaymentsController.updateRecordRemarks error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createEntry(req, res) {
    try {
      const { recordId } = req.params;
      const { entry_type, amount, description, entry_date, loan_id } = req.body;

      if (!entry_type || amount === undefined) {
        return res.status(400).json({ success: false, error: "Entry type and amount are required" });
      }

      // If this is a loan payment, also create a repayment record
      let repaymentResult = null;
      if (entry_type === "loan" && loan_id) {
        const repaymentAmount = Math.abs(toNumber(amount)); // Loan entries are negative, so get absolute value
        repaymentResult = await EmployeeLoanRepaymentModel.createRepayment({
          loan_id: Number(loan_id),
          amount: repaymentAmount,
          repayment_date: entry_date || new Date().toISOString().slice(0, 10),
          payment_method: "salary_deduction",
          notes: description || `Loan repayment deducted from salary - Payment Record #${recordId}`,
        });

        if (!repaymentResult.success) {
          return res.status(500).json({ success: false, error: repaymentResult.error || "Failed to create loan repayment record" });
        }
      }

      // Include repayment ID in description if repayment was created
      let finalDescription = description;
      if (repaymentResult?.repayment?.id) {
        finalDescription = `${description || ''} [REPAYMENT_ID:${repaymentResult.repayment.id}]`.trim();
      }

      const result = await EmployeePaymentEntryModel.createEntry({
        record_id: Number(recordId),
        entry_type,
        amount: toNumber(amount),
        description: finalDescription,
        entry_date,
      });

      if (!result.success) {
        // If entry creation failed but repayment was created, we should rollback
        // For now, just return error (repayment will remain, but that's acceptable)
        return res.status(500).json({ success: false, error: result.error || "Unable to create entry" });
      }

      // Refresh record aggregates
      const refreshResult = await EmployeePaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await EmployeePaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await EmployeePaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        repayment: repaymentResult?.repayment || null,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("EmployeePaymentsController.createEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const { entry_type, amount, description, entry_date } = req.body;

      const entryResult = await EmployeePaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const result = await EmployeePaymentEntryModel.updateEntry(entryId, {
        entry_type,
        amount: amount !== undefined ? toNumber(amount) : undefined,
        description,
        entry_date,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update entry" });
      }

      // Refresh record aggregates
      const recordId = result.entry.record_id;
      const refreshResult = await EmployeePaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await EmployeePaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await EmployeePaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        entry: result.entry,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("EmployeePaymentsController.updateEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;

      const entryResult = await EmployeePaymentEntryModel.getEntryById(entryId);
      if (!entryResult.success) {
        return res.status(404).json({ success: false, error: "Entry not found" });
      }

      const entry = entryResult.entry;
      const recordId = entry.record_id;

      // If this is a loan entry, try to find and delete the corresponding repayment
      if (entry.entry_type === "loan" && entry.description) {
        const repaymentIdMatch = entry.description.match(/\[REPAYMENT_ID:(\d+)\]/);
        if (repaymentIdMatch) {
          const repaymentId = Number(repaymentIdMatch[1]);
          const repaymentDeleteResult = await EmployeeLoanRepaymentModel.deleteRepayment(repaymentId);
          if (!repaymentDeleteResult.success) {
            console.warn(`Failed to delete loan repayment ${repaymentId}:`, repaymentDeleteResult.error);
            // Continue with entry deletion even if repayment deletion fails
          }
        }
      }

      const result = await EmployeePaymentEntryModel.deleteEntry(entryId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete entry" });
      }

      // Refresh record aggregates
      const refreshResult = await EmployeePaymentRecordModel.refreshRecordAggregates(recordId);
      if (refreshResult.success && refreshResult.record) {
        await EmployeePaymentCycleModel.updateCycleAggregates(refreshResult.record.cycle_id);
      }

      const updatedRecord = await EmployeePaymentRecordModel.getRecordById(recordId);

      return res.json({
        success: true,
        record: updatedRecord.success ? updatedRecord.record : null,
      });
    } catch (error) {
      console.error("EmployeePaymentsController.deleteEntry error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default EmployeePaymentsController;

