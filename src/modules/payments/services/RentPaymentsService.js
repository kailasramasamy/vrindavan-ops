import pool, { opsPool } from "../../../db/pool.js";
import { RentPaymentCycleModel } from "../models/RentPaymentCycleModel.js";
import { RentPaymentRecordModel } from "../models/RentPaymentRecordModel.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class RentPaymentsService {
  // Fetch active properties from rental_properties table
  static async fetchProperties() {
    const db = opsDb;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT 
          property_name,
          property_type,
          property_location,
          monthly_rent
         FROM rental_properties
         WHERE status = 'active'
         ORDER BY property_name ASC`
      );
      return { success: true, properties: rows || [] };
    } catch (error) {
      console.error("RentPaymentsService.fetchProperties error:", error);
      return { success: false, error: error.message };
    }
  }

  static async calculateRentPayments(cycleId, monthLike, properties = []) {
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
      let cycleResult = await RentPaymentCycleModel.getCycleByMonth(monthLike);
      if (!cycleResult.success || !cycleResult.cycle) {
        const normalized = RentPaymentCycleModel.normalizePeriod(monthLike);
        cycleResult = await RentPaymentCycleModel.createCycle({
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

      // If no properties provided, fetch from existing records
      let propertiesToProcess = properties;
      if (!propertiesToProcess || propertiesToProcess.length === 0) {
        const propertiesResult = await this.fetchProperties();
        if (propertiesResult.success && propertiesResult.properties.length > 0) {
          propertiesToProcess = propertiesResult.properties;
        } else {
          // No properties exist yet - return empty records
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
      }

      const records = [];

      // Process each property
      for (const property of propertiesToProcess) {
        const monthlyRent = toNumber(property.monthly_rent || 0);
        const netPay = monthlyRent; // Start with base rent, adjustments will be added later

        // Create or update payment record
        const recordResult = await RentPaymentRecordModel.createRecord(
          {
            cycle_id: actualCycleId,
            property_name: property.property_name,
            property_type: property.property_type || 'other',
            property_location: property.property_location || null,
            monthly_rent: monthlyRent,
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
      const updatedCycleResult = await RentPaymentCycleModel.updateCycleAggregates(actualCycleId, connection);
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
      console.error("RentPaymentsService.calculateRentPayments error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection && typeof connection.release === 'function') {
        connection.release();
      }
    }
  }
}

export default RentPaymentsService;

