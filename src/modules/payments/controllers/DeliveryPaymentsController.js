import DeliveryPaymentCycleModel from "../models/DeliveryPaymentCycleModel.js";
import DeliveryPaymentRecordModel from "../models/DeliveryPaymentRecordModel.js";
import DeliveryPaymentEntryModel from "../models/DeliveryPaymentEntryModel.js";
import DeliveryPaymentsService from "../services/DeliveryPaymentsService.js";
import { buildSEO } from "../../../utils/seo.js";
import { opsPool } from "../../../db/pool.js";

function getUserId(req) {
  return req?.user?.id ?? null;
}

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

export class DeliveryPaymentsController {
  static async renderPaymentsIndexPage(req, res) {
    try {
      const seo = buildSEO({ title: "Payments Management — Operations", url: req.path });
      res.render("pages/ops/payments/index", {
        seo,
        pageKey: "ops/payments/index",
        promo: false,
        user: req.user,
      });
    } catch (error) {
      console.error("DeliveryPaymentsController.renderPaymentsIndexPage error:", error);
      res.status(500).send("Unable to load payments management page");
    }
  }

  static async getPaymentsSummary(req, res) {
    try {
      const { month } = req.query;
      const db = opsPool || DeliveryPaymentRecordModel.db;
      
      if (!db) {
        return res.status(500).json({ success: false, error: "Database connection not available" });
      }

      // Build month filter - handle both DATE and VARCHAR period_month columns
      let dateFilter = "";
      const params = [];
      if (month) {
        // Extract YYYY-MM from both DATE and VARCHAR columns:
        // - For DATE: CAST to CHAR gives 'YYYY-MM-DD', LEFT(..., 7) gives 'YYYY-MM'
        // - For VARCHAR: LEFT(..., 7) gives 'YYYY-MM' directly
        dateFilter = "AND LEFT(CAST(c.period_month AS CHAR), 7) = ?";
        params.push(month);
      }

      // Query all payment modules in parallel for efficiency
      const [deliveryResult, employeeResult, rentResult, transportResult, itServicesResult, electricityResult, milkResult] = await Promise.all([
        // Delivery Payments (period_month is DATE)
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending
          FROM delivery_payment_records r
          INNER JOIN delivery_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // Employee Payments (period_month is VARCHAR)
        // Exclude "zero_pay" (net_pay = 0) from pending count (but include in total)
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE 
              WHEN r.payment_status = 'pending' AND COALESCE(r.net_pay, 0) != 0 
              THEN 1 
              ELSE 0 
            END) as pending
          FROM employee_payment_records r
          INNER JOIN employee_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // Rent Payments
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending
          FROM rent_payment_records r
          INNER JOIN rent_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // Transport Payments
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending
          FROM transport_payment_records r
          INNER JOIN transport_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // IT Services Payments
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending
          FROM it_services_payment_records r
          INNER JOIN it_services_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // Electricity Payments
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) as pending
          FROM electricity_payment_records r
          INNER JOIN electricity_payment_cycles c ON c.id = r.cycle_id
          WHERE 1=1 ${dateFilter}
        `, params),
        
        // Milk Payments (from procurement billing - farmer_billing, cpp_billing, rcc_billing, mp_billing)
        (() => {
          const milkDateFilter = month ? "AND DATE_FORMAT(billing_period_start, '%Y-%m') = ?" : "";
          const milkParams = month ? [month, month, month, month] : [];
          return db.query(`
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending
            FROM (
              SELECT payment_status_id FROM farmer_billing WHERE 1=1 ${milkDateFilter}
              UNION ALL
              SELECT payment_status_id FROM cpp_billing WHERE 1=1 ${milkDateFilter}
              UNION ALL
              SELECT payment_status_id FROM rcc_billing WHERE 1=1 ${milkDateFilter}
              UNION ALL
              SELECT payment_status_id FROM mp_billing WHERE 1=1 ${milkDateFilter}
            ) AS all_bills
            LEFT JOIN payment_status ps ON all_bills.payment_status_id = ps.id
          `, milkParams);
        })(),
      ]);

      return res.json({
        success: true,
        summary: {
          delivery: {
            total: Number(deliveryResult[0][0]?.total || 0),
            pending: Number(deliveryResult[0][0]?.pending || 0),
          },
          employee: {
            total: Number(employeeResult[0][0]?.total || 0),
            pending: Number(employeeResult[0][0]?.pending || 0),
          },
          rent: {
            total: Number(rentResult[0][0]?.total || 0),
            pending: Number(rentResult[0][0]?.pending || 0),
          },
          transport: {
            total: Number(transportResult[0][0]?.total || 0),
            pending: Number(transportResult[0][0]?.pending || 0),
          },
          itServices: {
            total: Number(itServicesResult[0][0]?.total || 0),
            pending: Number(itServicesResult[0][0]?.pending || 0),
          },
          electricity: {
            total: Number(electricityResult[0][0]?.total || 0),
            pending: Number(electricityResult[0][0]?.pending || 0),
          },
          milk: {
            total: Number(milkResult[0][0]?.total || 0),
            pending: Number(milkResult[0][0]?.pending || 0),
          },
        },
      });
    } catch (error) {
      console.error("DeliveryPaymentsController.getPaymentsSummary error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async renderDeliveryPaymentsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Delivery Payments — Payments Management", url: req.path });
      res.render("pages/ops/payments/delivery/index", {
        seo,
        pageKey: "ops/payments/delivery/index",
        promo: false,
        user: req.user,
        defaultMonth: parseMonth(req.query.month),
      });
    } catch (error) {
      console.error("DeliveryPaymentsController.renderDeliveryPaymentsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Delivery Payments — Error" },
        pageKey: "ops/payments/delivery/error",
        promo: false,
        user: req.user,
        title: "Unable to load Delivery Payments",
        message: "Something went wrong while loading the Delivery Payments module.",
        error,
      });
    }
  }

  static async renderDeliveryPaymentRecordPage(req, res) {
    const { recordId } = req.params;
    const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
    const selectedMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : null;
    try {
      const recordResult = await DeliveryPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Delivery Payment Record — Not Found" },
          pageKey: "ops/payments/delivery/record-not-found",
          promo: false,
          user: req.user,
          title: "Delivery payment record not found",
          message: "We couldn't find the delivery payment record you're looking for.",
          error: { status: 404 },
        });
      }

      const [entriesResult, ordersResult, cycleResult] = await Promise.all([
        DeliveryPaymentEntryModel.listEntries(recordId),
        DeliveryPaymentRecordModel.getOrderDetails(recordId),
        DeliveryPaymentCycleModel.getCycleById(recordResult.record.cycle_id),
      ]);

      const seo = buildSEO({
        title: `${recordResult.record.delivery_boy_name || "Delivery Partner"} — Delivery Payments`,
        url: req.path,
      });

      res.render("pages/ops/payments/delivery/record", {
        seo,
        pageKey: "ops/payments/delivery/record",
        promo: false,
        user: req.user,
        record: recordResult.record,
        entries: entriesResult.success ? entriesResult.entries : [],
        orders: ordersResult.success ? ordersResult.orders : [],
        cycle: cycleResult.success ? cycleResult.cycle : null,
        selectedMonth,
      });
    } catch (error) {
      console.error("DeliveryPaymentsController.renderDeliveryPaymentRecordPage error:", error);
      return res.status(500).render("pages/ops/error", {
        seo: { title: "Delivery Payments — Error" },
        pageKey: "ops/payments/delivery/error",
        promo: false,
        user: req.user,
        title: "Unable to load delivery payment record",
        message: "Something went wrong while loading the delivery payment record.",
        error,
      });
    }
  }

  static async listCycles(req, res) {
    const limit = req.query.limit || 12;
    const offset = req.query.offset || 0;
    const result = await DeliveryPaymentCycleModel.listCycles({ limit, offset });
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Unable to list delivery payment cycles" });
    }
    return res.json({ success: true, cycles: result.cycles });
  }

  static async getCycleById(req, res) {
    const { cycleId } = req.params;
    const result = await DeliveryPaymentCycleModel.getCycleById(cycleId);
    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error || "Delivery payment cycle not found" });
    }
    return res.json({ success: true, cycle: result.cycle });
  }

  static async getCycleByMonth(req, res) {
    const { month } = req.query || {};
    if (!month) {
      return res.status(400).json({ success: false, error: "Month parameter is required" });
    }
    
    try {
      const cycleResult = await DeliveryPaymentCycleModel.getCycleByMonth(month);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.json({ success: false, cycle: null, records: [] });
      }
      
      const cycle = cycleResult.cycle;
      const recordsResult = await DeliveryPaymentRecordModel.listRecords({ cycleId: cycle.id });
      const records = recordsResult.success ? (recordsResult.records || []) : [];
      
      return res.json({ success: true, cycle, records });
    } catch (error) {
      console.error("DeliveryPaymentsController.getCycleByMonth error:", error);
      return res.status(500).json({ success: false, error: error.message || "Unable to load cycle data" });
    }
  }

  static async recalculateCycle(req, res) {
    const { month, startDate, endDate } = req.body || req.query || {};
    const userId = getUserId(req);
    const result = await DeliveryPaymentsService.recalculateCycle({ month, startDate, endDate, userId });
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Unable to recalculate delivery payment cycle" });
    }
    return res.json({ success: true, cycle: result.cycle, records: result.records });
  }

  static async lockCycle(req, res) {
    const { cycleId } = req.params;
    const userId = getUserId(req);
    const result = await DeliveryPaymentCycleModel.setStatus(cycleId, "locked", userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to lock delivery payment cycle" });
    }
    return res.json({ success: true, cycle: result.cycle });
  }

  static async unlockCycle(req, res) {
    const { cycleId } = req.params;
    const userId = getUserId(req);
    const result = await DeliveryPaymentCycleModel.setStatus(cycleId, "in_review", userId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to unlock delivery payment cycle" });
    }
    return res.json({ success: true, cycle: result.cycle });
  }

  static async listRecords(req, res) {
    const { cycleId, status, limit, offset } = req.query;
    const result = await DeliveryPaymentRecordModel.listRecords({ cycleId, status, limit, offset });
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Unable to list delivery payment records" });
    }
    return res.json({ success: true, records: result.records });
  }

  static async getRecordById(req, res) {
    const { recordId } = req.params;
    const result = await DeliveryPaymentRecordModel.getRecordById(recordId);
    if (!result.success) {
      return res.status(404).json({ success: false, error: result.error || "Delivery payment record not found" });
    }
    return res.json({ success: true, record: result.record });
  }

  static async updateRecordStatus(req, res) {
    const { recordId } = req.params;
    const { status, reason } = req.body || {};
    const userId = getUserId(req);
    const result = await DeliveryPaymentRecordModel.updateStatus(recordId, status, { userId, reason });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to update payment status" });
    }
    return res.json({ success: true, record: result.record });
  }

  static async updateRecordRemarks(req, res) {
    const { recordId } = req.params;
    const { remarks } = req.body || {};
    const result = await DeliveryPaymentRecordModel.updateRemarks(recordId, remarks);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to update remarks" });
    }
    return res.json({ success: true, record: result.record });
  }

  static async listEntries(req, res) {
    const { recordId } = req.params;
    const result = await DeliveryPaymentEntryModel.listEntries(recordId);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Unable to list payment entries" });
    }
    return res.json({ success: true, entries: result.entries });
  }

  static async createEntry(req, res) {
    const { recordId } = req.params;
    const entryData = req.body || {};
    const userId = getUserId(req);
    const result = await DeliveryPaymentEntryModel.createEntry(recordId, entryData, { userId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to create payment entry" });
    }
    return res.json({ success: true, entries: result.entries, record: result.record });
  }

  static async createLeave(req, res) {
    const { recordId } = req.params;
    const { leave_start_date, leave_end_date, reason } = req.body || {};
    const userId = getUserId(req);

    if (!leave_start_date || !leave_end_date) {
      return res.status(400).json({ success: false, error: "Leave start date and end date are required" });
    }

    try {
      // Get the record to determine payment type
      const recordResult = await DeliveryPaymentRecordModel.getRecordById(recordId);
      if (!recordResult.success || !recordResult.record) {
        return res.status(404).json({ success: false, error: "Payment record not found" });
      }

      const record = recordResult.record;
      const paymentType = (record.payment_type || "").toLowerCase();

      // Get the cycle to know the month boundaries
      const cycleResult = await DeliveryPaymentCycleModel.getCycleById(record.cycle_id);
      if (!cycleResult.success || !cycleResult.cycle) {
        return res.status(400).json({ success: false, error: "Payment cycle not found" });
      }

      const cycle = cycleResult.cycle;
      const cycleStart = new Date(cycle.start_date);
      const cycleEnd = new Date(cycle.end_date);

      // Parse leave dates
      const startDate = new Date(leave_start_date);
      const endDate = new Date(leave_end_date);

      if (startDate > endDate) {
        return res.status(400).json({ success: false, error: "Leave start date must be before or equal to end date" });
      }

      // Ensure leave dates are within cycle
      if (startDate < cycleStart || endDate > cycleEnd) {
        return res.status(400).json({ success: false, error: "Leave dates must be within the payment cycle period" });
      }

      // Calculate leave days (inclusive)
      const leaveDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      let totalDeduction = 0;
      const leaveEntries = [];
      let commissionRows = [];
      let commissionsByDate = new Map();

      if (paymentType === "fixed") {
        // Fixed salary: prorate based on days in month
        const daysInMonth = Math.floor((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1;
        const dailySalary = toNumber(record.fixed_salary_amount) / daysInMonth;
        totalDeduction = dailySalary * leaveDays;

        // Create a single leave entry for the date range
        const entryData = {
          entry_type: "leave",
          direction: "debit",
          amount: totalDeduction,
          quantity: leaveDays,
          reason: reason || `Leave from ${leave_start_date} to ${leave_end_date}`,
          notes: `Leave period: ${leave_start_date} to ${leave_end_date}`,
          effective_date: leave_start_date,
        };
        const entryResult = await DeliveryPaymentEntryModel.createEntry(recordId, entryData, { userId });
        if (!entryResult.success) {
          return res.status(400).json({ success: false, error: entryResult.error || "Unable to create leave entry" });
        }
        leaveEntries.push(...entryResult.entries);
      } else if (paymentType === "commission" || paymentType === "hybrid") {
        // Commission: Use pre-calculated commission amounts from delivery_payment_order_commissions
        // This table already has the commission calculated for each order during cycle recalculation
        
        // Get order commissions for the leave period
        const queryParams = [Number(recordId), leave_start_date, leave_end_date];
        const [rows] = await opsPool.query(`
          SELECT 
            DATE(order_date) AS order_date,
            COUNT(*) AS order_count,
            SUM(commission_amount) AS total_commission
          FROM delivery_payment_order_commissions
          WHERE record_id = ?
            AND DATE(order_date) BETWEEN ? AND ?
          GROUP BY DATE(order_date)
        `, queryParams);
        commissionRows = rows || [];

        // Group by date - normalize date to YYYY-MM-DD string
        commissionsByDate = new Map();
        if (commissionRows && commissionRows.length > 0) {
          commissionRows.forEach((row) => {
            let dateStr;
            if (row.order_date instanceof Date) {
              // Convert Date object to YYYY-MM-DD using local date methods to avoid timezone shift
              const year = row.order_date.getFullYear();
              const month = String(row.order_date.getMonth() + 1).padStart(2, "0");
              const day = String(row.order_date.getDate()).padStart(2, "0");
              dateStr = `${year}-${month}-${day}`;
            } else if (typeof row.order_date === "string") {
              // Already a string, extract YYYY-MM-DD (first 10 characters)
              dateStr = row.order_date.substring(0, 10);
            } else if (row.order_date) {
              // Try to parse - might be a Date-like object
              const date = new Date(row.order_date);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                dateStr = `${year}-${month}-${day}`;
              }
            }
            if (dateStr && dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              commissionsByDate.set(dateStr, {
                orderCount: Number(row.order_count) || 0,
                totalCommission: toNumber(row.total_commission),
              });
            }
          });
        }

        // Create leave entry for each day
        // Parse dates as local dates to avoid timezone issues
        const startDateLocal = new Date(leave_start_date + "T00:00:00");
        const endDateLocal = new Date(leave_end_date + "T00:00:00");
        
        for (let d = new Date(startDateLocal); d <= endDateLocal; d.setDate(d.getDate() + 1)) {
          // Format as YYYY-MM-DD without timezone conversion
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const dateStr = `${year}-${month}-${day}`;
          
          const dayData = commissionsByDate.get(dateStr) || { orderCount: 0, totalCommission: 0 };

          // Create entry for this day with calculated commission
          const entryData = {
            entry_type: "leave",
            direction: "debit",
            amount: dayData.totalCommission,
            quantity: 1,
            reason: reason || `Leave on ${dateStr}`,
            notes: `Leave date: ${dateStr}. Orders: ${dayData.orderCount}, Commission: ${formatCurrency(dayData.totalCommission)}`,
            effective_date: dateStr,
          };
          const entryResult = await DeliveryPaymentEntryModel.createEntry(recordId, entryData, { userId });
          if (entryResult.success && entryResult.entries) {
            leaveEntries.push(...entryResult.entries);
            totalDeduction += dayData.totalCommission;
          }
        }
      } else {
        return res.status(400).json({ success: false, error: "Invalid payment type for leave calculation" });
      }

      // Refresh record to get updated totals
      const updatedRecordResult = await DeliveryPaymentRecordModel.getRecordById(recordId);
      const updatedRecord = updatedRecordResult.success ? updatedRecordResult.record : record;

      return res.json({
        success: true,
        leaveEntries,
        totalDeduction,
        leaveDays,
        record: updatedRecord,
      });
    } catch (error) {
      console.error("DeliveryPaymentsController.createLeave error:", error);
      return res.status(500).json({ success: false, error: error.message || "Unable to create leave entries" });
    }
  }

  static async deleteEntry(req, res) {
    const { entryId } = req.params;
    const userId = getUserId(req);
    const result = await DeliveryPaymentEntryModel.deleteEntry(entryId, { userId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || "Unable to delete payment entry" });
    }
    return res.json({ success: true, recordId: result.recordId, entries: result.entries, record: result.record });
  }

  static async listOrderDetails(req, res) {
    const { recordId } = req.params;
    const result = await DeliveryPaymentRecordModel.getOrderDetails(recordId);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || "Unable to load order commission details" });
    }
    return res.json({ success: true, orders: result.orders });
  }
}

export default DeliveryPaymentsController;

