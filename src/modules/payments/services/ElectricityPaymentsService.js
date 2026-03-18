import pool, { opsPool } from "../../../db/pool.js";
import { ElectricityPaymentCycleModel } from "../models/ElectricityPaymentCycleModel.js";
import { ElectricityPaymentRecordModel } from "../models/ElectricityPaymentRecordModel.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class ElectricityPaymentsService {
  static async calculateElectricityPayments(cycleId, monthLike, invoices = []) {
    const db = opsDb;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }

    let connection;
    try {
      if (typeof db.getConnection === 'function') {
        connection = await db.getConnection();
        await connection.beginTransaction();
      } else {
        await db.query('START TRANSACTION');
        connection = db;
      }

      // Get or create cycle
      let cycleResult = await ElectricityPaymentCycleModel.getCycleByMonth(monthLike);
      if (!cycleResult.success || !cycleResult.cycle) {
        const normalized = ElectricityPaymentCycleModel.normalizePeriod(monthLike);
        cycleResult = await ElectricityPaymentCycleModel.createCycle({
          monthLike: normalized.periodMonth,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
        }, connection);
      }

      if (!cycleResult.success || !cycleResult.cycle) {
        if (typeof connection.rollback === 'function') {
          await connection.rollback();
        } else {
          await db.query('ROLLBACK');
        }
        return { success: false, error: "Failed to get or create cycle" };
      }

      const cycle = cycleResult.cycle;
      const actualCycleId = cycle.id;

      // If no invoices provided, return empty records
      if (!invoices || invoices.length === 0) {
        if (typeof connection.commit === 'function') {
          await connection.commit();
        } else {
          await db.query('COMMIT');
        }
        return {
          success: true,
          cycle: cycle,
          records: [],
        };
      }

      const records = [];

      // Process each invoice
      for (const invoice of invoices) {
        const invoiceAmount = toNumber(invoice.invoice_amount || 0);
        const netPay = invoiceAmount; // Start with invoice amount, adjustments will be added later

        // Create or update payment record
        const recordResult = await ElectricityPaymentRecordModel.createRecord(
          {
            cycle_id: actualCycleId,
            meter_name: invoice.meter_name,
            meter_type: invoice.meter_type || 'commercial',
            invoice_number: invoice.invoice_number || null,
            invoice_date: invoice.invoice_date || null,
            invoice_amount: invoiceAmount,
            total_adjustments: 0,
            net_pay: netPay,
          },
          connection,
        );

        if (recordResult.success) {
          records.push(recordResult.record);
        }
      }

      // Update cycle aggregates
      const updatedCycleResult = await ElectricityPaymentCycleModel.updateCycleAggregates(actualCycleId, connection);
      const updatedCycle = updatedCycleResult.success ? updatedCycleResult.cycle : cycle;

      if (typeof connection.commit === 'function') {
        await connection.commit();
      } else {
        await db.query('COMMIT');
      }

      return {
        success: true,
        cycle: updatedCycle,
        records: records,
      };
    } catch (error) {
      if (typeof connection?.rollback === 'function') {
        await connection.rollback();
      } else if (db) {
        await db.query('ROLLBACK');
      }
      console.error("ElectricityPaymentsService.calculateElectricityPayments error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection && typeof connection.release === 'function') {
        connection.release();
      }
    }
  }
}

export default ElectricityPaymentsService;


