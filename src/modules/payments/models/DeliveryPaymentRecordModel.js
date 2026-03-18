import pool, { opsPool, getAppDbName } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

function splitEntriesByType(rows = []) {
  const result = {
    fuel: { credit: 0, debit: 0 },
    fuelQuantity: { credit: 0, debit: 0 },
    leave: { credit: 0, debit: 0 },
    leaveQuantity: { credit: 0, debit: 0 },
    adjustment: { credit: 0, debit: 0 },
    advance: { credit: 0, debit: 0 },
  };
  rows.forEach((row) => {
    const type = row.entry_type;
    const direction = row.direction;
    const amount = toNumber(row.total_amount);
    const quantity = toNumber(row.total_quantity, 3);
    if (type === "fuel_allowance") {
      if (direction === "credit") {
        result.fuel.credit += amount;
        result.fuelQuantity.credit += quantity;
      } else {
        result.fuel.debit += amount;
        result.fuelQuantity.debit += quantity;
      }
    } else if (type === "leave") {
      if (direction === "credit") {
        result.leave.credit += amount;
        result.leaveQuantity.credit += quantity;
      } else {
        result.leave.debit += amount;
        result.leaveQuantity.debit += quantity;
      }
    } else if (type === "adjustment") {
      if (direction === "credit") {
        result.adjustment.credit += amount;
      } else {
        result.adjustment.debit += amount;
      }
    } else if (type === "advance") {
      if (direction === "credit") {
        result.advance.credit += amount;
      } else {
        result.advance.debit += amount;
      }
    }
  });
  return result;
}

export class DeliveryPaymentRecordModel {
  static get db() {
    return opsDb;
  }

  static async getRecordById(recordId, connection = null) {
    const db = connection || this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT r.*,
                COALESCE(db.name, r.delivery_boy_name) AS delivery_boy_name_current
         FROM delivery_payment_records r
         LEFT JOIN ${getAppDbName()}.delivery_boys db ON db.user_id = r.delivery_boy_user_id
         WHERE r.id = ?`,
        [recordId]
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Delivery payment record not found" };
      }
      const { delivery_boy_name_current, ...recordData } = rows[0];
      const record = {
        ...recordData,
        delivery_boy_name: delivery_boy_name_current || recordData.delivery_boy_name,
      };
      return { success: true, record };
    } catch (error) {
      console.error("DeliveryPaymentRecordModel.getRecordById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async listRecords({ cycleId, status, limit = 200, offset = 0 } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const conditions = [];
    const params = [];
    if (cycleId) {
      conditions.push("r.cycle_id = ?");
      params.push(cycleId);
    }
    if (status) {
      conditions.push("r.payment_status = ?");
      params.push(status);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const l = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 500) : 200;
    const o = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : 0;
    try {
      const [rows] = await db.query(
        `SELECT r.*,
                COALESCE(entry_counts.entry_count, 0) AS entry_count,
                COALESCE(entry_counts.allowance_count, 0) AS allowance_count,
                COALESCE(entry_counts.adjustment_count, 0) AS adjustment_count,
                COALESCE(entry_counts.advance_count, 0) AS advance_count,
                COALESCE(db.name, r.delivery_boy_name) AS delivery_boy_name_current
         FROM delivery_payment_records r
         LEFT JOIN (
           SELECT record_id,
                  COUNT(*) AS entry_count,
                  SUM(entry_type = 'fuel_allowance') AS allowance_count,
                  SUM(entry_type = 'adjustment') AS adjustment_count,
                  SUM(entry_type = 'advance') AS advance_count
           FROM delivery_payment_entries
           GROUP BY record_id
         ) entry_counts ON entry_counts.record_id = r.id
         LEFT JOIN ${getAppDbName()}.delivery_boys db ON db.user_id = r.delivery_boy_user_id
         ${whereClause}
         ORDER BY COALESCE(db.name, r.delivery_boy_name) ASC
         LIMIT ? OFFSET ?`,
        [...params, l, o],
      );
      // Replace delivery_boy_name with the current name from the join
      const records = rows.map(row => {
        const { delivery_boy_name_current, ...recordData } = row;
        return {
          ...recordData,
          delivery_boy_name: delivery_boy_name_current || recordData.delivery_boy_name,
        };
      });
      return { success: true, records };
    } catch (error) {
      console.error("DeliveryPaymentRecordModel.listRecords error:", error);
      return { success: false, error: error.message };
    }
  }

  static async upsertRecordWithDetails({ cycleId, deliveryBoy, metrics, orderDetails }, externalConnection = null) {
    const db = externalConnection || (this.db && (await this.db.getConnection()));
    const shouldRelease = !externalConnection && db && typeof db.release === "function";
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }

    try {
      if (!externalConnection) {
        await db.beginTransaction();
      }

      const selectSql = "SELECT id FROM delivery_payment_records WHERE cycle_id = ? AND delivery_boy_user_id = ?";
      const [existingRows] = await db.query(selectSql, [cycleId, deliveryBoy.user_id]);
      let recordId;
      if (existingRows && existingRows.length > 0) {
        recordId = existingRows[0].id;
        await db.query(
          `UPDATE delivery_payment_records
           SET delivery_boy_external_id = ?,
               delivery_boy_name = ?,
               phone = ?,
               payment_type = ?,
               fixed_salary_amount = ?,
               commission_amount = ?,
               hybrid_base_amount = ?,
               total_earnings = ?,
               total_orders = ?,
               total_deliveries = ?,
               total_commissionable_value = ?,
               synced_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [
            deliveryBoy.delivery_boy_external_id || null,
            deliveryBoy.name || deliveryBoy.full_name || null,
            deliveryBoy.phone || deliveryBoy.mobile || null,
            deliveryBoy.payment_type || "commission",
            toNumber(metrics.fixedSalary),
            toNumber(metrics.commissionAmount),
            toNumber(metrics.hybridBaseAmount),
            toNumber(metrics.totalEarnings),
            metrics.totalOrders || 0,
            metrics.totalDeliveries || 0,
            toNumber(metrics.totalCommissionableValue),
            recordId,
          ],
        );
      } else {
        const insertSql = `
          INSERT INTO delivery_payment_records
          (cycle_id, delivery_boy_user_id, delivery_boy_external_id, delivery_boy_name, phone,
           payment_type, fixed_salary_amount, commission_amount, hybrid_base_amount,
           total_earnings, total_orders, total_deliveries, total_commissionable_value,
           synced_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
        `;
        const [insertResult] = await db.query(insertSql, [
          cycleId,
          deliveryBoy.user_id,
          deliveryBoy.delivery_boy_external_id || null,
          deliveryBoy.name || deliveryBoy.full_name || null,
          deliveryBoy.phone || deliveryBoy.mobile || null,
          deliveryBoy.payment_type || "commission",
          toNumber(metrics.fixedSalary),
          toNumber(metrics.commissionAmount),
          toNumber(metrics.hybridBaseAmount),
          toNumber(metrics.totalEarnings),
          metrics.totalOrders || 0,
          metrics.totalDeliveries || 0,
          toNumber(metrics.totalCommissionableValue),
        ]);
        recordId = insertResult.insertId;
      }

      await db.query("DELETE FROM delivery_payment_order_commissions WHERE record_id = ?", [recordId]);
      if (orderDetails && orderDetails.length > 0) {
        const valueSets = [];
        const params = [];
        orderDetails.forEach((detail) => {
          valueSets.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          params.push(
            recordId,
            detail.order_id,
            detail.order_number || null,
            detail.order_date || null,
            detail.product_id || null,
            detail.product_name || null,
            detail.quantity != null ? toNumber(detail.quantity, 3) : null,
            detail.line_total != null ? toNumber(detail.line_total) : null,
            detail.commission_source || "standard",
            detail.commission_type || "flat",
            detail.commission_rate != null ? toNumber(detail.commission_rate, 4) : 0,
            detail.commission_amount != null ? toNumber(detail.commission_amount) : 0,
            detail.metadata ? JSON.stringify(detail.metadata) : null,
          );
        });
        const insertDetailsSql = `
          INSERT INTO delivery_payment_order_commissions
          (record_id, order_id, order_number, order_date, product_id, product_name,
           quantity, line_total, commission_source, commission_type,
           commission_rate, commission_amount, metadata)
          VALUES ${valueSets.join(", ")}
        `;
        await db.query(insertDetailsSql, params);
      }

      await this.recalculateAggregates(recordId, db);

      if (!externalConnection) {
        await db.commit();
      }

      return this.getRecordById(recordId, db);
    } catch (error) {
      if (!externalConnection && db && typeof db.rollback === "function") {
        await db.rollback();
      }
      console.error("DeliveryPaymentRecordModel.upsertRecordWithDetails error:", error);
      return { success: false, error: error.message };
    } finally {
      if (shouldRelease) {
        db.release();
      }
    }
  }

  static async recalculateAggregates(recordId, externalConnection = null) {
    const db = externalConnection || (this.db && (await this.db.getConnection()));
    const shouldRelease = !externalConnection && db && typeof db.release === "function";
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [records] = await db.query(
        "SELECT id, fixed_salary_amount, commission_amount, hybrid_base_amount FROM delivery_payment_records WHERE id = ?",
        [recordId],
      );
      if (!records || records.length === 0) {
        return { success: false, error: "Delivery payment record not found" };
      }
      const base = records[0];
      const baseFixed = toNumber(base.fixed_salary_amount);
      const baseCommission = toNumber(base.commission_amount);
      const baseHybrid = toNumber(base.hybrid_base_amount);
      const baseEarnings = toNumber(baseFixed + baseCommission + baseHybrid);

      const [entryRows] = await db.query(
        `SELECT entry_type, direction,
                SUM(amount) AS total_amount,
                SUM(quantity) AS total_quantity
         FROM delivery_payment_entries
         WHERE record_id = ?
         GROUP BY entry_type, direction`,
        [recordId],
      );

      const entrySummary = splitEntriesByType(entryRows);
      const fuelAllowanceTotal = entrySummary.fuel.credit - entrySummary.fuel.debit;
      const leaveDeductionTotal = entrySummary.leave.debit - entrySummary.leave.credit;
      const leaveDays = entrySummary.leaveQuantity.debit - entrySummary.leaveQuantity.credit;
      const adjustmentsPositive = entrySummary.adjustment.credit;
      const adjustmentsNegative = entrySummary.adjustment.debit;
      const advancesTotal = entrySummary.advance.debit - entrySummary.advance.credit;
      const adjustmentsNet = adjustmentsPositive - adjustmentsNegative;

      const grossPay = baseEarnings + fuelAllowanceTotal + adjustmentsPositive;
      const netPay = grossPay - leaveDeductionTotal - adjustmentsNegative - advancesTotal;

      await db.query(
        `UPDATE delivery_payment_records
         SET total_earnings = ?,
             fuel_allowance_total = ?,
             leave_days = ?,
             leave_deduction_total = ?,
             adjustments_positive = ?,
             adjustments_negative = ?,
             adjustments_net = ?,
             advances_total = ?,
             gross_pay = ?,
             net_pay = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          toNumber(baseEarnings),
          toNumber(fuelAllowanceTotal),
          toNumber(leaveDays, 2),
          toNumber(leaveDeductionTotal),
          toNumber(adjustmentsPositive),
          toNumber(adjustmentsNegative),
          toNumber(adjustmentsNet),
          toNumber(advancesTotal),
          toNumber(grossPay),
          toNumber(netPay),
          recordId,
        ],
      );

      return this.getRecordById(recordId, db);
    } catch (error) {
      console.error("DeliveryPaymentRecordModel.recalculateAggregates error:", error);
      return { success: false, error: error.message };
    } finally {
      if (shouldRelease) {
        db.release();
      }
    }
  }

  static async getOrderDetails(recordId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      // Join with foods table to get unit size
      // Use cross-database join since foods is in APP_DB
      const [rows] = await db.query(
        `SELECT 
           dpoc.*,
           COALESCE(f.unit, '') AS product_unit_size
         FROM delivery_payment_order_commissions dpoc
         LEFT JOIN ${getAppDbName()}.foods f ON dpoc.product_id = f.id
         WHERE dpoc.record_id = ?
         ORDER BY dpoc.order_date ASC, dpoc.id ASC`,
        [recordId],
      );
      return { success: true, orders: rows };
    } catch (error) {
      console.error("DeliveryPaymentRecordModel.getOrderDetails error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRemarks(recordId, remarks) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      await db.query("UPDATE delivery_payment_records SET remarks = ?, updated_at = NOW() WHERE id = ?", [remarks || null, recordId]);
      return this.getRecordById(recordId);
    } catch (error) {
      console.error("DeliveryPaymentRecordModel.updateRemarks error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateStatus(recordId, newStatus, { userId = null, reason = null } = {}) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    const allowed = new Set(["pending", "ready", "paid", "on_hold", "cancelled"]);
    if (!allowed.has(newStatus)) {
      return { success: false, error: `Invalid payment status: ${newStatus}` };
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query("SELECT payment_status FROM delivery_payment_records WHERE id = ?", [recordId]);
      if (!rows || rows.length === 0) {
        await connection.rollback();
        return { success: false, error: "Delivery payment record not found" };
      }
      const prevStatus = rows[0].payment_status;
      await connection.query("UPDATE delivery_payment_records SET payment_status = ?, updated_at = NOW() WHERE id = ?", [newStatus, recordId]);
      await connection.query(
        `INSERT INTO delivery_payment_status_history
         (record_id, previous_status, new_status, changed_by, change_reason, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NOW())`,
        [recordId, prevStatus, newStatus, userId || null, reason || null],
      );
      await connection.commit();
      return this.getRecordById(recordId);
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("DeliveryPaymentRecordModel.updateStatus error:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

export default DeliveryPaymentRecordModel;

