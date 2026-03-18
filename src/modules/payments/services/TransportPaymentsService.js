import pool, { opsPool } from "../../../db/pool.js";
import { TransportPaymentCycleModel } from "../models/TransportPaymentCycleModel.js";
import { TransportPaymentRecordModel } from "../models/TransportPaymentRecordModel.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class TransportPaymentsService {
  // Fetch active vehicles from transport_vehicles table
  static async fetchVehicles() {
    const db = opsDb;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT 
          vehicle_name,
          vehicle_type,
          vehicle_number,
          monthly_cost
         FROM transport_vehicles
         WHERE status = 'active'
         ORDER BY vehicle_name ASC`
      );
      return { success: true, vehicles: rows || [] };
    } catch (error) {
      console.error("TransportPaymentsService.fetchVehicles error:", error);
      return { success: false, error: error.message };
    }
  }

  static async calculateTransportPayments(cycleId, monthLike, vehicles = []) {
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
      let cycleResult = await TransportPaymentCycleModel.getCycleByMonth(monthLike);
      if (!cycleResult.success || !cycleResult.cycle) {
        const normalized = TransportPaymentCycleModel.normalizePeriod(monthLike);
        cycleResult = await TransportPaymentCycleModel.createCycle({
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

      // If no vehicles provided, fetch from vehicles table
      let vehiclesToProcess = vehicles;
      if (!vehiclesToProcess || vehiclesToProcess.length === 0) {
        const vehiclesResult = await this.fetchVehicles();
        if (vehiclesResult.success && vehiclesResult.vehicles.length > 0) {
          vehiclesToProcess = vehiclesResult.vehicles;
        } else {
          // No vehicles exist yet - return empty records
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

      // Process each vehicle
      for (const vehicle of vehiclesToProcess) {
        const monthlyCost = toNumber(vehicle.monthly_cost || 0);
        const netPay = monthlyCost; // Start with base cost, adjustments will be added later

        // Create or update payment record
        const recordResult = await TransportPaymentRecordModel.createRecord(
          {
            cycle_id: actualCycleId,
            vehicle_name: vehicle.vehicle_name,
            vehicle_type: vehicle.vehicle_type || 'other',
            vehicle_number: vehicle.vehicle_number || null,
            monthly_cost: monthlyCost,
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
      const updatedCycleResult = await TransportPaymentCycleModel.updateCycleAggregates(actualCycleId, connection);
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
      console.error("TransportPaymentsService.calculateTransportPayments error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection && typeof connection.release === 'function') {
        connection.release();
      }
    }
  }
}

export default TransportPaymentsService;

