import express from "express";
import pool from "../../db/pool.js";

const router = express.Router();

// Helper function to format time ago
function formatTimeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  } else if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(diffInSeconds / 31536000);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }
}

// Apply authentication middleware to all routes (temporarily disabled for testing)
// router.use(attachUser);
// router.use(requireAuth);

// Get billing summary statistics
router.get("/summary", async (req, res) => {
  try {
    const { month, year, period, entityType, status, milkType = "all" } = req.query;

    // Build where clause based on filters
    let whereClause = "1=1";
    let params = [];

    if (month && year && period) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startDay = period === "H1" ? 1 : 16;
      const endDay = period === "H1" ? 15 : new Date(y, m, 0).getDate();
      const pad = (n) => String(n).padStart(2, "0");
      const startDate = `${y}-${pad(m)}-${pad(startDay)}`;
      const endDate = `${y}-${pad(m)}-${pad(endDay)}`;
      whereClause += " AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?";
      params.push(startDate, endDate, period);
    } else {
      if (month && year) {
        const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
        const endDate = `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
        whereClause += " AND billing_period_start >= ? AND billing_period_end <= ?";
        params.push(startDate, endDate);
      }
      if (period) {
        whereClause += " AND period_type = ?";
        params.push(period);
      }
    }

    if (status) {
      whereClause += " AND billing_status_id = ?";
      params.push(status);
    }

    // Query each table with optional milkType filter (applies to farmers/cpp)
    let allRows = [];
    if (!entityType || entityType === "farmers") {
      const mtSQL = " AND (LOWER(COALESCE(f.milk_type,'')) = LOWER(?) OR LOWER(?) = 'all')";
      const [rows] = await pool.query(
        `SELECT fb.billing_status_id, fb.payment_status_id, fb.total_amount
         FROM farmer_billing fb
         LEFT JOIN farmers f ON fb.farmer_id = f.id
         WHERE ${whereClause}${mtSQL}`,
        [...params, milkType, milkType],
      );
      allRows = allRows.concat(rows);
    }
    if (!entityType || entityType === "cpp") {
      const mtSQL = " AND (LOWER(COALESCE(c.milk_type,'')) = LOWER(?) OR LOWER(?) = 'all')";
      const [rows] = await pool.query(
        `SELECT cb.billing_status_id, cb.payment_status_id, cb.total_amount
         FROM cpp_billing cb
         LEFT JOIN cpp c ON cb.cpp_id = c.id
         WHERE ${whereClause}${mtSQL}`,
        [...params, milkType, milkType],
      );
      allRows = allRows.concat(rows);
    }
    if (!entityType || entityType === "rcc") {
      const [rows] = await pool.query(
        `SELECT billing_status_id, payment_status_id, total_amount FROM rcc_billing WHERE ${whereClause}`,
        params,
      );
      allRows = allRows.concat(rows);
    }
    if (!entityType || entityType === "mp") {
      const [rows] = await pool.query(
        `SELECT billing_status_id, payment_status_id, total_amount FROM mp_billing WHERE ${whereClause}`,
        params,
      );
      allRows = allRows.concat(rows);
    }

    // Get status mappings
    const [billingStatuses] = await pool.query("SELECT id, status FROM billing_status");
    const [paymentStatuses] = await pool.query("SELECT id, status FROM payment_status");

    const billingStatusMap = {};
    const paymentStatusMap = {};

    billingStatuses.forEach((status) => {
      billingStatusMap[status.id] = status.status;
    });

    paymentStatuses.forEach((status) => {
      paymentStatusMap[status.id] = status.status;
    });

    // Process results into summary object
    const summary = {
      billing: {
        pending: 0,
        approved: 0,
        completed: 0,
        rejected: 0,
        cancelled: 0,
      },
      payment: {
        pending: 0,
        partial: 0,
        completed: 0,
      },
      amounts: {
        total: 0,
        pending: 0,
        completed: 0,
      },
    };

    allRows.forEach((row) => {
      const billingStatus = billingStatusMap[row.billing_status_id];
      const paymentStatus = paymentStatusMap[row.payment_status_id];
      const amount = parseFloat(row.total_amount || 0);

      summary.amounts.total += amount;

      if (billingStatus) {
        summary.billing[billingStatus] = (summary.billing[billingStatus] || 0) + 1;
      }
      if (paymentStatus) {
        summary.payment[paymentStatus] = (summary.payment[paymentStatus] || 0) + 1;

        if (paymentStatus === "completed") {
          summary.amounts.completed += amount;
        } else if (paymentStatus === "pending") {
          summary.amounts.pending += amount;
        }
      }
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching billing summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch billing summary",
    });
  }
});

// Get billing data for a specific entity and period
async function getBillingData(entityType, entityId, startDate, endDate, periodType) {
  let tableName, entityField;

  switch (entityType) {
    case "farmer":
      tableName = "farmer_billing";
      entityField = "farmer_id";
      break;
    case "cpp":
      tableName = "cpp_billing";
      entityField = "cpp_id";
      break;
    case "rcc":
      tableName = "rcc_billing";
      entityField = "rcc_id";
      break;
    case "mp":
      tableName = "mp_billing";
      entityField = "mp_id";
      break;
    default:
      throw new Error("Invalid entity type");
  }

  const query = `
    SELECT 
      b.*,
      bs.status as billing_status,
      ps.status as payment_status,
      pm.method as payment_method
    FROM ${tableName} b
    LEFT JOIN billing_status bs ON b.billing_status_id = bs.id
    LEFT JOIN payment_status ps ON b.payment_status_id = ps.id
    LEFT JOIN payment_methods pm ON b.payment_method_id = pm.id
    WHERE b.${entityField} = ? 
    AND b.billing_period_start = ? 
    AND b.billing_period_end = ?
    AND b.period_type = ?
  `;

  const [rows] = await pool.query(query, [entityId, startDate, endDate, periodType]);
  return rows[0] || null;
}

// Create or update billing record
async function createOrUpdateBilling(entityType, entityId, billingData) {
  let tableName, entityField;

  switch (entityType) {
    case "farmer":
      tableName = "farmer_billing";
      entityField = "farmer_id";
      break;
    case "cpp":
      tableName = "cpp_billing";
      entityField = "cpp_id";
      break;
    case "rcc":
      tableName = "rcc_billing";
      entityField = "rcc_id";
      break;
    case "mp":
      tableName = "mp_billing";
      entityField = "mp_id";
      break;
    default:
      throw new Error("Invalid entity type");
  }

  const { billing_period_start, billing_period_end, period_type, total_quantity, total_amount, billing_status_id, payment_status_id, billing_date, due_date, payment_date, payment_method_id, payment_reference, notes } = billingData;

  // Check if billing record already exists
  const existingBilling = await getBillingData(entityType === "farmers" ? "farmer" : entityType, entityId, billing_period_start, billing_period_end, period_type);

  if (existingBilling) {
    // Update existing record
    const updateQuery = `
      UPDATE ${tableName} 
      SET total_quantity = ?, total_amount = ?, billing_status_id = ?, 
          payment_status_id = ?, billing_date = ?, due_date = ?, 
          payment_date = ?, payment_method_id = ?, payment_reference = ?, 
          notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ${entityField} = ? 
      AND billing_period_start = ? 
      AND billing_period_end = ?
      AND period_type = ?
    `;

    await pool.query(updateQuery, [total_quantity, total_amount, billing_status_id, payment_status_id, billing_date, due_date, payment_date, payment_method_id, payment_reference, notes, entityId, billing_period_start, billing_period_end, period_type]);

    return { success: true, action: "updated", id: existingBilling.id };
  } else {
    // Create new record
    const insertQuery = `
      INSERT INTO ${tableName} (
        ${entityField}, billing_period_start, billing_period_end, period_type,
        total_quantity, total_amount, billing_status_id, payment_status_id,
        billing_date, due_date, payment_date, payment_method_id, 
        payment_reference, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertQuery, [entityId, billing_period_start, billing_period_end, period_type, total_quantity, total_amount, billing_status_id, payment_status_id, billing_date, due_date, payment_date, payment_method_id, payment_reference, notes]);

    return { success: true, action: "created", id: result.insertId };
  }
}

// Get all billing statuses
router.get("/statuses/billing", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM billing_status ORDER BY id");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching billing statuses:", error);
    res.status(500).json({ success: false, error: "Failed to fetch billing statuses" });
  }
});

// Get all payment statuses
router.get("/statuses/payment", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payment_status ORDER BY id");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching payment statuses:", error);
    res.status(500).json({ success: false, error: "Failed to fetch payment statuses" });
  }
});

// Get all payment methods
router.get("/methods", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM payment_methods ORDER BY id");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ success: false, error: "Failed to fetch payment methods" });
  }
});

// Get a specific bill by ID
router.get("/bills/:billId", async (req, res) => {
  try {
    const { billId } = req.params;
    const { entityType } = req.query;

    if (!entityType) {
      return res.status(400).json({
        success: false,
        error: "entityType is required",
      });
    }

    let tableName, entityField, entityTable;
    switch (entityType) {
      case "farmers":
        tableName = "farmer_billing";
        entityField = "farmer_id";
        entityTable = "farmers";
        break;
      case "cpp":
        tableName = "cpp_billing";
        entityField = "cpp_id";
        entityTable = "cpp";
        break;
      case "rcc":
        tableName = "rcc_billing";
        entityField = "rcc_id";
        entityTable = "rcc";
        break;
      case "mp":
        tableName = "mp_billing";
        entityField = "mp_id";
        entityTable = "mp";
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid entity type",
        });
    }

    const query = `
      SELECT
        '${entityType}' as entity_type,
        fb.id, fb.${entityField} as entity_id, e.name as entity_name, 
        ${entityType === "rcc" || entityType === "mp" ? "e.location" : "e.village"} as village,
        fb.billing_period_start, fb.billing_period_end, fb.period_type,
        fb.total_quantity, fb.total_amount,
        ${entityType === "cpp" ? "fb.milk_cost" : "NULL"} as milk_cost,
        ${entityType === "farmers" || entityType === "cpp" ? "e.flat_rate" : "NULL"} as rate,
        ${entityType === "cpp" ? "e.salary_type" : "NULL"} as salary_type,
        ${entityType === "cpp" ? "e.salary_amount" : "NULL"} as salary_amount,
        fb.billing_date, fb.due_date,
        bs.status as billing_status, ps.status as payment_status,
        fb.payment_date, fb.payment_reference, fb.notes,
        fb.billing_status_id, fb.payment_status_id
      FROM ${tableName} fb
      LEFT JOIN ${entityTable} e ON fb.${entityField} = e.id
      LEFT JOIN billing_status bs ON fb.billing_status_id = bs.id
      LEFT JOIN payment_status ps ON fb.payment_status_id = ps.id
      WHERE fb.id = ?
      ORDER BY fb.billing_date DESC
    `;

    const [bills] = await pool.query(query, [billId]);

    if (bills.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Bill not found",
      });
    }

    const bill = bills[0];

    // Compute CPP salary if needed (supports fixed and commission types)
    try {
      if (bill.entity_type === "cpp") {
        const salaryType = (bill.salary_type || "").toLowerCase();
        let computedSalary = null;

        if (salaryType === "fixed" || salaryType === "flat") {
          computedSalary = parseFloat(bill.salary_amount || 0) || 0;
        } else if (salaryType === "commission") {
          // Check if cpp_commission table exists
          const [tables] = await pool.query("SHOW TABLES LIKE 'cpp_commission'");
          let commissionRate = parseFloat(bill.salary_amount || 0) || 0; // fallback
          if (tables && tables.length > 0) {
            // Try to get effective commission rate for the bill period (by end date)
            const endDate = bill.billing_period_end;
            const [rows] = await pool.query(
              `SELECT rate_per_litre
               FROM cpp_commission
               WHERE cpp_id = ?
                 AND (effective_from IS NULL OR effective_from <= ?)
                 AND (effective_to IS NULL OR effective_to >= ?)
               ORDER BY effective_from DESC
               LIMIT 1`,
              [bill.entity_id, endDate, endDate],
            );
            if (rows && rows.length > 0 && rows[0].rate_per_litre != null) {
              commissionRate = parseFloat(rows[0].rate_per_litre) || commissionRate;
            }
          }
          const qty = parseFloat(bill.total_quantity || 0) || 0;
          computedSalary = commissionRate * qty;
        }

        if (computedSalary != null) {
          bill.computed_salary = computedSalary;
        }
      }
    } catch (salaryErr) {
      // Non-fatal: leave salary as-is if any error
      console.error("Error computing CPP salary:", salaryErr);
    }

    res.json({ success: true, bill });
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch bill",
    });
  }
});

// Payment Analytics API routes (must be before dynamic routes)
router.get("/analytics/summary", async (req, res) => {
  try {
    const { filterType, year, month, period, entityType, days } = req.query;

    // Build date filter for billing tables based on filter type
    let dateFilter = "";
    let params = [];

    if (filterType === "period" && year && month && period) {
      // Specific period (H1 or H2)
      const startDay = period === "H1" ? "01" : "16";
      const endDay = period === "H1" ? "15" : new Date(year, month, 0).getDate();
      dateFilter = "AND billing_period_start >= ? AND billing_period_end <= ?";
      params = [`${year}-${month.toString().padStart(2, "0")}-${startDay}`, `${year}-${month.toString().padStart(2, "0")}-${endDay}`];
    } else if (filterType === "monthly" && year && month) {
      // Entire month
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
      dateFilter = "AND billing_period_start >= ? AND billing_period_end <= ?";
      params = [startDate, endDate];
    } else if (filterType && filterType.startsWith("last") && days) {
      // Last X days - for demo purposes, show the most recent data available
      // In production, this would calculate from today's date backwards
      const daysBack = parseInt(days);

      // For demo: show September 2025 H1 data for all "last X days" filters
      // In production: const endDate = new Date(); const startDate = new Date(); startDate.setDate(endDate.getDate() - daysBack);
      const startDate = "2025-09-01";
      const endDate = "2025-09-15";

      dateFilter = "AND billing_period_start >= ? AND billing_period_end <= ?";
      params = [startDate, endDate];
    } else if (filterType === "last30days") {
      // Default: Last 30 days - show the most recent data available
      // For demo purposes, since we have 2025 data, show September 2025 H1
      // In production, this would be: startDate.setDate(endDate.getDate() - 30);
      const startDate = "2025-09-01";
      const endDate = "2025-09-15";

      dateFilter = "AND billing_period_start >= ? AND billing_period_end <= ?";
      params = [startDate, endDate];
    }

    // Initialize analytics data structure
    const analytics = {
      totalBills: { count: 0, amount: 0 },
      paidBills: { count: 0, amount: 0 },
      pendingBills: { count: 0, amount: 0 },
      partialBills: { count: 0, amount: 0 },
      entityBreakdown: {},
      entityTypeBreakdown: {},
      paymentMethodBreakdown: {},
      monthlyTrend: [],
      topEntities: [],
    };

    // Define billing tables with their configurations based on actual schema
    const billingTables = [
      {
        table: "farmer_billing",
        entityType: "farmers",
        entityTable: "farmers",
        entityField: "farmer_id",
        entityNameField: "name",
      },
      {
        table: "cpp_billing",
        entityType: "cpp",
        entityTable: "cpp",
        entityField: "cpp_id",
        entityNameField: "name",
      },
      {
        table: "rcc_billing",
        entityType: "rcc",
        entityTable: "rcc",
        entityField: "rcc_id",
        entityNameField: "name",
      },
      {
        table: "mp_billing",
        entityType: "mp",
        entityTable: "main_plants",
        entityField: "mp_id",
        entityNameField: "name",
      },
    ];

    // Check which billing tables exist
    const [tables] = await pool.query("SHOW TABLES LIKE '%_billing'");
    const existingTables = tables.map((t) => Object.values(t)[0]);

    // Filter by entity type if specified and only include existing tables
    const tablesToQuery = billingTables.filter((t) => existingTables.includes(t.table) && (!entityType || t.entityType === entityType));

    // If no billing tables exist, return empty analytics
    if (tablesToQuery.length === 0) {
      return res.json({ success: true, data: analytics });
    }

    for (const { table, entityType: type, entityTable, entityField, entityNameField } of tablesToQuery) {
      try {
        // Get billing summary with proper joins to payment_status table
        const query = `
          SELECT 
            COUNT(*) as count,
            COALESCE(SUM(b.total_amount), 0) as total_amount,
            SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) as paid_count,
            SUM(CASE WHEN ps.status = 'completed' THEN COALESCE(b.total_amount, 0) ELSE 0 END) as paid_amount,
            SUM(CASE WHEN ps.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN ps.status = 'pending' THEN COALESCE(b.total_amount, 0) ELSE 0 END) as pending_amount,
            SUM(CASE WHEN ps.status = 'partial' THEN 1 ELSE 0 END) as partial_count,
            SUM(CASE WHEN ps.status = 'partial' THEN COALESCE(b.total_amount, 0) ELSE 0 END) as partial_amount
          FROM ${table} b
          LEFT JOIN payment_status ps ON b.payment_status_id = ps.id
          WHERE 1=1 ${dateFilter}
        `;

        const [result] = await pool.query(query, params);
        const data = result[0];

        analytics.totalBills.count += parseInt(data.count || 0);
        analytics.totalBills.amount += parseFloat(data.total_amount || 0);
        analytics.paidBills.count += parseInt(data.paid_count || 0);
        analytics.paidBills.amount += parseFloat(data.paid_amount || 0);
        analytics.pendingBills.count += parseInt(data.pending_count || 0);
        analytics.pendingBills.amount += parseFloat(data.pending_amount || 0);
        analytics.partialBills.count += parseInt(data.partial_count || 0);
        analytics.partialBills.amount += parseFloat(data.partial_amount || 0);

        // Add to entity type breakdown
        const entityTypeName = type === "farmers" ? "Farmers" : type === "cpp" ? "CPPs" : type === "rcc" ? "RCCs" : type === "mp" ? "MPs" : type;

        if (!analytics.entityTypeBreakdown[entityTypeName]) {
          analytics.entityTypeBreakdown[entityTypeName] = { count: 0, amount: 0, paidAmount: 0 };
        }
        analytics.entityTypeBreakdown[entityTypeName].count += parseInt(data.count || 0);
        analytics.entityTypeBreakdown[entityTypeName].amount += parseFloat(data.total_amount || 0);
        analytics.entityTypeBreakdown[entityTypeName].paidAmount += parseFloat(data.paid_amount || 0);

        // Entity breakdown - check if entity table exists
        const [entityTableExists] = await pool.query(`SHOW TABLES LIKE '${entityTable}'`);
        if (entityTableExists.length > 0) {
          const entityQuery = `
            SELECT 
              '${type}' as entity_type,
              COALESCE(e.${entityNameField}, 'Unknown') as entity_name,
              COUNT(*) as bill_count,
              SUM(COALESCE(b.total_amount, 0)) as total_amount,
              SUM(CASE WHEN ps.status = 'completed' THEN COALESCE(b.total_amount, 0) ELSE 0 END) as paid_amount
            FROM ${table} b
            LEFT JOIN ${entityTable} e ON b.${entityField} = e.id
            LEFT JOIN payment_status ps ON b.payment_status_id = ps.id
            WHERE 1=1 ${dateFilter}
            GROUP BY e.id, e.${entityNameField}
            ORDER BY total_amount DESC
            LIMIT 10
          `;

          const [entityResults] = await pool.query(entityQuery, params);
          analytics.topEntities = analytics.topEntities.concat(entityResults);
        }

        // Payment method breakdown from payment_history table
        const [paymentHistoryExists] = await pool.query("SHOW TABLES LIKE 'payment_history'");
        if (paymentHistoryExists.length > 0) {
          // Fix the date filter for payment history query
          let paymentDateFilter = "";
          if (dateFilter) {
            paymentDateFilter = dateFilter.replace(/billing_period_start/g, "b.billing_period_start").replace(/billing_period_end/g, "b.billing_period_end");
          }

          const paymentMethodQuery = `
            SELECT 
              COALESCE(pm.method, 'Unknown') as payment_method,
              COUNT(ph.id) as payment_count,
              SUM(COALESCE(ph.payment_amount, 0)) as total_amount
            FROM payment_history ph
            LEFT JOIN payment_methods pm ON ph.payment_method_id = pm.id
            LEFT JOIN ${table} b ON ph.billing_id = b.id AND ph.billing_type = '${type === "farmers" ? "farmer" : type}'
            WHERE 1=1 ${paymentDateFilter}
            GROUP BY pm.id, pm.method
            ORDER BY total_amount DESC
          `;

          const [paymentMethodResults] = await pool.query(paymentMethodQuery, params);
          paymentMethodResults.forEach((pm) => {
            if (!analytics.paymentMethodBreakdown[pm.payment_method]) {
              analytics.paymentMethodBreakdown[pm.payment_method] = { count: 0, amount: 0 };
            }
            analytics.paymentMethodBreakdown[pm.payment_method].count += parseInt(pm.payment_count || 0);
            analytics.paymentMethodBreakdown[pm.payment_method].amount += parseFloat(pm.total_amount || 0);
          });
        }
      } catch (tableError) {
        console.error(`Error processing table ${table}:`, tableError);
        // Continue with other tables even if one fails
      }
    }

    // Sort top entities by total amount
    analytics.topEntities.sort((a, b) => parseFloat(b.total_amount) - parseFloat(a.total_amount));

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error("Error fetching payment analytics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment analytics: " + error.message,
    });
  }
});

router.get("/analytics/recent-activity", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get recent payment history from payment_history table (which has actual timestamps)
    // Use UNION to combine results from all billing types, then sort and limit
    
    const recentActivity = [];

    // Build a UNION query for all billing types
    const unionQueries = [];
    const queryParams = [];

    // Define billing table configurations
    const billingConfigs = [
      { billingType: "farmer", table: "farmer_billing", entityTable: "farmers", entityField: "farmer_id", entityNameField: "name", entityType: "farmers" },
      { billingType: "cpp", table: "cpp_billing", entityTable: "cpp", entityField: "cpp_id", entityNameField: "name", entityType: "cpp" },
      { billingType: "rcc", table: "rcc_billing", entityTable: "rcc", entityField: "rcc_id", entityNameField: "name", entityType: "rcc" },
      { billingType: "mp", table: "mp_billing", entityTable: "main_plants", entityField: "mp_id", entityNameField: "name", entityType: "mp" },
    ];

    // Check which billing tables exist and build UNION query
    const [tables] = await pool.query("SHOW TABLES LIKE '%_billing'");
    const existingTables = tables.map((t) => Object.values(t)[0]);

    for (const config of billingConfigs) {
      if (existingTables.includes(config.table)) {
        unionQueries.push(`
          SELECT 
            ph.id,
            ph.created_at as payment_timestamp,
            ph.payment_date,
            ph.payment_amount,
            ph.payment_reference,
            ph.notes,
            pm.method as payment_method,
            b.total_amount,
            ps.status as payment_status,
            e.${config.entityNameField} as entity_name,
            '${config.entityType}' as entity_type
          FROM payment_history ph
          INNER JOIN ${config.table} b ON ph.billing_id = b.id
          LEFT JOIN payment_methods pm ON ph.payment_method_id = pm.id
          LEFT JOIN payment_status ps ON b.payment_status_id = ps.id
          LEFT JOIN ${config.entityTable} e ON b.${config.entityField} = e.id
          WHERE ph.billing_type = ?
        `);
        queryParams.push(config.billingType);
      }
    }

    if (unionQueries.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Combine all queries with UNION and order by created_at, then limit
    const combinedQuery = unionQueries.join(' UNION ALL ') + ' ORDER BY payment_timestamp DESC LIMIT ?';
    queryParams.push(parseInt(limit));

    const [results] = await pool.query(combinedQuery, queryParams);

    // Format results
    results.forEach((row) => {
      recentActivity.push({
        id: row.id,
        type: "payment",
        entity: `${row.entity_name} (${row.entity_type.toUpperCase()})`,
        amount: parseFloat(row.payment_amount || row.total_amount),
        method: row.payment_method || "Unknown",
        date: row.payment_timestamp || row.payment_date, // Use created_at timestamp (has actual time)
        status: row.payment_status,
        payment_reference: row.payment_reference,
      });
    });

    // Format the data for frontend
    const formattedActivity = recentActivity.map((item) => ({
      ...item,
      time: formatTimeAgo(item.date),
    }));

    res.json({ success: true, data: formattedActivity });
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch recent activity: " + error.message,
    });
  }
});

router.get("/analytics/trends", async (req, res) => {
  try {
    const { months = 6 } = req.query;

    const trends = [];
    const currentDate = new Date();

    // Check which billing tables exist
    const [tables] = await pool.query("SHOW TABLES LIKE '%_billing'");
    const existingTables = tables.map((t) => Object.values(t)[0]);

    // If no billing tables exist, return empty trends
    if (existingTables.length === 0) {
      return res.json({ success: true, data: trends });
    }

    for (let i = parseInt(months) - 1; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

      let totalBills = 0;
      let totalAmount = 0;
      let paidAmount = 0;

      for (const table of existingTables) {
        try {
          const query = `
            SELECT 
              COUNT(*) as count,
              COALESCE(SUM(b.total_amount), 0) as amount,
              SUM(CASE WHEN ps.status = 'completed' THEN COALESCE(b.total_amount, 0) ELSE 0 END) as paid
            FROM ${table} b
            LEFT JOIN payment_status ps ON b.payment_status_id = ps.id
            WHERE b.billing_period_start >= ? AND b.billing_period_end <= ?
          `;

          const [result] = await pool.query(query, [startDate, endDate]);
          const data = result[0];

          totalBills += parseInt(data.count || 0);
          totalAmount += parseFloat(data.amount || 0);
          paidAmount += parseFloat(data.paid || 0);
        } catch (tableError) {
          console.error(`Error processing table ${table} for trends:`, tableError);
          // Continue with other tables even if one fails
        }
      }

      trends.push({
        month: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        period: `${year}-${month.toString().padStart(2, "0")}`,
        totalBills,
        totalAmount,
        paidAmount,
        paymentRate: totalAmount > 0 ? ((paidAmount / totalAmount) * 100).toFixed(1) : 0,
      });
    }

    res.json({ success: true, data: trends });
  } catch (error) {
    console.error("Error fetching payment trends:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment trends: " + error.message,
    });
  }
});

// Get billing data for specific entity
router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { startDate, endDate, periodType } = req.query;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    const billingData = await getBillingData(entityType === "farmers" ? "farmer" : entityType, entityId, startDate, endDate, periodType);

    res.json({ success: true, data: billingData });
  } catch (error) {
    console.error("Error fetching billing data:", error);
    res.status(500).json({ success: false, error: "Failed to fetch billing data" });
  }
});

// Create or update billing record
router.post("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const billingData = req.body;

    // Validate required fields
    const requiredFields = ["billing_period_start", "billing_period_end", "period_type", "total_quantity", "total_amount"];
    for (const field of requiredFields) {
      if (!billingData[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        });
      }
    }

    const result = await createOrUpdateBilling(entityType, entityId, billingData);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error creating/updating billing:", error);
    res.status(500).json({ success: false, error: "Failed to create/update billing" });
  }
});

// Get payment history for a specific bill by bill ID
router.get("/:entityType/:billId/payments", async (req, res) => {
  try {
    const { entityType, billId } = req.params;

    // Get payment history for this specific bill
    const [payments] = await pool.query(
      `SELECT ph.*, pm.method as payment_method 
       FROM payment_history ph 
       LEFT JOIN payment_methods pm ON ph.payment_method_id = pm.id 
       WHERE ph.billing_type = ? AND ph.billing_id = ? 
       ORDER BY ph.payment_date DESC`,
      [entityType === "farmers" ? "farmer" : entityType, billId],
    );

    res.json({ success: true, payments });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ success: false, error: "Failed to fetch payment history" });
  }
});

// Get payment history for billing record
router.get("/:entityType/:entityId/payments", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { startDate, endDate, periodType } = req.query;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    // Get billing record
    const billingData = await getBillingData(entityType === "farmers" ? "farmer" : entityType, entityId, startDate, endDate, periodType);
    if (!billingData) {
      return res.status(404).json({
        success: false,
        error: "Billing record not found",
      });
    }

    // Get payment history
    const [payments] = await pool.query(
      `SELECT ph.*, pm.method as payment_method 
       FROM payment_history ph 
       LEFT JOIN payment_methods pm ON ph.payment_method_id = pm.id 
       WHERE ph.billing_type = ? AND ph.billing_id = ? 
       ORDER BY ph.payment_date DESC`,
      [entityType, billingData.id],
    );

    res.json({ success: true, data: payments });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    res.status(500).json({ success: false, error: "Failed to fetch payment history" });
  }
});

// Get all bills with filters
router.get("/bills", async (req, res) => {
  try {
    const { entityType, month, year, period, status, milkType = "all" } = req.query;

    let whereClause = "1=1";
    let params = [];

    // If month, year, and period are provided, constrain to exact period dates
    if (month && year && period) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startDay = period === "H1" ? 1 : 16;
      const endDay = period === "H1" ? 15 : new Date(y, m, 0).getDate();
      const pad = (n) => String(n).padStart(2, "0");
      const startDate = `${y}-${pad(m)}-${pad(startDay)}`;
      const endDate = `${y}-${pad(m)}-${pad(endDay)}`;
      whereClause += " AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?";
      params.push(startDate, endDate, period);
    } else {
      if (month && year) {
        const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
        const endDate = `${year}-${month.toString().padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
        whereClause += " AND billing_period_start >= ? AND billing_period_end <= ?";
        params.push(startDate, endDate);
      }
      if (period) {
        whereClause += " AND period_type = ?";
        params.push(period);
      }
    }

    if (status) {
      whereClause += " AND billing_status_id = ?";
      params.push(status);
    }

    let query;
    let bills = [];

    if (!entityType || entityType === "farmers") {
      query = `
        SELECT 
          'farmers' as entity_type,
          fb.id, fb.farmer_id as entity_id, f.name as entity_name, f.village,
          fb.billing_period_start, fb.billing_period_end, fb.period_type,
          fb.total_quantity, fb.total_amount, fb.billing_date, fb.due_date,
          bs.status as billing_status, ps.status as payment_status,
          fb.payment_date, fb.payment_reference, fb.notes
        FROM farmer_billing fb
        LEFT JOIN farmers f ON fb.farmer_id = f.id
        LEFT JOIN billing_status bs ON fb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON fb.payment_status_id = ps.id
        WHERE ${whereClause} AND (LOWER(COALESCE(f.milk_type,'')) = LOWER(?) OR LOWER(?) = 'all')
        ORDER BY CASE WHEN ps.status = 'completed' THEN 0 ELSE 1 END, fb.billing_date DESC
      `;
      const [farmerBills] = await pool.query(query, [...params, milkType, milkType]);
      bills = bills.concat(farmerBills);
    }

    if (!entityType || entityType === "cpp") {
      query = `
        SELECT 
          'cpp' as entity_type,
          cb.id, cb.cpp_id as entity_id, c.name as entity_name, c.village,
          cb.billing_period_start, cb.billing_period_end, cb.period_type,
          cb.total_quantity, cb.total_amount, cb.billing_date, cb.due_date,
          bs.status as billing_status, ps.status as payment_status,
          cb.payment_date, cb.payment_reference, cb.notes
        FROM cpp_billing cb
        LEFT JOIN cpp c ON cb.cpp_id = c.id
        LEFT JOIN billing_status bs ON cb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON cb.payment_status_id = ps.id
        WHERE ${whereClause} AND (LOWER(COALESCE(c.milk_type,'')) = LOWER(?) OR LOWER(?) = 'all')
        ORDER BY CASE WHEN ps.status = 'completed' THEN 0 ELSE 1 END, cb.billing_date DESC
      `;
      const [cppBills] = await pool.query(query, [...params, milkType, milkType]);
      bills = bills.concat(cppBills);
    }

    if (!entityType || entityType === "rcc") {
      query = `
        SELECT 
          'rcc' as entity_type,
          rb.id, rb.rcc_id as entity_id, r.name as entity_name, r.location as village,
          rb.billing_period_start, rb.billing_period_end, rb.period_type,
          rb.total_quantity, rb.total_amount, rb.billing_date, rb.due_date,
          bs.status as billing_status, ps.status as payment_status,
          rb.payment_date, rb.payment_reference, rb.notes
        FROM rcc_billing rb
        LEFT JOIN rcc r ON rb.rcc_id = r.id
        LEFT JOIN billing_status bs ON rb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON rb.payment_status_id = ps.id
        WHERE ${whereClause}
        ORDER BY CASE WHEN ps.status = 'completed' THEN 0 ELSE 1 END, rb.billing_date DESC
      `;
      const [rccBills] = await pool.query(query, params);
      bills = bills.concat(rccBills);
    }

    if (!entityType || entityType === "mp") {
      query = `
        SELECT 
          'mp' as entity_type,
          mb.id, mb.mp_id as entity_id, mp.name as entity_name, mp.location as village,
          mb.billing_period_start, mb.billing_period_end, mb.period_type,
          mb.total_quantity, mb.total_amount, mb.billing_date, mb.due_date,
          bs.status as billing_status, ps.status as payment_status,
          mb.payment_date, mb.payment_reference, mb.notes
        FROM mp_billing mb
        LEFT JOIN main_plants mp ON mb.mp_id = mp.id
        LEFT JOIN billing_status bs ON mb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON mb.payment_status_id = ps.id
        WHERE ${whereClause}
        ORDER BY CASE WHEN ps.status = 'completed' THEN 0 ELSE 1 END, mb.billing_date DESC
      `;
      const [mpBills] = await pool.query(query, params);
      bills = bills.concat(mpBills);
    }

    // Sort all bills by payment status (completed first), then by billing date
    bills.sort((a, b) => {
      const aCompleted = (a.payment_status || "").toLowerCase() === "completed";
      const bCompleted = (b.payment_status || "").toLowerCase() === "completed";
      
      // If one is completed and the other isn't, completed comes first
      if (aCompleted && !bCompleted) return -1;
      if (!aCompleted && bCompleted) return 1;
      
      // If both have same payment status, sort by billing date DESC
      return new Date(b.billing_date) - new Date(a.billing_date);
    });

    res.json({ success: true, bills, count: bills.length });
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch bills",
    });
  }
});

// Update bill (edit functionality)
router.put("/:entityType/:billId", async (req, res) => {
  try {
    const { entityType, billId } = req.params;
    const { billing_status_id, due_date, notes } = req.body;

    let tableName;
    switch (entityType) {
      case "farmers":
        tableName = "farmer_billing";
        break;
      case "cpp":
        tableName = "cpp_billing";
        break;
      case "rcc":
        tableName = "rcc_billing";
        break;
      case "mp":
        tableName = "mp_billing";
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid entity type",
        });
    }

    const updateFields = [];
    const updateValues = [];

    if (billing_status_id !== undefined) {
      updateFields.push("billing_status_id = ?");
      updateValues.push(billing_status_id);
    }
    if (due_date !== undefined) {
      updateFields.push("due_date = ?");
      updateValues.push(due_date);
    }
    if (notes !== undefined) {
      updateFields.push("notes = ?");
      updateValues.push(notes);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    updateValues.push(billId);

    const query = `UPDATE ${tableName} SET ${updateFields.join(", ")} WHERE id = ?`;
    await pool.query(query, updateValues);

    res.json({ success: true, message: "Bill updated successfully" });
  } catch (error) {
    console.error("Error updating bill:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update bill",
    });
  }
});

// Record payment for a bill
router.post("/:entityType/:billId/payment", async (req, res) => {
  try {
    const { entityType, billId } = req.params;
    const { payment_amount, payment_method_id, payment_date, payment_reference, notes } = req.body;

    if (!payment_amount || !payment_method_id || !payment_date) {
      return res.status(400).json({
        success: false,
        error: "payment_amount, payment_method_id, and payment_date are required",
      });
    }

    let tableName, entityField;
    switch (entityType) {
      case "farmers":
        tableName = "farmer_billing";
        entityField = "farmer_id";
        break;
      case "cpp":
        tableName = "cpp_billing";
        entityField = "cpp_id";
        break;
      case "rcc":
        tableName = "rcc_billing";
        entityField = "rcc_id";
        break;
      case "mp":
        tableName = "mp_billing";
        entityField = "mp_id";
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid entity type",
        });
    }

    // Get the billing record to check total amount
    const [billingRecord] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [billId]);
    if (billingRecord.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Billing record not found",
      });
    }

    const bill = billingRecord[0];
    const totalAmount = parseFloat(bill.total_amount);
    const paidAmount = parseFloat(payment_amount);

    // Add payment to payment_history
    const [result] = await pool.query(
      `INSERT INTO payment_history (billing_type, billing_id, payment_amount, payment_method_id, payment_reference, payment_date, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [entityType === "farmers" ? "farmer" : entityType, billId, paidAmount, payment_method_id, payment_reference, payment_date, notes],
    );

    // Calculate total paid amount for this bill
    const [totalPaidResult] = await pool.query(
      `SELECT SUM(payment_amount) as total_paid FROM payment_history 
       WHERE billing_type = ? AND billing_id = ?`,
      [entityType === "farmers" ? "farmer" : entityType, billId],
    );

    const totalPaid = parseFloat(totalPaidResult[0].total_paid || 0);

    // Update payment status based on total paid amount
    let newPaymentStatusId;
    if (totalPaid >= totalAmount) {
      newPaymentStatusId = 3; // completed
    } else if (totalPaid > 0) {
      newPaymentStatusId = 2; // partial
    } else {
      newPaymentStatusId = 1; // pending
    }

    // If payment is completed, also update billing status to completed
    let newBillingStatusId = bill.billing_status_id; // Keep current billing status by default
    if (newPaymentStatusId === 3) {
      newBillingStatusId = 9; // completed (ID 9 in billing_status table)
    }

    // Update the billing record with new payment status, billing status, payment date, and payment details
    await pool.query(
      `UPDATE ${tableName} 
       SET payment_status_id = ?, billing_status_id = ?, payment_date = ?, 
           payment_method_id = ?, payment_reference = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newPaymentStatusId, newBillingStatusId, payment_date, payment_method_id, payment_reference, notes, billId],
    );

    res.json({
      success: true,
      message: "Payment recorded successfully",
      payment_id: result.insertId,
      total_paid: totalPaid,
      payment_status: newPaymentStatusId === 3 ? "completed" : newPaymentStatusId === 2 ? "partial" : "pending",
      billing_status: newBillingStatusId === 9 ? "completed" : newBillingStatusId === 2 ? "approved" : newBillingStatusId === 3 ? "rejected" : newBillingStatusId === 4 ? "cancelled" : "pending",
      billing_status_changed: newBillingStatusId !== bill.billing_status_id,
    });
  } catch (error) {
    console.error("Error recording payment:", error);
    res.status(500).json({
      success: false,
      error: "Failed to record payment",
    });
  }
});

export default router;
