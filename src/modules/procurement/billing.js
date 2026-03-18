// src/modules/procurement/billing.js
import { Router } from "express";
import pool from "../../db/pool.js";
import { buildSEO } from "../../utils/seo.js";

const billing = Router();

// Access: RCC/MP/PO/ADMIN - Apply only to billing routes (temporarily disabled for testing)
// billing.use(requireRole('RCC','MP','PO','ADMIN'));

function getPeriodDates(year, month, period) {
  const startDay = period === "H1" ? 1 : 16;
  const endDay = period === "H1" ? 15 : new Date(year, month, 0).getDate();

  return {
    start: `${year}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
    label: `${year}-${String(month).padStart(2, "0")}-${period}`,
  };
}

async function computeRateForEntry(entry, farmerData, cppData) {
  // Farmer rate (highest priority for farmers)
  if (farmerData && farmerData.rate_type === "flat" && farmerData.flat_rate) {
    return Number(farmerData.flat_rate);
  }
  if (farmerData && farmerData.rate_type === "chart" && farmerData.rate_chart_id) {
    const [[slab]] = await pool.query("SELECT rate_per_litre FROM rate_chart_slabs WHERE chart_id=? AND ? BETWEEN fat_min AND fat_max ORDER BY fat_min LIMIT 1", [farmerData.rate_chart_id, entry.fat || 0]);
    if (slab) {
      // Auto-activate rate chart when first used
      await pool.query("UPDATE rate_charts SET status = 'active' WHERE id = ? AND status = 'inactive'", [farmerData.rate_chart_id]);
      return Number(slab.rate_per_litre);
    }
  }

  // CPP rate (fallback for farmers, primary for CPP level)
  if (cppData && cppData.rate_type === "flat" && cppData.flat_rate) {
    return Number(cppData.flat_rate);
  }
  if (cppData && cppData.rate_type === "chart" && cppData.rate_chart_id) {
    const [[slab]] = await pool.query("SELECT rate_per_litre FROM rate_chart_slabs WHERE chart_id=? AND ? BETWEEN fat_min AND fat_max ORDER BY fat_min LIMIT 1", [cppData.rate_chart_id, entry.fat || 0]);
    if (slab) {
      // Auto-activate rate chart when first used
      await pool.query("UPDATE rate_charts SET status = 'active' WHERE id = ? AND status = 'inactive'", [cppData.rate_chart_id]);
      return Number(slab.rate_per_litre);
    }
  }

  return 0;
}

async function getBillingData(level, startDate, endDate, period = "H1", milkType = "all") {
  let query, params;

  switch (level) {
    case "farmers":
      query = `
        SELECT 
          f.id, f.name, f.village, f.milk_type,
          f.rate_type, f.flat_rate, f.rate_chart_id,
          c.name as cpp_name,
          SUM(me.qty_litres) as total_qty,
          AVG(me.fat) as avg_fat,
          AVG(me.snf) as avg_snf,
          AVG(me.clr) as avg_clr,
          AVG(me.water_pct) as avg_water,
          bs.status as billing_status,
          ps.status as payment_status,
          fb.payment_date
        FROM farmers f
        LEFT JOIN cpp c ON c.id = f.cpp_id
        LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
        LEFT JOIN farmer_billing fb ON fb.farmer_id = f.id AND fb.billing_period_start = ? AND fb.billing_period_end = ? AND fb.period_type = ?
        LEFT JOIN billing_status bs ON fb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON fb.payment_status_id = ps.id
        WHERE f.status = 'active'
        GROUP BY f.id, f.name, f.village, f.milk_type, f.rate_type, f.flat_rate, f.rate_chart_id, c.name, bs.status, ps.status, fb.payment_date
        ORDER BY f.name
      `;
      params = [startDate, endDate, startDate, endDate, period];
      break;

    case "cpp":
      query = `
        SELECT 
          c.id, c.name, c.village, c.milk_type,
          c.rate_type, c.flat_rate, c.rate_chart_id,
          r.name as rcc_name,
          SUM(me.qty_litres) as total_qty,
          AVG(me.fat) as avg_fat,
          AVG(me.snf) as avg_snf,
          AVG(me.clr) as avg_clr,
          AVG(me.water_pct) as avg_water,
          bs.status as billing_status,
          ps.status as payment_status,
          cb.payment_date,
          cb.total_amount,
          cb.milk_cost,
          cb.salary_amount,
          cb.salary_type
        FROM cpp c
        LEFT JOIN rcc r ON r.id = c.rcc_id
        LEFT JOIN milk_entries_rcc me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
        LEFT JOIN cpp_billing cb ON cb.cpp_id = c.id AND cb.billing_period_start = ? AND cb.billing_period_end = ? AND cb.period_type = ?
        LEFT JOIN billing_status bs ON cb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON cb.payment_status_id = ps.id
        WHERE c.status = 'active' AND (LOWER(COALESCE(c.milk_type, '')) = LOWER(?) OR LOWER(?) = 'all')
        GROUP BY c.id, c.name, c.village, c.milk_type, c.rate_type, c.flat_rate, c.rate_chart_id, r.name, bs.status, ps.status, cb.payment_date, cb.total_amount, cb.milk_cost, cb.salary_amount, cb.salary_type
        ORDER BY c.name
      `;
      params = [startDate, endDate, startDate, endDate, period, milkType, milkType];
      break;

    case "rcc":
      query = `
        SELECT 
          r.id, r.name, r.location as village, 'A2' as milk_type,
          'flat' as rate_type, 60.00 as flat_rate, NULL as rate_chart_id,
          'RCC' as rcc_name,
          SUM(me.qty_litres) as total_qty,
          AVG(me.fat) as avg_fat,
          AVG(me.snf) as avg_snf,
          AVG(me.clr) as avg_clr,
          AVG(me.water_pct) as avg_water,
          bs.status as billing_status,
          ps.status as payment_status,
          rb.payment_date
        FROM rcc r
        LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
        LEFT JOIN rcc_billing rb ON rb.rcc_id = r.id AND rb.billing_period_start = ? AND rb.billing_period_end = ? AND rb.period_type = ?
        LEFT JOIN billing_status bs ON rb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON rb.payment_status_id = ps.id
        WHERE r.status = 'active'
        GROUP BY r.id, r.name, r.location, bs.status, ps.status, rb.payment_date
        ORDER BY r.name
      `;
      params = [startDate, endDate, startDate, endDate, period];
      break;

    case "mp":
      query = `
        SELECT 
          mp.id, mp.name, 'Main Plant' as village, 'A2' as milk_type,
          'flat' as rate_type, 70.00 as flat_rate, NULL as rate_chart_id,
          'MP' as rcc_name,
          SUM(me.qty_litres) as total_qty,
          AVG(me.fat) as avg_fat,
          AVG(me.snf) as avg_snf,
          AVG(me.clr) as avg_clr,
          AVG(me.water_pct) as avg_water,
          bs.status as billing_status,
          ps.status as payment_status,
          mb.payment_date
        FROM main_plants mp
        LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
        LEFT JOIN mp_billing mb ON mb.mp_id = mp.id AND mb.billing_period_start = ? AND mb.billing_period_end = ? AND mb.period_type = ?
        LEFT JOIN billing_status bs ON mb.billing_status_id = bs.id
        LEFT JOIN payment_status ps ON mb.payment_status_id = ps.id
        GROUP BY mp.id, mp.name, bs.status, ps.status, mb.payment_date
        ORDER BY mp.name
      `;
      params = [startDate, endDate, startDate, endDate, period];
      break;

    default:
      return [];
  }

  const [rows] = await pool.query(query, params);
  return rows;
}

// Main billing navigation page
// Billing management page
billing.get("/procurement/billing/management", (req, res) => {
  const seo = buildSEO({ title: "Billing Management", url: req.path });
  res.render("pages/ops/procurement/billing-management", {
    title: "Billing Management",
    user: req.user || null,
    seo: seo,
  });
});

// Generate bills page
billing.get("/procurement/billing/generate", (req, res) => {
  const seo = buildSEO({ title: "Generate Bills", url: req.path });
  res.render("pages/ops/procurement/generate-bills", {
    title: "Generate Bills",
    user: req.user || null,
    seo: seo,
  });
});

// API endpoint to get payment breakup for billing (updated format)
billing.get("/api/billing/payment-breakup", async (req, res) => {
  try {
    const { month, year, period, entity = "farmers", milkType = "all" } = req.query;

    if (!month || !year || !period) {
      return res.status(400).json({
        success: false,
        error: "month, year, and period are required",
      });
    }

    const { start, end } = getPeriodDates(parseInt(year), parseInt(month), period);

    // Determine table name based on entity
    let tableName;
    let joinSQL = "";
    let milkTypeFilterSQL = "";
    switch (entity) {
      case "cpp":
        tableName = "cpp_billing";
        joinSQL = " LEFT JOIN cpp c ON c.id = t.cpp_id ";
        milkTypeFilterSQL = " AND (LOWER(COALESCE(c.milk_type, '')) = LOWER(?) OR LOWER(?) = 'all') ";
        break;
      case "rcc":
        tableName = "rcc_billing";
        break;
      case "mp":
        tableName = "mp_billing";
        break;
      case "farmers":
      default:
        tableName = "farmer_billing";
        // Apply milk type filtering for farmers like CPP
        joinSQL = " LEFT JOIN farmers f ON f.id = t.farmer_id ";
        milkTypeFilterSQL = " AND (LOWER(COALESCE(f.milk_type, '')) = LOWER(?) OR LOWER(?) = 'all') ";
        break;
    }

    // Get total bills data
    const [totalBillsData] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT t.id) as total_bills_count,
        COALESCE(SUM(t.total_amount), 0) as total_bills_amount
      FROM ${tableName} t
      ${joinSQL}
      WHERE t.billing_period_start = ? AND t.billing_period_end = ? AND t.period_type = ?
      ${milkTypeFilterSQL}
    `,
      joinSQL ? [start, end, period, milkType, milkType] : [start, end, period],
    );

    // Get pending bills data
    const [pendingBillsData] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT t.id) as pending_bills_count,
        COALESCE(SUM(t.total_amount), 0) as pending_bills_amount
      FROM ${tableName} t
      LEFT JOIN payment_status ps ON t.payment_status_id = ps.id
      ${joinSQL}
      WHERE t.billing_period_start = ? AND t.billing_period_end = ? AND t.period_type = ?
      AND (ps.status = 'Pending' OR ps.status IS NULL)
      AND t.payment_date IS NULL
      ${milkTypeFilterSQL}
    `,
      joinSQL ? [start, end, period, milkType, milkType] : [start, end, period],
    );

    // Get paid bills data
    const [paidBillsData] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT t.id) as paid_bills_count,
        COALESCE(SUM(t.total_amount), 0) as paid_bills_amount
      FROM ${tableName} t
      LEFT JOIN payment_status ps ON t.payment_status_id = ps.id
      ${joinSQL}
      WHERE t.billing_period_start = ? AND t.billing_period_end = ? AND t.period_type = ?
      AND (
        ps.status IN ('Paid', 'Completed')
        OR t.payment_date IS NOT NULL
      )
      ${milkTypeFilterSQL}
    `,
      joinSQL ? [start, end, period, milkType, milkType] : [start, end, period],
    );

    const totalBills = totalBillsData[0];
    const pendingBills = pendingBillsData[0];
    const paidBills = paidBillsData[0];

    res.json({
      success: true,
      data: {
        totalBills: {
          count: totalBills?.total_bills_count || 0,
          amount: Number(totalBills?.total_bills_amount || 0),
        },
        pendingBills: {
          count: pendingBills?.pending_bills_count || 0,
          amount: Number(pendingBills?.pending_bills_amount || 0),
        },
        paidBills: {
          count: paidBills?.paid_bills_count || 0,
          amount: Number(paidBills?.paid_bills_amount || 0),
        },
        hasBills: (totalBills?.total_bills_count || 0) > 0,
      },
    });
  } catch (error) {
    console.error("Error fetching payment breakup:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch payment breakup data",
    });
  }
});

// API endpoint to get entity counts and volumes for generate bills page
billing.get("/api/billing/entity-stats", async (req, res) => {
  try {
    const { month, year, period } = req.query;

    if (!month || !year || !period) {
      return res.status(400).json({
        success: false,
        error: "month, year, and period are required",
      });
    }

    const { start, end } = getPeriodDates(parseInt(year), parseInt(month), period);

    // Get farmers stats
    const [farmersStats] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT f.id) as count,
        COALESCE(SUM(me.qty_litres), 0) as total_volume
      FROM farmers f
      LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
      WHERE f.status = 'active'
    `,
      [start, end],
    );

    // Get CPP stats
    const [cppStats] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT c.id) as count,
        COALESCE(SUM(me.qty_litres), 0) as total_volume
      FROM cpp c
      LEFT JOIN milk_entries_cpp me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
      WHERE c.status = 'active'
    `,
      [start, end],
    );

    // Get RCC stats
    const [rccStats] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT r.id) as count,
        COALESCE(SUM(me.qty_litres), 0) as total_volume
      FROM rcc r
      LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
      WHERE r.status = 'active'
    `,
      [start, end],
    );

    // Get MP stats
    const [mpStats] = await pool.query(
      `
      SELECT 
        COUNT(DISTINCT mp.id) as count,
        COALESCE(SUM(me.qty_litres), 0) as total_volume
      FROM main_plants mp
      LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
    `,
      [start, end],
    );

    res.json({
      success: true,
      data: {
        farmers: {
          count: farmersStats[0].count,
          volume: Number(farmersStats[0].total_volume).toFixed(1),
        },
        cpp: {
          count: cppStats[0].count,
          volume: Number(cppStats[0].total_volume).toFixed(1),
        },
        rcc: {
          count: rccStats[0].count,
          volume: Number(rccStats[0].total_volume).toFixed(1),
        },
        mp: {
          count: mpStats[0].count,
          volume: Number(mpStats[0].total_volume).toFixed(1),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching entity stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch entity statistics",
    });
  }
});

billing.get("/procurement/billing", async (req, res) => {
  const seo = buildSEO({ title: "Billing — Procurement", url: req.path });

  try {
    // Get overview statistics for the main page
    const today = new Date();
    const { start, end } = getPeriodDates(today.getFullYear(), today.getMonth() + 1, "H1");

    // Get counts for each level
    const [farmersCount] = await pool.query("SELECT COUNT(*) as count FROM farmers WHERE status = 'active'");
    const [cppCount] = await pool.query("SELECT COUNT(*) as count FROM cpp WHERE status = 'active'");
    const [rccCount] = await pool.query("SELECT COUNT(*) as count FROM rcc WHERE status = 'active'");
    const [mpCount] = await pool.query("SELECT COUNT(*) as count FROM main_plants");
    const [rateChartsCount] = await pool.query("SELECT COUNT(*) as count FROM rate_charts");

    // Get current cycle data (volume and amount) for each level
    const [farmersCurrent] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(me.qty_litres), 0) as volume,
        COALESCE(SUM(me.qty_litres * COALESCE(f.flat_rate, 50)), 0) as amount
      FROM farmers f
      LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
      WHERE f.status = 'active'
    `,
      [start, end],
    );

    const [cppCurrent] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(me.qty_litres), 0) as volume,
        COALESCE(SUM(me.qty_litres * COALESCE(c.flat_rate, 55)), 0) as amount
      FROM cpp c
      LEFT JOIN milk_entries_rcc me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
      WHERE c.status = 'active'
    `,
      [start, end],
    );

    const [rccCurrent] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(me.qty_litres), 0) as volume,
        COALESCE(SUM(me.qty_litres * 60), 0) as amount
      FROM rcc r
      LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
      WHERE r.status = 'active'
    `,
      [start, end],
    );

    const [mpCurrent] = await pool.query(
      `
      SELECT 
        COALESCE(SUM(me.qty_litres), 0) as volume,
        COALESCE(SUM(me.qty_litres * 70), 0) as amount
      FROM main_plants mp
      LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
    `,
      [start, end],
    );

    // Get pending bills data (all unpaid bills across all periods)
    const [farmersPending] = await pool.query(`
      SELECT 
        COUNT(DISTINCT fb.id) as count,
        COALESCE(SUM(fb.total_amount), 0) as amount
      FROM farmer_billing fb
      LEFT JOIN payment_status ps ON fb.payment_status_id = ps.id
      WHERE ps.status = 'Pending' OR ps.status IS NULL
    `);

    const [cppPending] = await pool.query(`
      SELECT 
        COUNT(DISTINCT cb.id) as count,
        COALESCE(SUM(cb.total_amount), 0) as amount
      FROM cpp_billing cb
      LEFT JOIN payment_status ps ON cb.payment_status_id = ps.id
      WHERE ps.status = 'Pending' OR ps.status IS NULL
    `);

    const [rccPending] = await pool.query(`
      SELECT 
        COUNT(DISTINCT rb.id) as count,
        COALESCE(SUM(rb.total_amount), 0) as amount
      FROM rcc_billing rb
      LEFT JOIN payment_status ps ON rb.payment_status_id = ps.id
      WHERE ps.status = 'Pending' OR ps.status IS NULL
    `);

    const [mpPending] = await pool.query(`
      SELECT 
        COUNT(DISTINCT mb.id) as count,
        COALESCE(SUM(mb.total_amount), 0) as amount
      FROM mp_billing mb
      LEFT JOIN payment_status ps ON mb.payment_status_id = ps.id
      WHERE ps.status = 'Pending' OR ps.status IS NULL
    `);

    // Calculate totals with proper null/undefined handling
    // Ensure we have valid data from queries
    const farmersData = farmersCurrent && farmersCurrent.length > 0 ? farmersCurrent[0] : { volume: 0, amount: 0 };
    const cppData = cppCurrent && cppCurrent.length > 0 ? cppCurrent[0] : { volume: 0, amount: 0 };
    const rccData = rccCurrent && rccCurrent.length > 0 ? rccCurrent[0] : { volume: 0, amount: 0 };
    const mpData = mpCurrent && mpCurrent.length > 0 ? mpCurrent[0] : { volume: 0, amount: 0 };

    const farmersVol = Number(farmersData.volume) || 0;
    const cppVol = Number(cppData.volume) || 0;
    const rccVol = Number(rccData.volume) || 0;
    const mpVol = Number(mpData.volume) || 0;

    const farmersAmt = Number(farmersData.amount) || 0;
    const cppAmt = Number(cppData.amount) || 0;
    const rccAmt = Number(rccData.amount) || 0;
    const mpAmt = Number(mpData.amount) || 0;

    const totalVolume = farmersVol + cppVol + rccVol + mpVol;
    const totalAmount = farmersAmt + cppAmt + rccAmt + mpAmt;

    // Build last 5 cycles (H1/H2) data for each section
    function getLastNCycles(n = 5) {
      const cycles = [];
      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth() + 1; // 1-12
      let half = now.getDate() <= 15 ? "H1" : "H2";

      for (let i = 0; i < n; i++) {
        cycles.push({ year, month, period: half });
        // step back one half-month
        if (half === "H2") {
          half = "H1";
        } else {
          half = "H2";
          month -= 1;
          if (month === 0) {
            month = 12;
            year -= 1;
          }
        }
      }
      return cycles;
    }

    async function buildCycleRow({ year, month, period }, level) {
      const { start, end, label } = getPeriodDates(year, month, period);
      let volumeQuery = "";
      let volumeParams = [start, end];
      if (level === "farmers") {
        volumeQuery = `
          SELECT COALESCE(SUM(me.qty_litres), 0) as volume
          FROM farmers f
          LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
          WHERE f.status = 'active'
        `;
      } else if (level === "cpp") {
        volumeQuery = `
          SELECT COALESCE(SUM(me.qty_litres), 0) as volume
          FROM cpp c
          LEFT JOIN milk_entries_rcc me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
          WHERE c.status = 'active'
        `;
      } else if (level === "rcc") {
        volumeQuery = `
          SELECT COALESCE(SUM(me.qty_litres), 0) as volume
          FROM rcc r
          LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
          WHERE r.status = 'active'
        `;
      } else if (level === "mp") {
        volumeQuery = `
          SELECT COALESCE(SUM(me.qty_litres), 0) as volume
          FROM main_plants mp
          LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
        `;
      }

      const [volRows] = await pool.query(volumeQuery, volumeParams);
      const volume = Number(volRows?.[0]?.volume || 0);

      let tableName = "farmer_billing";
      if (level === "cpp") tableName = "cpp_billing";
      if (level === "rcc") tableName = "rcc_billing";
      if (level === "mp") tableName = "mp_billing";

      const [billRows] = await pool.query(
        `
          SELECT 
            COUNT(*) as total_count,
            SUM(CASE WHEN (ps.status = 'Pending' OR ps.status IS NULL) AND t.payment_date IS NULL THEN 1 ELSE 0 END) as pending_count
          FROM ${tableName} t
          LEFT JOIN payment_status ps ON t.payment_status_id = ps.id
          WHERE t.billing_period_start = ? AND t.billing_period_end = ? AND t.period_type = ?
        `,
        [start, end, period],
      );

      const totalCount = Number(billRows?.[0]?.total_count || 0);
      const pendingCount = Number(billRows?.[0]?.pending_count || 0);
      let status = "No Bills";
      if (totalCount > 0) {
        status = pendingCount > 0 ? "Pending" : "Paid";
      }

      // Total amount for the cycle (from generated bills if present)
      const [amountRows] = await pool.query(
        `
          SELECT COALESCE(SUM(t.total_amount), 0) as amount
          FROM ${tableName} t
          WHERE t.billing_period_start = ? AND t.billing_period_end = ? AND t.period_type = ?
        `,
        [start, end, period],
      );
      let amount = Number(amountRows?.[0]?.amount || 0);

      // Fallback: if no generated bills exist for this cycle, estimate amount from milk entries
      if (!amount) {
        let estimateQuery = "";
        if (level === "farmers") {
          estimateQuery = `
            SELECT COALESCE(SUM(me.qty_litres * COALESCE(f.flat_rate, 50)), 0) as est
            FROM farmers f
            LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
            WHERE f.status = 'active'
          `;
        } else if (level === "cpp") {
          estimateQuery = `
            SELECT COALESCE(SUM(me.qty_litres * COALESCE(c.flat_rate, 55)), 0) as est
            FROM cpp c
            LEFT JOIN milk_entries_rcc me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
            WHERE c.status = 'active'
          `;
        } else if (level === "rcc") {
          estimateQuery = `
            SELECT COALESCE(SUM(me.qty_litres * 60), 0) as est
            FROM rcc r
            LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
            WHERE r.status = 'active'
          `;
        } else if (level === "mp") {
          estimateQuery = `
            SELECT COALESCE(SUM(me.qty_litres * 70), 0) as est
            FROM main_plants mp
            LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
          `;
        }

        if (estimateQuery) {
          const [estRows] = await pool.query(estimateQuery, [start, end]);
          amount = Number(estRows?.[0]?.est || 0);
        }
      }

      return { label, year, month, period, volume, amount, status };
    }

    const lastCycles = getLastNCycles(5);
    const [farmersCycles, cppCycles, rccCycles, mpCycles] = await Promise.all([Promise.all(lastCycles.map((c) => buildCycleRow(c, "farmers"))), Promise.all(lastCycles.map((c) => buildCycleRow(c, "cpp"))), Promise.all(lastCycles.map((c) => buildCycleRow(c, "rcc"))), Promise.all(lastCycles.map((c) => buildCycleRow(c, "mp")))]);

    res.render("pages/ops/procurement/billing", {
      seo,
      pageKey: "ops/procurement/billing",
      promo: false,
      user: req.user,
      farmersCount: farmersCount && farmersCount.length > 0 ? farmersCount[0].count || 0 : 0,
      cppCount: cppCount && cppCount.length > 0 ? cppCount[0].count || 0 : 0,
      rccCount: rccCount && rccCount.length > 0 ? rccCount[0].count || 0 : 0,
      mpCount: mpCount && mpCount.length > 0 ? mpCount[0].count || 0 : 0,
      farmersVolume: farmersVol,
      farmersAmount: farmersAmt,
      farmersPendingCount: farmersPending && farmersPending.length > 0 ? farmersPending[0].count || 0 : 0,
      farmersPendingAmount: farmersPending && farmersPending.length > 0 ? farmersPending[0].amount || 0 : 0,
      cppVolume: cppVol,
      cppAmount: cppAmt,
      cppPendingCount: cppPending && cppPending.length > 0 ? cppPending[0].count || 0 : 0,
      cppPendingAmount: cppPending && cppPending.length > 0 ? cppPending[0].amount || 0 : 0,
      rccVolume: rccVol,
      rccAmount: rccAmt,
      rccPendingCount: rccPending && rccPending.length > 0 ? rccPending[0].count || 0 : 0,
      rccPendingAmount: rccPending && rccPending.length > 0 ? rccPending[0].amount || 0 : 0,
      mpVolume: mpVol,
      mpAmount: mpAmt,
      mpPendingCount: mpPending && mpPending.length > 0 ? mpPending[0].count || 0 : 0,
      mpPendingAmount: mpPending && mpPending.length > 0 ? mpPending[0].amount || 0 : 0,
      totalVolume,
      totalAmount,
      rateChartsCount: rateChartsCount && rateChartsCount.length > 0 ? rateChartsCount[0].count || 0 : 0,
      farmersCycles,
      cppCycles,
      rccCycles,
      mpCycles,
    });
  } catch (error) {
    console.error("Billing overview error:", error);
    res.render("pages/ops/procurement/billing", {
      seo,
      pageKey: "ops/procurement/billing",
      promo: false,
      user: req.user,
      farmersCount: 0,
      cppCount: 0,
      rccCount: 0,
      mpCount: 0,
      farmersVolume: 0,
      farmersAmount: 0,
      farmersPendingCount: 0,
      farmersPendingAmount: 0,
      cppVolume: 0,
      cppAmount: 0,
      cppPendingCount: 0,
      cppPendingAmount: 0,
      rccVolume: 0,
      rccAmount: 0,
      rccPendingCount: 0,
      rccPendingAmount: 0,
      mpVolume: 0,
      mpAmount: 0,
      mpPendingCount: 0,
      mpPendingAmount: 0,
      totalVolume: 0,
      totalAmount: 0,
      rateChartsCount: 0,
    });
  }
});

// Individual level billing pages
billing.get("/procurement/billing/:level", async (req, res) => {
  const { level } = req.params;
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear(), period = "H1", milkType = "all" } = req.query;
  const seo = buildSEO({ title: `${level.charAt(0).toUpperCase() + level.slice(1)} Billing — Procurement`, url: req.path });

  try {
    const { start, end } = getPeriodDates(parseInt(year), parseInt(month), period);

    // Get data for the specific level
    const levelData = await getBillingData(level, start, end, period, milkType);

    // Calculate totals and amounts for the level
    const processLevelData = async (data, levelName) => {
      const processedData = [];
      let totalQty = 0;
      let totalAmount = 0;
      let totalMilkCost = 0;
      let totalSalary = 0;

      for (const item of data) {
        if (item.total_qty > 0) {
          // Get farmer and CPP data for rate calculation
          let farmerData = null;
          let cppData = null;

          if (levelName === "farmers") {
            farmerData = item;
            // Get CPP data for this farmer
            const [cppRows] = await pool.query("SELECT * FROM cpp WHERE id = (SELECT cpp_id FROM farmers WHERE id = ?)", [item.id]);
            cppData = cppRows[0] || null;
          } else if (levelName === "cpp") {
            cppData = item;
          }

          // Calculate rate and amount
          let rate = 0;
          let amount = 0;
          let milkCost = 0;
          let salary = 0;

          if (levelName === "cpp") {
            // For CPP, always use the actual billing data
            amount = Number(item.total_amount) || 0;
            milkCost = Number(item.milk_cost) || 0;
            salary = Number(item.salary_amount) || 0;

            // Display the actual flat_rate from CPP table, not calculated rate
            if (cppData && cppData.rate_type === "flat" && cppData.flat_rate) {
              rate = Number(cppData.flat_rate);
            } else if (cppData && cppData.rate_type === "chart" && cppData.rate_chart_id) {
              // For rate charts, calculate based on average fat
              const [[slab]] = await pool.query("SELECT rate_per_litre FROM rate_chart_slabs WHERE chart_id=? AND ? BETWEEN fat_min AND fat_max ORDER BY fat_min LIMIT 1", [cppData.rate_chart_id, item.avg_fat || 0]);
              if (slab) {
                rate = Number(slab.rate_per_litre);
              } else {
                rate = 0;
              }
            } else {
              // Fallback: calculate rate from milk cost only (not total amount)
              rate = item.total_qty > 0 ? milkCost / item.total_qty : 0;
            }

            // If no billing data, calculate using rates
            if (!amount && item.total_qty > 0) {
              rate = await computeRateForEntry(item, farmerData, cppData);
              amount = Number(item.total_qty) * Number(rate);
              milkCost = amount; // For CPP without billing data, all amount is milk cost
              salary = 0;
            }
          } else if (levelName === "rcc" || levelName === "mp") {
            // For RCC and MP, use the flat_rate from the item itself
            rate = Number(item.flat_rate) || 0;
            amount = Number(item.total_qty) * Number(rate);
            milkCost = amount; // For RCC/MP, all amount is milk cost
          } else {
            // For farmers, use the rate calculation function
            rate = await computeRateForEntry(item, farmerData, cppData);
            amount = Number(item.total_qty) * Number(rate);
            milkCost = amount; // For farmers, all amount is milk cost
          }

          processedData.push({
            ...item,
            rate: rate,
            amount: amount,
            milkCost: milkCost,
            salary: salary,
          });

          totalQty += Number(item.total_qty);
          totalAmount += amount;
          totalMilkCost += milkCost;
          totalSalary += salary;
        }
      }

      const summary = {
        totalQty: totalQty,
        totalAmount: totalAmount,
        totalMilkCost: totalMilkCost,
        totalSalary: totalSalary,
        count: processedData.length,
      };

      return {
        data: processedData,
        summary: summary,
      };
    };

    const processedData = await processLevelData(levelData, level);

    // Render the appropriate template based on level
    const templateMap = {
      farmers: "pages/ops/procurement/billing-farmers",
      cpp: "pages/ops/procurement/billing-cpp",
      rcc: "pages/ops/procurement/billing-rcc",
      mp: "pages/ops/procurement/billing-mp",
    };

    const template = templateMap[level] || "pages/ops/procurement/billing-farmers";

    res.render(template, {
      seo,
      pageKey: `ops/procurement/billing/${level}`,
      promo: false,
      user: req.user,
      level,
      month,
      year,
      period,
      milkType,
      startDate: start,
      endDate: end,
      farmersData: level === "farmers" ? processedData : { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      cppData: level === "cpp" ? processedData : { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      rccData: level === "rcc" ? processedData : { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      mpData: level === "mp" ? processedData : { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
    });
  } catch (error) {
    console.error(`Billing ${level} error:`, error);
    const today = new Date();
    const { start, end } = getPeriodDates(today.getFullYear(), today.getMonth() + 1, "H1");

    res.render("pages/ops/procurement/billing-farmers", {
      seo,
      pageKey: `ops/procurement/billing/${level}`,
      promo: false,
      user: req.user,
      level,
      month: today.getMonth() + 1,
      year: today.getFullYear(),
      period: "H1",
      startDate: start,
      endDate: end,
      error: "Unable to load billing data",
      farmersData: { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      cppData: { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      rccData: { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
      mpData: { data: [], summary: { totalQty: 0, totalAmount: 0, count: 0 } },
    });
  }
});

export default billing;
