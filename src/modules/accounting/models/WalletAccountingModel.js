import { opsPool, analyticsPool } from "../../../db/pool.js";

const normalizeDateKey = (value) => {
  if (!value) {
    return null;
  }

  const toKey = (dateObj) => {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
  };

  if (value instanceof Date) {
    return toKey(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toKey(parsed);
};

const aggregateAdjustments = (rows = []) => {
  const map = new Map();

  rows.forEach((row) => {
    const dateKey = normalizeDateKey(row.adjustment_date);
    if (!dateKey) {
      return;
    }

    const amount = Number(row.amount || 0);
    const reason = row.reason || null;
    const entry = map.get(dateKey) || {
      increase: 0,
      decrease: 0,
      net: 0,
      reasons: new Set(),
    };

    if (amount >= 0) {
      entry.increase += amount;
    } else {
      entry.decrease += Math.abs(amount);
    }
    entry.net += amount;
    if (reason) {
      entry.reasons.add(reason);
    }

    map.set(dateKey, entry);
  });

  return map;
};

export class WalletAccountingModel {
  /**
   * Sync wallet recharge data for a specific date
   */
  static async syncWalletRecharges(date) {
    const startTime = Date.now();
    let connection;

    try {
      if (!analyticsPool) {
        throw new Error("Analytics database connection not available");
      }

      // Fetch wallet transactions from APP_DB for the specific date
      const [transactions] = await analyticsPool.query(
        `SELECT 
          DATE(transaction_date) as trans_date,
          COUNT(*) as total_transactions,
          SUM(transaction_amount) as total_recharges,
          SUM(plan_amount) as plan_amount_sum,
          SUM(extra_amount) as extra_amount_sum
        FROM wallet_transactions
        WHERE status = 'success'
          AND DATE(transaction_date) = ?
        GROUP BY DATE(transaction_date)`,
        [date]
      );

      if (transactions.length === 0) {
        return {
          success: true,
          message: "No wallet recharges found for this date",
          records_processed: 0,
        };
      }

      const txn = transactions[0];

      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      // Insert or update wallet recharge summary
      await connection.query(
        `INSERT INTO wallet_recharge_summary 
          (summary_date, total_recharges, total_transactions, net_amount)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_recharges = VALUES(total_recharges),
          total_transactions = VALUES(total_transactions),
          net_amount = VALUES(net_amount),
          updated_at = CURRENT_TIMESTAMP`,
        [date, txn.total_recharges, txn.total_transactions, txn.total_recharges]
      );

      // Log the sync
      await connection.query(
        `INSERT INTO wallet_accounting_sync_log 
          (sync_type, sync_date, records_processed, status, sync_duration_ms)
        VALUES ('recharge', ?, ?, 'success', ?)`,
        [date, txn.total_transactions, Date.now() - startTime]
      );

      await connection.commit();

      return {
        success: true,
        message: "Wallet recharges synced successfully",
        records_processed: txn.total_transactions,
        total_amount: parseFloat(txn.total_recharges),
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error syncing wallet recharges:", error);

      // Log failed sync
      try {
        await opsPool.query(
          `INSERT INTO wallet_accounting_sync_log 
            (sync_type, sync_date, records_processed, status, error_message, sync_duration_ms)
          VALUES ('recharge', ?, 0, 'failed', ?, ?)`,
          [date, error.message, Date.now() - startTime]
        );
      } catch (logError) {
        console.error("Error logging failed sync:", logError);
      }

      return {
        success: false,
        error: error.message,
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Sync sales revenue data for a specific date
   */
  static async syncSalesRevenue(date) {
    const startTime = Date.now();
    let connection;

    try {
      if (!analyticsPool) {
        throw new Error("Analytics database connection not available");
      }

      // Fetch orders from APP_DB for the specific date
      const [orders] = await analyticsPool.query(
        `SELECT 
          DATE(o.order_date) as order_date,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(fo.price * fo.quantity) as total_revenue,
          SUM(o.tax) as total_tax,
          SUM(o.delivery_fee) as total_delivery_fee
        FROM orders o
        INNER JOIN food_orders fo ON fo.order_id = o.id
        WHERE o.active = 1
          AND DATE(o.order_date) = ?
        GROUP BY DATE(o.order_date)`,
        [date]
      );

      if (orders.length === 0) {
        return {
          success: true,
          message: "No sales found for this date",
          records_processed: 0,
        };
      }

      const order = orders[0];
      const grossRevenue = parseFloat(order.total_revenue || 0) + parseFloat(order.total_tax || 0) + parseFloat(order.total_delivery_fee || 0);

      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      // Insert or update sales revenue summary
      await connection.query(
        `INSERT INTO sales_revenue_summary 
          (summary_date, total_orders, total_revenue, total_tax, total_delivery_fee, gross_revenue)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_orders = VALUES(total_orders),
          total_revenue = VALUES(total_revenue),
          total_tax = VALUES(total_tax),
          total_delivery_fee = VALUES(total_delivery_fee),
          gross_revenue = VALUES(gross_revenue),
          updated_at = CURRENT_TIMESTAMP`,
        [date, order.total_orders, order.total_revenue, order.total_tax, order.total_delivery_fee, grossRevenue]
      );

      // Log the sync
      await connection.query(
        `INSERT INTO wallet_accounting_sync_log 
          (sync_type, sync_date, records_processed, status, sync_duration_ms)
        VALUES ('sales', ?, ?, 'success', ?)`,
        [date, order.total_orders, Date.now() - startTime]
      );

      await connection.commit();

      return {
        success: true,
        message: "Sales revenue synced successfully",
        records_processed: order.total_orders,
        total_amount: grossRevenue,
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error syncing sales revenue:", error);

      // Log failed sync
      try {
        await opsPool.query(
          `INSERT INTO wallet_accounting_sync_log 
            (sync_type, sync_date, records_processed, status, error_message, sync_duration_ms)
          VALUES ('sales', ?, 0, 'failed', ?, ?)`,
          [date, error.message, Date.now() - startTime]
        );
      } catch (logError) {
        console.error("Error logging failed sync:", logError);
      }

      return {
        success: false,
        error: error.message,
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Perform daily reconciliation
   */
  static async performReconciliation(date) {
    const startTime = Date.now();
    let connection;

    try {
      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      // Get previous day's closing balance
      const [prevDay] = await connection.query(
        `SELECT closing_balance 
        FROM wallet_liability_reconciliation 
        WHERE reconciliation_date < ? 
        ORDER BY reconciliation_date DESC 
        LIMIT 1`,
        [date]
      );

      const openingBalance = prevDay.length > 0 ? parseFloat(prevDay[0].closing_balance) : 0;

      // Get today's recharges
      const [recharges] = await connection.query(
        `SELECT COALESCE(SUM(total_recharges), 0) as total_recharges
        FROM wallet_recharge_summary
        WHERE summary_date = ?`,
        [date]
      );

      const baseRecharges = parseFloat(recharges[0].total_recharges || 0);

      // Get today's sales
      const [sales] = await connection.query(
        `SELECT COALESCE(SUM(gross_revenue), 0) as total_sales
        FROM sales_revenue_summary
        WHERE summary_date = ?`,
        [date]
      );

      const baseSales = parseFloat(sales[0].total_sales || 0);

      // Get manual adjustments
      const [adjustmentsRow] = await connection.query(
        `SELECT 
            COALESCE(SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END), 0) AS adjustment_increase,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS adjustment_decrease,
            GROUP_CONCAT(DISTINCT reason ORDER BY reason SEPARATOR '; ') AS adjustment_notes
          FROM wallet_adjustments
          WHERE adjustment_date = ?`,
        [date]
      );

      const adjustmentIncrease = parseFloat(adjustmentsRow[0]?.adjustment_increase || 0);
      const adjustmentDecrease = parseFloat(adjustmentsRow[0]?.adjustment_decrease || 0);
      const adjustmentNotes = adjustmentsRow[0]?.adjustment_notes || null;

      const totalRecharges = baseRecharges + adjustmentIncrease;
      const totalSales = baseSales + adjustmentDecrease;

      // Calculated balance from synced recharges and sales
      const calculatedBalance = openingBalance + totalRecharges - totalSales;

      // Get real wallet balance from wallet_logs (single source of truth for all wallet movements)
      let appWalletBalance = calculatedBalance;
      if (analyticsPool) {
        try {
          const [walletLogResult] = await analyticsPool.query(
            `SELECT
              COALESCE(SUM(CASE WHEN LOWER(wallet_type) IN ('recharge', 'refund', 'credit', 'cashback') THEN amount ELSE 0 END), 0) AS total_credits,
              COALESCE(SUM(CASE WHEN LOWER(wallet_type) IN ('deduction', 'deductions from client') THEN amount ELSE 0 END), 0) AS total_debits
            FROM wallet_logs
            WHERE order_date = ?`,
            [date]
          );
          const netWalletChange = parseFloat(walletLogResult[0].total_credits) - parseFloat(walletLogResult[0].total_debits);
          appWalletBalance = openingBalance + netWalletChange;
        } catch (error) {
          console.error("Error fetching wallet_logs balance:", error);
        }
      }

      const variance = calculatedBalance - appWalletBalance;
      const closingBalance = appWalletBalance;

      // Insert or update reconciliation
      await connection.query(
        `INSERT INTO wallet_liability_reconciliation 
          (reconciliation_date, opening_balance, total_recharges, total_sales,
           adjustment_increase, adjustment_decrease, adjustment_notes,
           closing_balance, app_wallet_balance, variance, is_reconciled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          opening_balance = VALUES(opening_balance),
          total_recharges = VALUES(total_recharges),
          total_sales = VALUES(total_sales),
          adjustment_increase = VALUES(adjustment_increase),
          adjustment_decrease = VALUES(adjustment_decrease),
          adjustment_notes = VALUES(adjustment_notes),
          closing_balance = VALUES(closing_balance),
          app_wallet_balance = VALUES(app_wallet_balance),
          variance = VALUES(variance),
          is_reconciled = VALUES(is_reconciled),
          updated_at = CURRENT_TIMESTAMP`,
        [
          date,
          openingBalance,
          totalRecharges,
          totalSales,
          adjustmentIncrease,
          adjustmentDecrease,
          adjustmentNotes,
          closingBalance,
          appWalletBalance,
          variance,
          Math.abs(closingBalance - appWalletBalance) < 1,
        ]
      );

      // Log the reconciliation
      await connection.query(
        `INSERT INTO wallet_accounting_sync_log
          (sync_type, sync_date, records_processed, status, sync_duration_ms)
        VALUES ('reconciliation', ?, 1, 'success', ?)`,
        [date, Date.now() - startTime]
      );

      await connection.commit();

      return {
        success: true,
        message: "Reconciliation completed successfully",
        data: {
          date,
          opening_balance: openingBalance,
          total_recharges: totalRecharges,
          total_sales: totalSales,
          adjustment_increase: adjustmentIncrease,
          adjustment_decrease: adjustmentDecrease,
          adjustment_notes: adjustmentNotes,
          closing_balance: closingBalance,
          app_wallet_balance: appWalletBalance,
          variance,
          is_reconciled: Math.abs(closingBalance - appWalletBalance) < 1,
        },
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error performing reconciliation:", error);

      return {
        success: false,
        error: error.message,
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Sync data for a date range (OPTIMIZED VERSION)
   */
  static async syncDateRange(startDate, endDate) {
    const startTime = Date.now();
    let connection;

    try {
      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      // 1. Fetch ALL recharges for the date range in one query
      const [rechargesData] = await analyticsPool.query(
        `SELECT 
          DATE(transaction_date) as trans_date,
          COUNT(*) as total_transactions,
          SUM(transaction_amount) as total_recharges
        FROM wallet_transactions
        WHERE status = 'success'
          AND DATE(transaction_date) BETWEEN ? AND ?
        GROUP BY DATE(transaction_date)
        ORDER BY trans_date ASC`,
        [startDate, endDate]
      );

      // 2. Fetch ALL sales for the date range in one query
      const [salesData] = await analyticsPool.query(
        `SELECT 
          DATE(o.order_date) as order_date,
          COUNT(DISTINCT o.id) as total_orders,
          SUM(fo.price * fo.quantity) as total_revenue,
          SUM(o.tax) as total_tax,
          SUM(o.delivery_fee) as total_delivery_fee
        FROM orders o
        INNER JOIN food_orders fo ON fo.order_id = o.id
        WHERE o.active = 1
          AND DATE(o.order_date) BETWEEN ? AND ?
        GROUP BY DATE(o.order_date)
        ORDER BY order_date ASC`,
        [startDate, endDate]
      );

      // 3. Get opening balance (previous day's closing)
      const [prevBalance] = await connection.query(
        `SELECT closing_balance 
        FROM wallet_liability_reconciliation 
        WHERE reconciliation_date < ? 
        ORDER BY reconciliation_date DESC 
        LIMIT 1`,
        [startDate]
      );
      const openingBalance = prevBalance.length > 0 ? parseFloat(prevBalance[0].closing_balance) : 0;

      // 4. Create maps for quick lookup (normalize dates to YYYY-MM-DD strings)
      const rechargesMap = new Map();
      rechargesData.forEach((r) => {
        const dateKey = normalizeDateKey(r.trans_date);
        if (!dateKey) {
          return;
        }
        rechargesMap.set(dateKey, {
          total_recharges: parseFloat(r.total_recharges || 0),
          total_transactions: parseInt(r.total_transactions || 0),
        });
      });

      const salesMap = new Map();
      salesData.forEach((s) => {
        const dateKey = normalizeDateKey(s.order_date);
        if (!dateKey) {
          return;
        }
        const grossRevenue = parseFloat(s.total_revenue || 0) + parseFloat(s.total_tax || 0) + parseFloat(s.total_delivery_fee || 0);
        salesMap.set(dateKey, {
          total_orders: parseInt(s.total_orders || 0),
          total_revenue: parseFloat(s.total_revenue || 0),
          total_tax: parseFloat(s.total_tax || 0),
          total_delivery_fee: parseFloat(s.total_delivery_fee || 0),
          gross_revenue: grossRevenue,
        });
      });

      // 5a. Fetch wallet_logs for real balance calculation (all wallet movements)
      const [walletLogsData] = await analyticsPool.query(
        `SELECT
          order_date,
          COALESCE(SUM(CASE WHEN LOWER(wallet_type) IN ('recharge', 'refund', 'credit', 'cashback') THEN amount ELSE 0 END), 0) AS total_credits,
          COALESCE(SUM(CASE WHEN LOWER(wallet_type) IN ('deduction', 'deductions from client') THEN amount ELSE 0 END), 0) AS total_debits
        FROM wallet_logs
        WHERE order_date BETWEEN ? AND ?
        GROUP BY order_date
        ORDER BY order_date ASC`,
        [startDate, endDate]
      );

      const walletLogsMap = new Map();
      walletLogsData.forEach((row) => {
        const dateKey = normalizeDateKey(row.order_date);
        if (!dateKey) return;
        walletLogsMap.set(dateKey, parseFloat(row.total_credits) - parseFloat(row.total_debits));
      });

      // 5b. Fetch manual adjustments recorded for this range (from ops DB)
      const [adjustmentsRows] = await connection.query(
        `SELECT adjustment_date, amount, reason
         FROM wallet_adjustments
         WHERE adjustment_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );
      const adjustmentsMap = aggregateAdjustments(adjustmentsRows);

      // 6. Generate all dates in range
      const dates = [];
      let currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);
      while (currentDate <= endDateObj) {
        dates.push(currentDate.toISOString().split("T")[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 7. Calculate reconciliation for each date and prepare bulk inserts
      const rechargeInserts = [];
      const salesInserts = [];
      const reconciliationInserts = [];
      const results = [];
      
      let runningBalance = openingBalance;

      for (const date of dates) {
        const rechargeData = rechargesMap.get(date);
        const salesDataForDate = salesMap.get(date);
        const adjustment = adjustmentsMap.get(date);

        const baseRecharges = rechargeData?.total_recharges || 0;
        const baseTransactions = rechargeData?.total_transactions || 0;
        const baseSales = salesDataForDate?.gross_revenue || 0;

        const adjustmentIncrease = adjustment?.increase || 0;
        const adjustmentDecrease = adjustment?.decrease || 0;
        const adjustmentNotes = adjustment && adjustment.reasons.size > 0 ? Array.from(adjustment.reasons).join("; ") : null;
        const netAdjustment = adjustment?.net || 0;

        const totalRecharges = baseRecharges + adjustmentIncrease;
        const totalSales = baseSales + adjustmentDecrease;

        // Calculated balance from synced recharges and sales
        const calculatedBalance = runningBalance + totalRecharges - totalSales;

        // Real app balance from wallet_logs (captures all wallet movements)
        const netWalletChange = walletLogsMap.get(date);
        const appWalletBalance = netWalletChange !== undefined
          ? runningBalance + netWalletChange
          : calculatedBalance;

        const variance = calculatedBalance - appWalletBalance;
        const closingBalance = appWalletBalance;
        const isReconciled = Math.abs(closingBalance - appWalletBalance) < 1;

        // Prepare recharge insert (actual recharge data only)
        if (rechargeData) {
          rechargeInserts.push([
            date,
            baseRecharges,
            baseTransactions,
            baseRecharges,
          ]);
        }

        // Prepare sales insert (actual sales data only)
        if (salesDataForDate) {
          salesInserts.push([
            date,
            salesDataForDate.total_orders,
            salesDataForDate.total_revenue,
            salesDataForDate.total_tax,
            salesDataForDate.total_delivery_fee,
            salesDataForDate.gross_revenue,
          ]);
        }

        // Prepare reconciliation insert (includes adjustments)
        reconciliationInserts.push([
          date,
          runningBalance,
          totalRecharges,
          totalSales,
          adjustmentIncrease,
          adjustmentDecrease,
          adjustmentNotes,
          closingBalance,
          appWalletBalance,
          variance,
          isReconciled,
        ]);

        results.push({
          date,
          opening_balance: runningBalance,
          total_recharges: totalRecharges,
          total_sales: totalSales,
          adjustment_increase: adjustmentIncrease,
          adjustment_decrease: adjustmentDecrease,
          adjustment_net: netAdjustment,
          adjustment_notes: adjustmentNotes,
          closing_balance: closingBalance,
          app_wallet_balance: appWalletBalance,
          variance,
          is_reconciled: isReconciled,
        });

        // Update running balance for next day
        runningBalance = closingBalance;
      }

      // 9. Bulk insert recharges
      if (rechargeInserts.length > 0) {
        await connection.query(
          `INSERT INTO wallet_recharge_summary 
            (summary_date, total_recharges, total_transactions, net_amount)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            total_recharges = VALUES(total_recharges),
            total_transactions = VALUES(total_transactions),
            net_amount = VALUES(net_amount),
            updated_at = CURRENT_TIMESTAMP`,
          [rechargeInserts]
        );
      }

      // 10. Bulk insert sales
      if (salesInserts.length > 0) {
        await connection.query(
          `INSERT INTO sales_revenue_summary 
            (summary_date, total_orders, total_revenue, total_tax, total_delivery_fee, gross_revenue)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            total_orders = VALUES(total_orders),
            total_revenue = VALUES(total_revenue),
            total_tax = VALUES(total_tax),
            total_delivery_fee = VALUES(total_delivery_fee),
            gross_revenue = VALUES(gross_revenue),
            updated_at = CURRENT_TIMESTAMP`,
          [salesInserts]
        );
      }

      // 11. Bulk insert reconciliations
      if (reconciliationInserts.length > 0) {
        await connection.query(
          `INSERT INTO wallet_liability_reconciliation 
            (reconciliation_date, opening_balance, total_recharges, total_sales,
             adjustment_increase, adjustment_decrease, adjustment_notes,
             closing_balance, app_wallet_balance, variance, is_reconciled)
          VALUES ?
          ON DUPLICATE KEY UPDATE
            opening_balance = VALUES(opening_balance),
            total_recharges = VALUES(total_recharges),
            total_sales = VALUES(total_sales),
            adjustment_increase = VALUES(adjustment_increase),
            adjustment_decrease = VALUES(adjustment_decrease),
            adjustment_notes = VALUES(adjustment_notes),
            closing_balance = VALUES(closing_balance),
            app_wallet_balance = VALUES(app_wallet_balance),
            variance = VALUES(variance),
            is_reconciled = VALUES(is_reconciled),
            updated_at = CURRENT_TIMESTAMP`,
          [reconciliationInserts]
        );
      }

      // 12. Log the bulk sync
      await connection.query(
        `INSERT INTO wallet_accounting_sync_log 
          (sync_type, sync_date, records_processed, status, sync_duration_ms)
        VALUES 
          ('recharge', ?, ?, 'success', ?),
          ('sales', ?, ?, 'success', ?),
          ('reconciliation', ?, ?, 'success', ?)`,
        [
          endDate,
          rechargeInserts.length,
          Date.now() - startTime,
          endDate,
          salesInserts.length,
          Date.now() - startTime,
          endDate,
          reconciliationInserts.length,
          Date.now() - startTime,
        ]
      );

      await connection.commit();

      return {
        success: true,
        results,
        performance: {
          total_days: dates.length,
          duration_ms: Date.now() - startTime,
          recharges_synced: rechargeInserts.length,
          sales_synced: salesInserts.length,
          reconciliations_completed: reconciliationInserts.length,
        },
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error in bulk sync:", error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Get reconciliation report for a date range
   */
  static async getReconciliationReport(startDate, endDate) {
    try {
      const [rows] = await opsPool.query(
        `SELECT 
          reconciliation_date,
          opening_balance,
          total_recharges,
          total_sales,
          adjustment_increase,
          adjustment_decrease,
          adjustment_notes,
          closing_balance,
          app_wallet_balance,
          variance,
          is_reconciled
        FROM wallet_liability_reconciliation
        WHERE reconciliation_date BETWEEN ? AND ?
        ORDER BY reconciliation_date ASC`,
        [startDate, endDate]
      );

      return {
        success: true,
        data: rows,
      };
    } catch (error) {
      console.error("Error fetching reconciliation report:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async getSalesLineItems(startDate, endDate) {
    try {
      const [rows] = await analyticsPool.query(
        `SELECT 
          DATE(o.order_date) AS order_date,
          o.id AS order_id,
          fo.id AS food_order_id,
          fo.quantity,
          fo.price,
          (fo.price * fo.quantity) AS line_total,
          fo.food_id AS product_id,
          f.name AS product_name,
          f.unit AS unit_size,
          u.name AS customer_name,
          u.phone AS customer_phone,
          COALESCE(l.name, '') AS locality_name,
          COALESCE(da.complete_address, da.address, '') AS complete_address
        FROM orders o
        INNER JOIN food_orders fo ON fo.order_id = o.id
        INNER JOIN foods f ON f.id = fo.food_id
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN delivery_addresses da ON da.id = o.delivery_address_id
        LEFT JOIN localities l ON l.id = da.locality_id
        WHERE o.active = 1
          AND DATE(o.order_date) BETWEEN ? AND ?
        ORDER BY o.order_date ASC, o.id ASC, fo.id ASC`,
        [startDate, endDate],
      );

      let enrichedRows = rows;
      if (rows.length > 0) {
        const productIds = Array.from(
          new Set(
            rows
              .map((row) => row.product_id)
              .filter((id) => id !== null && id !== undefined),
          ),
        );

        let gstMap = new Map();
        if (productIds.length > 0) {
          const [gstRows] = await opsPool.query(
            `SELECT id, COALESCE(gst_percentage, 0) AS gst_percentage
             FROM products
             WHERE id IN (${productIds.map(() => "?").join(",")})`,
            productIds,
          );
          gstMap = new Map(gstRows.map((row) => [row.id, Number(row.gst_percentage || 0)]));
        }

        enrichedRows = rows.map((row) => ({
          ...row,
          gst_percentage: gstMap.get(row.product_id) ?? 0,
        }));
      }

      return {
        success: true,
        data: enrichedRows,
      };
    } catch (error) {
      console.error("Error fetching sales line items:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get dashboard summary
   */
  static async getDashboardSummary(startDate, endDate) {
    try {
      // Get wallet recharges summary
      const [recharges] = await opsPool.query(
        `SELECT 
          COUNT(*) as days_count,
          SUM(total_transactions) as total_transactions,
          SUM(total_recharges) as total_recharges
        FROM wallet_recharge_summary
        WHERE summary_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );

      // Get sales revenue summary
      const [sales] = await opsPool.query(
        `SELECT 
          COUNT(*) as days_count,
          SUM(total_orders) as total_orders,
          SUM(gross_revenue) as total_revenue
        FROM sales_revenue_summary
        WHERE summary_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );

      // Get latest reconciliation
      const [reconciliation] = await opsPool.query(
        `SELECT 
          reconciliation_date,
          closing_balance,
          app_wallet_balance,
          variance,
          is_reconciled
        FROM wallet_liability_reconciliation
        WHERE reconciliation_date <= ?
        ORDER BY reconciliation_date DESC
        LIMIT 1`,
        [endDate]
      );

      // Get unreconciled days count
      const [unreconciled] = await opsPool.query(
        `SELECT COUNT(*) as unreconciled_days
        FROM wallet_liability_reconciliation
        WHERE reconciliation_date BETWEEN ? AND ?
          AND is_reconciled = FALSE`,
        [startDate, endDate]
      );

      return {
        success: true,
        data: {
          recharges: recharges[0] || {},
          sales: sales[0] || {},
          latest_reconciliation: reconciliation[0] || null,
          unreconciled_days: unreconciled[0]?.unreconciled_days || 0,
        },
      };
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get sync log
   */
  static async getSyncLog(limit = 50) {
    try {
      const [rows] = await opsPool.query(
        `SELECT 
          id,
          sync_type,
          sync_date,
          records_processed,
          status,
          error_message,
          sync_duration_ms,
          created_at
        FROM wallet_accounting_sync_log
        ORDER BY created_at DESC
        LIMIT ?`,
        [limit]
      );

      return {
        success: true,
        data: rows,
      };
    } catch (error) {
      console.error("Error fetching sync log:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get daily trend chart data
   */
  static async getDailyTrend(startDate, endDate) {
    try {
      const [rows] = await opsPool.query(
        `SELECT 
          r.reconciliation_date as date,
          COALESCE(wr.total_recharges, 0) as recharges,
          COALESCE(sr.gross_revenue, 0) as revenue,
          r.closing_balance
        FROM wallet_liability_reconciliation r
        LEFT JOIN wallet_recharge_summary wr ON wr.summary_date = r.reconciliation_date
        LEFT JOIN sales_revenue_summary sr ON sr.summary_date = r.reconciliation_date
        WHERE r.reconciliation_date BETWEEN ? AND ?
        ORDER BY r.reconciliation_date ASC`,
        [startDate, endDate]
      );

      return {
        success: true,
        data: rows,
      };
    } catch (error) {
      console.error("Error fetching daily trend:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async getAdjustments(startDate, endDate) {
    try {
      const [rows] = await opsPool.query(
        `SELECT id, adjustment_date, amount, reason, notes, created_by, created_at
         FROM wallet_adjustments
         WHERE adjustment_date BETWEEN ? AND ?
         ORDER BY adjustment_date ASC, id ASC`,
        [startDate, endDate]
      );

      return {
        success: true,
        data: rows,
      };
    } catch (error) {
      console.error("Error fetching wallet adjustments:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async createAdjustment({ date, amount, reason, notes = null, createdBy = null }) {
    let connection;
    try {
      connection = await opsPool.getConnection();
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO wallet_adjustments
          (adjustment_date, amount, reason, notes, created_by)
        VALUES (?, ?, ?, ?, ?)`,
        [date, amount, reason, notes, createdBy]
      );

      await connection.commit();
      return { success: true };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error("Error creating wallet adjustment:", error);
      return { success: false, error: error.message };
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  static async deleteAdjustment(id) {
    try {
      await opsPool.query(`DELETE FROM wallet_adjustments WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting wallet adjustment:", error);
      return { success: false, error: error.message };
    }
  }
}

