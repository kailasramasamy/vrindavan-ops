import pool from "../../../db/pool.js";
import { stageCopyPool } from "../../../db/pool.js";
import DeliveryPaymentCycleModel from "../models/DeliveryPaymentCycleModel.js";
import DeliveryPaymentRecordModel from "../models/DeliveryPaymentRecordModel.js";

const opsDb = pool;

const ISO_MONTH_REGEX = /^\d{4}-\d{2}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toISOStringDate(date) {
  if (!date) {
    return null;
  }
  if (typeof date === "string" && ISO_DATE_REGEX.test(date)) {
    return date;
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const year = d.getUTCFullYear();
  const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthRangeFromInput(monthLike) {
  let baseDate;
  if (!monthLike) {
    baseDate = new Date();
  } else if (typeof monthLike === "string" && ISO_MONTH_REGEX.test(monthLike)) {
    const [year, month] = monthLike.split("-").map((v) => Number(v));
    baseDate = new Date(Date.UTC(year, month - 1, 1));
  } else {
    baseDate = new Date(monthLike);
  }
  if (Number.isNaN(baseDate.getTime())) {
    baseDate = new Date();
  }
  const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0));
  return {
    startDate: toISOStringDate(start),
    endDate: toISOStringDate(end),
    periodMonth: toISOStringDate(start),
  };
}

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

function normalizeCommissionRow(row = {}) {
  const productId =
    row.product_id ??
    row.food_id ??
    row.item_id ??
    row.productId ??
    row.foodId ??
    null;
  let commissionType = row.commission_type ?? row.type ?? null;
  let commissionRate = null;
  let commissionBasis = "per_unit";

  if (!commissionType) {
    const rawCommission =
      row.special_commission ??
      row.standard_commission ??
      row.commission ??
      row.percentage ??
      row.percent ??
      row.commission_percentage ??
      null;
    if (typeof rawCommission === "string" && rawCommission.includes("%")) {
      commissionType = "percentage";
    } else if (rawCommission != null) {
      commissionType = "flat";
    } else {
      commissionType = "flat";
    }
  }

  if (commissionType === "percentage") {
    commissionRate =
      row.commission_percentage ??
      row.percentage ??
      row.percent ??
      (typeof row.commission === "string" && row.commission.includes("%") ? parseFloat(row.commission) : null) ??
      (typeof row.special_commission === "string" && row.special_commission.includes("%") ? parseFloat(row.special_commission) : null) ??
      row.rate ??
      row.value ??
      0;
  } else {
    commissionRate =
      row.per_unit_amount ??
      row.amount_per_unit ??
      row.amount ??
      row.commission_amount ??
      (row.special_commission != null && typeof row.special_commission !== "string" ? row.special_commission : null) ??
      (row.standard_commission != null && typeof row.standard_commission !== "string" ? row.standard_commission : null) ??
      (typeof row.special_commission === "string" && !row.special_commission.includes("%") ? parseFloat(row.special_commission) : null) ??
      (typeof row.standard_commission === "string" && !row.standard_commission.includes("%") ? parseFloat(row.standard_commission) : null) ??
      (typeof row.commission === "string" && !row.commission.includes("%") ? parseFloat(row.commission) : null) ??
      row.value ??
      row.rate ??
      0;
    if (row.per_order_amount != null || row.flat_order_amount != null) {
      commissionBasis = "per_order";
      commissionRate = row.per_order_amount ?? row.flat_order_amount ?? commissionRate;
    }
  }

  const metadata = {
    raw: row,
    basis: commissionBasis,
  };

  return {
    productId,
    commissionType,
    commissionRate: Number(commissionRate) || 0,
    commissionBasis,
    metadata,
  };
}

function resolveCommission(deliveryBoyId, productId, { standardMap, specialMap }) {
  const specialKey = `${deliveryBoyId}:${productId}`;
  if (specialMap.has(specialKey)) {
    return { ...specialMap.get(specialKey), source: "special" };
  }
  if (standardMap.has(productId)) {
    return { ...standardMap.get(productId), source: "standard" };
  }
  return null;
}

function calculateCommissionForLine({ commissionConfig, quantity, lineTotal }) {
  if (!commissionConfig) {
    return { amount: 0, rate: 0, type: "flat", basis: "per_unit" };
  }
  const qty = Number(quantity) || 0;
  const total = Number(lineTotal) || 0;
  const rate = Number(commissionConfig.commissionRate) || 0;
  const type = commissionConfig.commissionType || "flat";
  const basis = commissionConfig.commissionBasis || "per_unit";
  let amount = 0;
  if (type === "percentage") {
    amount = (total * rate) / 100;
  } else if (basis === "per_order") {
    amount = rate;
  } else {
    amount = qty * rate;
  }
  return {
    amount: toNumber(amount),
    rate: rate,
    type,
    basis,
  };
}

function normalizePaymentType(rawType) {
  const value = (rawType || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "fixed" || value === "commission" || value === "hybrid") {
    return value;
  }
  if (value === "fixed_salary" || value === "fixedsalary" || value === "fixed_pay" || value === "fixedpay") {
    return "fixed";
  }
  return "commission";
}

async function tableHasColumn(poolInstance, tableName, columnName) {
  try {
    const [rows] = await poolInstance.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.warn(`Unable to determine if column ${columnName} exists on ${tableName}:`, error?.message || error);
    return false;
  }
}

let cachedOrderNumberColumn = null;
let orderNumberColumnChecked = false;

async function resolveOrderNumberColumn(poolInstance) {
  if (!poolInstance) {
    return null;
  }
  if (orderNumberColumnChecked) {
    return cachedOrderNumberColumn;
  }
  const candidates = ["order_code", "order_number", "order_no", "code"];
  // eslint-disable-next-line no-restricted-syntax
  for (const column of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await tableHasColumn(poolInstance, "orders", column);
    if (exists) {
      cachedOrderNumberColumn = column;
      break;
    }
  }
  orderNumberColumnChecked = true;
  return cachedOrderNumberColumn;
}

export class DeliveryPaymentsService {
  static async fetchActiveDeliveryBoys() {
    if (!stageCopyPool) {
      return { success: false, error: "Stage copy database connection not available" };
    }
    try {
      // Check which active column exists
      const hasActiveColumn = await tableHasColumn(stageCopyPool, "delivery_boys", "active");
      const hasIsActiveColumn = await tableHasColumn(stageCopyPool, "delivery_boys", "is_active");
      
      let query = "SELECT * FROM delivery_boys";
      if (hasActiveColumn) {
        query += " WHERE active = 1";
      } else if (hasIsActiveColumn) {
        query += " WHERE is_active = 1";
      }
      // If neither column exists, fetch all (backward compatibility)
      
      const [rows] = await stageCopyPool.query(query);
      if (!rows) {
        return { success: true, deliveryBoys: [], totalDeliveryBoys: 0 };
      }
      
      // Get total count for reference
      const [totalRows] = await stageCopyPool.query("SELECT COUNT(*) as total FROM delivery_boys");
      const totalDeliveryBoys = totalRows?.[0]?.total || 0;
      
      return { success: true, deliveryBoys: rows, totalDeliveryBoys };
    } catch (error) {
      console.error("DeliveryPaymentsService.fetchActiveDeliveryBoys error:", error);
      return { success: false, error: error.message };
    }
  }

  static async fetchCommissionMaps(activeDeliveryBoyIds = []) {
    if (!stageCopyPool) {
      return { success: false, error: "Stage copy database connection not available" };
    }
    try {
      const [standardRows] = await stageCopyPool.query("SELECT * FROM standard_commissions");
      const standardMap = new Map();
      standardRows?.forEach((row) => {
        const normalized = normalizeCommissionRow(row);
        if (normalized.productId != null) {
          standardMap.set(normalized.productId, normalized);
        }
      });

      let specialMap = new Map();
      if (activeDeliveryBoyIds.length > 0) {
        let specialRows = [];
        if (await tableHasColumn(stageCopyPool, "special_commissions", "delivery_boy_id")) {
          const placeholders = activeDeliveryBoyIds.map(() => "?").join(", ");
          const clauses = [];
          const params = [];

          clauses.push(`delivery_boy_id IN (${placeholders})`);
          params.push(...activeDeliveryBoyIds);

          const specialSql = `
            SELECT *
            FROM special_commissions
            WHERE ${clauses.join(" OR ")}
          `;
          [specialRows] = await stageCopyPool.query(specialSql, params);
        } else {
          const [rows] = await stageCopyPool.query("SELECT * FROM special_commissions");
          specialRows = rows;
        }
        specialMap = new Map();
        specialRows?.forEach((row) => {
          const normalized = normalizeCommissionRow(row);
          const deliveryBoyId = row.delivery_boy_id ?? row.deliveryBoyId ?? null;
          if (deliveryBoyId != null && normalized.productId != null) {
            const key = `${deliveryBoyId}:${normalized.productId}`;
            specialMap.set(key, normalized);
          }
        });
      }

      return { success: true, standardMap, specialMap };
    } catch (error) {
      console.error("DeliveryPaymentsService.fetchCommissionMaps error:", error);
      return { success: false, error: error.message };
    }
  }

  static async fetchOrdersForDeliveryBoy(deliveryBoyUserId, startDate, endDate) {
    const grouped = await this.fetchOrdersForDeliveryBoys([deliveryBoyUserId], startDate, endDate);
    if (!grouped.success) {
      return grouped;
    }
    return {
      success: true,
      orders: grouped.ordersMap.get(deliveryBoyUserId) || [],
    };
  }

  static async fetchOrdersForDeliveryBoys(deliveryBoyIds = [], startDate, endDate) {
    if (!stageCopyPool) {
      return { success: false, error: "Stage copy database connection not available" };
    }
    if (!Array.isArray(deliveryBoyIds) || deliveryBoyIds.length === 0) {
      return { success: true, ordersMap: new Map() };
    }
    try {
      const orderNumberColumn = await resolveOrderNumberColumn(stageCopyPool);
      const orderNumberSelect = orderNumberColumn ? `o.${orderNumberColumn}` : "NULL";
      const placeholders = deliveryBoyIds.map(() => "?").join(", ");
      const params = [...deliveryBoyIds, startDate, endDate];

      const sql = `
        SELECT 
          o.id AS order_id,
          ${orderNumberSelect} AS order_number,
          o.order_date,
          o.delivery_boy_id,
          fo.food_id AS product_id,
          fo.quantity,
          fo.price,
          (fo.quantity * fo.price) AS line_total,
          f.name AS product_name
        FROM orders o
        LEFT JOIN food_orders fo ON o.id = fo.order_id
        LEFT JOIN foods f ON fo.food_id = f.id
        WHERE o.delivery_boy_id IN (${placeholders})
          AND o.active = 1
          AND DATE(o.order_date) BETWEEN ? AND ?
        ORDER BY o.delivery_boy_id, o.order_date, o.id
      `;
      const [rows] = await stageCopyPool.query(sql, params);
      const ordersMap = new Map();
      rows?.forEach((row) => {
        const key = row.delivery_boy_id;
        if (!ordersMap.has(key)) {
          ordersMap.set(key, []);
        }
        ordersMap.get(key).push(row);
      });
      return { success: true, ordersMap };
    } catch (error) {
      console.error("DeliveryPaymentsService.fetchOrdersForDeliveryBoys error:", error);
      return { success: false, error: error.message };
    }
  }

  static computeMetricsForDeliveryBoy({ deliveryBoy, orders, commissionMaps, startDate, endDate }) {
    const paymentTypeRaw = deliveryBoy.payment_type || deliveryBoy.paymentType || "commission";
    const paymentType = normalizePaymentType(paymentTypeRaw);
    deliveryBoy.payment_type = paymentType;
    const fixedSalary = toNumber(
      deliveryBoy.fixed_salary_amount ??
        deliveryBoy.fixed_salary ??
        deliveryBoy.base_salary ??
        deliveryBoy.salary ??
        0,
    );
    const hybridBaseAmount = toNumber(
      deliveryBoy.hybrid_base_amount ??
        deliveryBoy.hybrid_base ??
        deliveryBoy.base_commission ??
        0,
    );

    const orderDetails = [];
    let totalCommission = 0;
    let totalOrders = 0;
    let totalDeliveries = 0;
    let totalCommissionableValue = 0;
    const orderIds = new Set();

    orders.forEach((order) => {
      if (!order) return;
      const orderId = order.order_id;
      const isNewOrder = orderId != null && !orderIds.has(orderId);
      const qty = Number(order.quantity) || 0;
      const lineTotal = Number(order.line_total) || 0;
      const productId = order.product_id ?? order.food_id ?? null;
      const commissionConfig = resolveCommission(deliveryBoy.user_id, productId, commissionMaps);
      const commissionResult = calculateCommissionForLine({
        commissionConfig,
        quantity: qty,
        lineTotal,
      });
      totalCommission += commissionResult.amount;
      totalCommissionableValue += lineTotal;
      if (isNewOrder) {
        orderIds.add(orderId);
        totalOrders += 1;
        totalDeliveries += 1;
      }
      orderDetails.push({
        order_id: orderId,
        order_number: order.order_number || order.order_code || null,
        order_date: order.order_date,
        product_id: productId,
        product_name: order.product_name || null,
        quantity: qty,
        line_total: lineTotal,
        commission_source: commissionConfig ? commissionConfig.source : "standard",
        commission_type: commissionResult.type,
        commission_rate: commissionResult.rate,
        commission_amount: commissionResult.amount,
        metadata: commissionConfig ? commissionConfig.metadata : null,
      });
    });

    let commissionAmount = toNumber(totalCommission);
    let totalEarnings = commissionAmount;
    if (paymentType === "fixed") {
      commissionAmount = 0;
      totalEarnings = fixedSalary;
    } else if (paymentType === "hybrid") {
      totalEarnings = fixedSalary + hybridBaseAmount + commissionAmount;
    } else {
      totalEarnings = commissionAmount;
    }

    return {
      paymentType,
      fixedSalary,
      commissionAmount,
      hybridBaseAmount,
      totalEarnings,
      totalOrders,
      totalDeliveries,
      totalCommissionableValue: toNumber(totalCommissionableValue),
      orderDetails,
      summary: {
        startDate,
        endDate,
      },
    };
  }

  static async recalculateCycle({ month, startDate, endDate, userId }) {
    if (!opsDb) {
      return { success: false, error: "Operations database connection not available" };
    }
    const range = monthRangeFromInput(month);
    const start = toISOStringDate(startDate) || range.startDate;
    const end = toISOStringDate(endDate) || range.endDate;
    const periodMonth = range.periodMonth;

    const cycleResult = await DeliveryPaymentCycleModel.getOrCreateCycle({
      monthLike: periodMonth,
      startDate: start,
      endDate: end,
      userId,
    });
    if (!cycleResult.success) {
      return cycleResult;
    }
    const cycle = cycleResult.cycle;

    const deliveryBoysResult = await this.fetchActiveDeliveryBoys();
    if (!deliveryBoysResult.success) {
      return deliveryBoysResult;
    }
    const deliveryBoys = deliveryBoysResult.deliveryBoys || [];
    const totalDeliveryBoyCount = deliveryBoysResult.totalDeliveryBoys ?? deliveryBoys.length ?? 0;
    if (deliveryBoys.length === 0) {
      await DeliveryPaymentCycleModel.updateCycleTotals(
        cycle.id,
        {
          total_delivery_boys: 0,
          total_orders: 0,
          total_gross_pay: 0,
          total_net_pay: 0,
          computed_at: new Date(),
        },
        userId,
      );
      const emptyCycle = { ...cycle, total_delivery_boys_all: totalDeliveryBoyCount, total_delivery_boys_active: 0 };
      return { success: true, cycle: emptyCycle, records: [] };
    }

    const activeIds = deliveryBoys.map((row) => row.user_id).filter((id) => id != null);
    const commissionMapsResult = await this.fetchCommissionMaps(activeIds);
    if (!commissionMapsResult.success) {
      return commissionMapsResult;
    }

    const ordersMapResult = await this.fetchOrdersForDeliveryBoys(activeIds, start, end);
    if (!ordersMapResult.success) {
      return ordersMapResult;
    }
    const ordersMap = ordersMapResult.ordersMap || new Map();

    const processedRecords = [];
    let totalGross = 0;
    let totalNet = 0;
    let totalOrders = 0;

    for (const deliveryBoy of deliveryBoys) {
      const deliveryBoyUserId = deliveryBoy.user_id;
      if (deliveryBoyUserId == null) {
        continue;
      }
      deliveryBoy.delivery_boy_external_id = deliveryBoy.id ?? deliveryBoy.delivery_boy_id ?? null;
      deliveryBoy.name = deliveryBoy.name || deliveryBoy.full_name || `${deliveryBoy.first_name || ""} ${deliveryBoy.last_name || ""}`.trim();

      const ordersForDeliveryBoy = ordersMap.get(deliveryBoyUserId) || [];
      const isActiveDeliveryBoy = deliveryBoy.is_active != null ? Number(deliveryBoy.is_active) === 1 : true;
      const metrics = this.computeMetricsForDeliveryBoy({
        deliveryBoy,
        orders: ordersForDeliveryBoy,
        commissionMaps: commissionMapsResult,
        startDate: start,
        endDate: end,
      });

      const recordResult = await DeliveryPaymentRecordModel.upsertRecordWithDetails({
        cycleId: cycle.id,
        deliveryBoy,
        metrics,
        orderDetails: metrics.orderDetails,
      });

      if (recordResult.success && recordResult.record) {
        const record = {
          ...recordResult.record,
          payment_type: metrics.paymentType,
          is_active_delivery_boy: isActiveDeliveryBoy,
          commission_amount: toNumber(metrics.commissionAmount),
          total_earnings: toNumber(metrics.totalEarnings),
          total_orders: metrics.totalOrders || 0,
          total_commissionable_value: toNumber(metrics.totalCommissionableValue),
        };
        processedRecords.push(record);
        totalGross += toNumber(record.gross_pay);
        totalNet += toNumber(record.net_pay);
        totalOrders += metrics.totalOrders || 0;
      } else {
        console.error("Failed to upsert delivery payment record:", recordResult.error);
      }
    }

    await DeliveryPaymentCycleModel.updateCycleTotals(
      cycle.id,
      {
        total_delivery_boys: processedRecords.length,
        total_orders: totalOrders,
        total_gross_pay: toNumber(totalGross),
        total_net_pay: toNumber(totalNet),
        computed_at: new Date(),
      },
      userId,
    );

    const refreshedCycle = await DeliveryPaymentCycleModel.getCycleById(cycle.id);
    const finalCycle =
      refreshedCycle.success && refreshedCycle.cycle ? { ...refreshedCycle.cycle } : { ...cycle };
    finalCycle.total_delivery_boys_all = totalDeliveryBoyCount;
    finalCycle.total_delivery_boys_active = processedRecords.length;
    return {
      success: true,
      cycle: finalCycle,
      records: processedRecords,
    };
  }
}

export default DeliveryPaymentsService;

