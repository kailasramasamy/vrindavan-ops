import express from "express";
import pool from "../../db/pool.js";

const router = express.Router();

// Generate bills for farmers
async function generateFarmerBills(startDate, endDate, periodType, milkType = "all") {
  try {
    // Get the correct status IDs
    const [pendingBillingStatus] = await pool.query("SELECT id FROM billing_status WHERE status = 'pending' LIMIT 1");
    const [pendingPaymentStatus] = await pool.query("SELECT id FROM payment_status WHERE status = 'pending' LIMIT 1");

    const billingStatusId = pendingBillingStatus[0]?.id || 1;
    const paymentStatusId = pendingPaymentStatus[0]?.id || 1;

    // Get all farmers with their milk data for the period
    const query = `
      SELECT
        f.id, f.name, f.village, f.milk_type,
        f.rate_type, f.flat_rate, f.rate_chart_id,
        c.name as cpp_name,
        SUM(me.qty_litres) as total_quantity,
        AVG(me.fat) as avg_fat,
        AVG(me.snf) as avg_snf,
        AVG(me.clr) as avg_clr,
        AVG(me.water_pct) as avg_water
      FROM farmers f
      LEFT JOIN cpp c ON c.id = f.cpp_id
      LEFT JOIN milk_entries_cpp me ON me.farmer_id = f.id AND me.date BETWEEN ? AND ?
      WHERE f.status = 'active'
        AND (LOWER(COALESCE(f.milk_type, '')) = LOWER(?) OR LOWER(?) = 'all')
      GROUP BY f.id, f.name, f.village, f.milk_type, f.rate_type, f.flat_rate, f.rate_chart_id, c.name
      HAVING total_quantity > 0
      ORDER BY f.name
    `;

    const [farmers] = await pool.query(query, [startDate, endDate, milkType, milkType]);

    const bills = [];
    const billingDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 15 days from now

    for (const farmer of farmers) {
      // Calculate rate based on farmer's rate type
      let rate = 0;
      if (farmer.rate_type === "flat" && farmer.flat_rate) {
        rate = Number(farmer.flat_rate);
      } else if (farmer.rate_type === "chart" && farmer.rate_chart_id) {
        // Get rate from chart based on fat content
        const [rateSlab] = await pool.query("SELECT rate_per_litre FROM rate_chart_slabs WHERE chart_id = ? AND ? BETWEEN fat_min AND fat_max ORDER BY fat_min LIMIT 1", [farmer.rate_chart_id, farmer.avg_fat || 0]);
        if (rateSlab.length > 0) {
          // Auto-activate rate chart when first used
          await pool.query("UPDATE rate_charts SET status = 'active' WHERE id = ? AND status = 'inactive'", [farmer.rate_chart_id]);
          rate = Number(rateSlab[0].rate_per_litre);
        }
      }

      const totalAmount = Number(farmer.total_quantity) * rate;

      // Check if billing record already exists
      const [existing] = await pool.query("SELECT id FROM farmer_billing WHERE farmer_id = ? AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [farmer.id, startDate, endDate, periodType]);

      if (existing.length === 0) {
        // Create new billing record
        const [result] = await pool.query(
          `INSERT INTO farmer_billing 
           (farmer_id, billing_period_start, billing_period_end, period_type, total_quantity, total_amount, 
            billing_status_id, payment_status_id, billing_date, due_date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [farmer.id, startDate, endDate, periodType, farmer.total_quantity, totalAmount, billingStatusId, paymentStatusId, billingDate, dueDate],
        );

        bills.push({
          id: result.insertId,
          farmer_id: farmer.id,
          farmer_name: farmer.name,
          village: farmer.village,
          cpp_name: farmer.cpp_name,
          total_quantity: farmer.total_quantity,
          rate: rate,
          total_amount: totalAmount,
          billing_date: billingDate,
          due_date: dueDate,
        });
      }
    }

    return { success: true, bills: bills, count: bills.length };
  } catch (error) {
    console.error("Error generating farmer bills:", error);
    throw error;
  }
}

// Generate bills for CPP
async function generateCppBills(startDate, endDate, periodType, milkType = "all") {
  try {
    // Get the correct status IDs
    const [pendingBillingStatus] = await pool.query("SELECT id FROM billing_status WHERE status = 'pending' LIMIT 1");
    const [pendingPaymentStatus] = await pool.query("SELECT id FROM payment_status WHERE status = 'pending' LIMIT 1");

    const billingStatusId = pendingBillingStatus[0]?.id || 1;
    const paymentStatusId = pendingPaymentStatus[0]?.id || 1;

    // Get all CPPs with their aggregated milk data and salary information
    const query = `
      SELECT
        c.id, c.name, c.village, c.milk_type,
        c.rate_type, c.flat_rate, c.rate_chart_id,
        c.salary_type, c.salary_amount,
        r.name as rcc_name,
        SUM(me.qty_litres) as total_quantity,
        AVG(me.fat) as avg_fat,
        AVG(me.snf) as avg_snf,
        AVG(me.clr) as avg_clr,
        AVG(me.water_pct) as avg_water
      FROM cpp c
      LEFT JOIN rcc r ON r.id = c.rcc_id
      LEFT JOIN milk_entries_cpp me ON me.cpp_id = c.id AND me.date BETWEEN ? AND ?
      WHERE c.status = 'active'
        AND (LOWER(COALESCE(c.milk_type, '')) = LOWER(?) OR LOWER(?) = 'all')
      GROUP BY c.id, c.name, c.village, c.milk_type, c.rate_type, c.flat_rate, c.rate_chart_id, c.salary_type, c.salary_amount, r.name
      HAVING total_quantity > 0
      ORDER BY c.name
    `;

    const [cpps] = await pool.query(query, [startDate, endDate, milkType, milkType]);

    const bills = [];
    const billingDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const cpp of cpps) {
      // Calculate milk cost based on CPP's rate type
      let milkRate = 0;
      if (cpp.rate_type === "flat" && cpp.flat_rate) {
        milkRate = Number(cpp.flat_rate);
      } else if (cpp.rate_type === "chart" && cpp.rate_chart_id) {
        const [rateSlab] = await pool.query("SELECT rate_per_litre FROM rate_chart_slabs WHERE chart_id = ? AND ? BETWEEN fat_min AND fat_max ORDER BY fat_min LIMIT 1", [cpp.rate_chart_id, cpp.avg_fat || 0]);
        if (rateSlab.length > 0) {
          // Auto-activate rate chart when first used
          await pool.query("UPDATE rate_charts SET status = 'active' WHERE id = ? AND status = 'inactive'", [cpp.rate_chart_id]);
          milkRate = Number(rateSlab[0].rate_per_litre);
        }
      }

      const milkCost = Number(cpp.total_quantity) * milkRate;

      // Calculate salary component
      let salaryAmount = 0;
      if (cpp.salary_type === "fixed") {
        // Fixed salary - use the amount directly
        salaryAmount = Number(cpp.salary_amount || 0);
      } else if (cpp.salary_type === "commission") {
        // Commission-based salary - multiply total volume by commission rate per liter
        salaryAmount = Number(cpp.total_quantity) * Number(cpp.salary_amount || 0);
      }

      // Total amount = milk cost + salary
      const totalAmount = milkCost + salaryAmount;

      // Check if billing record already exists
      const [existing] = await pool.query("SELECT id FROM cpp_billing WHERE cpp_id = ? AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [cpp.id, startDate, endDate, periodType]);

      if (existing.length === 0) {
        const [result] = await pool.query(
          `INSERT INTO cpp_billing 
           (cpp_id, billing_period_start, billing_period_end, period_type, total_quantity, total_amount, 
            milk_cost, salary_amount, salary_type, billing_status_id, payment_status_id, billing_date, due_date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cpp.id, startDate, endDate, periodType, cpp.total_quantity, totalAmount, milkCost, salaryAmount, cpp.salary_type, billingStatusId, paymentStatusId, billingDate, dueDate],
        );

        bills.push({
          id: result.insertId,
          cpp_id: cpp.id,
          cpp_name: cpp.name,
          village: cpp.village,
          rcc_name: cpp.rcc_name,
          total_quantity: cpp.total_quantity,
          milk_rate: milkRate,
          milk_cost: milkCost,
          salary_type: cpp.salary_type,
          salary_amount: salaryAmount,
          total_amount: totalAmount,
          billing_date: billingDate,
          due_date: dueDate,
        });
      }
    }

    return { success: true, bills: bills, count: bills.length };
  } catch (error) {
    console.error("Error generating CPP bills:", error);
    throw error;
  }
}

// Generate bills for RCC
async function generateRccBills(startDate, endDate, periodType) {
  try {
    // Get the correct status IDs
    const [pendingBillingStatus] = await pool.query("SELECT id FROM billing_status WHERE status = 'pending' LIMIT 1");
    const [pendingPaymentStatus] = await pool.query("SELECT id FROM payment_status WHERE status = 'pending' LIMIT 1");

    const billingStatusId = pendingBillingStatus[0]?.id || 1;
    const paymentStatusId = pendingPaymentStatus[0]?.id || 1;

    // Get all RCCs with their aggregated milk data
    const query = `
      SELECT 
        r.id, r.name, r.location as village,
        SUM(me.qty_litres) as total_quantity,
        AVG(me.fat) as avg_fat,
        AVG(me.snf) as avg_snf,
        AVG(me.clr) as avg_clr,
        AVG(me.water_pct) as avg_water
      FROM rcc r
      LEFT JOIN milk_entries_mp me ON me.rcc_id = r.id AND me.date BETWEEN ? AND ?
      WHERE r.status = 'active'
      GROUP BY r.id, r.name, r.location
      HAVING total_quantity > 0
      ORDER BY r.name
    `;

    const [rccs] = await pool.query(query, [startDate, endDate]);

    const bills = [];
    const billingDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const flatRate = 60.0; // RCC flat rate

    for (const rcc of rccs) {
      const totalAmount = Number(rcc.total_quantity) * flatRate;

      // Check if billing record already exists
      const [existing] = await pool.query("SELECT id FROM rcc_billing WHERE rcc_id = ? AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [rcc.id, startDate, endDate, periodType]);

      if (existing.length === 0) {
        const [result] = await pool.query(
          `INSERT INTO rcc_billing 
           (rcc_id, billing_period_start, billing_period_end, period_type, total_quantity, total_amount, 
            billing_status_id, payment_status_id, billing_date, due_date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [rcc.id, startDate, endDate, periodType, rcc.total_quantity, totalAmount, billingStatusId, paymentStatusId, billingDate, dueDate],
        );

        bills.push({
          id: result.insertId,
          rcc_id: rcc.id,
          rcc_name: rcc.name,
          village: rcc.village,
          total_quantity: rcc.total_quantity,
          rate: flatRate,
          total_amount: totalAmount,
          billing_date: billingDate,
          due_date: dueDate,
        });
      }
    }

    return { success: true, bills: bills, count: bills.length };
  } catch (error) {
    console.error("Error generating RCC bills:", error);
    throw error;
  }
}

// Generate bills for MP
async function generateMpBills(startDate, endDate, periodType) {
  try {
    // Get the correct status IDs
    const [pendingBillingStatus] = await pool.query("SELECT id FROM billing_status WHERE status = 'pending' LIMIT 1");
    const [pendingPaymentStatus] = await pool.query("SELECT id FROM payment_status WHERE status = 'pending' LIMIT 1");

    const billingStatusId = pendingBillingStatus[0]?.id || 1;
    const paymentStatusId = pendingPaymentStatus[0]?.id || 1;

    // Get all MPs with their aggregated milk data
    const query = `
      SELECT 
        mp.id, mp.name, mp.location as village,
        SUM(me.qty_litres) as total_quantity,
        AVG(me.fat) as avg_fat,
        AVG(me.snf) as avg_snf,
        AVG(me.clr) as avg_clr,
        AVG(me.water_pct) as avg_water
      FROM main_plants mp
      LEFT JOIN milk_entries_mp me ON me.mp_id = mp.id AND me.date BETWEEN ? AND ?
      GROUP BY mp.id, mp.name, mp.location
      HAVING total_quantity > 0
      ORDER BY mp.name
    `;

    const [mps] = await pool.query(query, [startDate, endDate]);

    const bills = [];
    const billingDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const flatRate = 70.0; // MP flat rate

    for (const mp of mps) {
      const totalAmount = Number(mp.total_quantity) * flatRate;

      // Check if billing record already exists
      const [existing] = await pool.query("SELECT id FROM mp_billing WHERE mp_id = ? AND billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [mp.id, startDate, endDate, periodType]);

      if (existing.length === 0) {
        const [result] = await pool.query(
          `INSERT INTO mp_billing 
           (mp_id, billing_period_start, billing_period_end, period_type, total_quantity, total_amount, 
            billing_status_id, payment_status_id, billing_date, due_date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [mp.id, startDate, endDate, periodType, mp.total_quantity, totalAmount, billingStatusId, paymentStatusId, billingDate, dueDate],
        );

        bills.push({
          id: result.insertId,
          mp_id: mp.id,
          mp_name: mp.name,
          village: mp.village,
          total_quantity: mp.total_quantity,
          rate: flatRate,
          total_amount: totalAmount,
          billing_date: billingDate,
          due_date: dueDate,
        });
      }
    }

    return { success: true, bills: bills, count: bills.length };
  } catch (error) {
    console.error("Error generating MP bills:", error);
    throw error;
  }
}

// Check if bills exist for a period
async function checkBillsExist(startDate, endDate, periodType) {
  try {
    const [farmerBills] = await pool.query("SELECT COUNT(*) as count FROM farmer_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    const [cppBills] = await pool.query("SELECT COUNT(*) as count FROM cpp_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    const [rccBills] = await pool.query("SELECT COUNT(*) as count FROM rcc_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    const [mpBills] = await pool.query("SELECT COUNT(*) as count FROM mp_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    return {
      farmers: farmerBills[0].count > 0,
      cpp: cppBills[0].count > 0,
      rcc: rccBills[0].count > 0,
      mp: mpBills[0].count > 0,
      counts: {
        farmers: farmerBills[0].count,
        cpp: cppBills[0].count,
        rcc: rccBills[0].count,
        mp: mpBills[0].count,
      },
    };
  } catch (error) {
    console.error("Error checking bills existence:", error);
    throw error;
  }
}

// Regenerate bills (delete existing and create new ones)
async function regenerateFarmerBills(startDate, endDate, periodType, milkType = "all") {
  try {
    // Delete existing bills — scoped to milk type if specified so other milk types' bills remain untouched
    if (milkType && milkType.toLowerCase() !== "all") {
      await pool.query(
        `DELETE fb FROM farmer_billing fb
         INNER JOIN farmers f ON f.id = fb.farmer_id
         WHERE fb.billing_period_start = ? AND fb.billing_period_end = ? AND fb.period_type = ?
           AND LOWER(COALESCE(f.milk_type, '')) = LOWER(?)`,
        [startDate, endDate, periodType, milkType],
      );
    } else {
      await pool.query("DELETE FROM farmer_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);
    }

    // Generate new bills
    return await generateFarmerBills(startDate, endDate, periodType, milkType);
  } catch (error) {
    console.error("Error regenerating farmer bills:", error);
    throw error;
  }
}

async function regenerateCppBills(startDate, endDate, periodType, milkType = "all") {
  try {
    if (milkType && milkType.toLowerCase() !== "all") {
      await pool.query(
        `DELETE cb FROM cpp_billing cb
         INNER JOIN cpp c ON c.id = cb.cpp_id
         WHERE cb.billing_period_start = ? AND cb.billing_period_end = ? AND cb.period_type = ?
           AND LOWER(COALESCE(c.milk_type, '')) = LOWER(?)`,
        [startDate, endDate, periodType, milkType],
      );
    } else {
      await pool.query("DELETE FROM cpp_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);
    }

    return await generateCppBills(startDate, endDate, periodType, milkType);
  } catch (error) {
    console.error("Error regenerating CPP bills:", error);
    throw error;
  }
}

async function regenerateRccBills(startDate, endDate, periodType) {
  try {
    await pool.query("DELETE FROM rcc_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    return await generateRccBills(startDate, endDate, periodType);
  } catch (error) {
    console.error("Error regenerating RCC bills:", error);
    throw error;
  }
}

async function regenerateMpBills(startDate, endDate, periodType) {
  try {
    await pool.query("DELETE FROM mp_billing WHERE billing_period_start = ? AND billing_period_end = ? AND period_type = ?", [startDate, endDate, periodType]);

    return await generateMpBills(startDate, endDate, periodType);
  } catch (error) {
    console.error("Error regenerating MP bills:", error);
    throw error;
  }
}

// API Routes

// Check if bills exist for the selected period
router.get("/check-bills", async (req, res) => {
  try {
    const { startDate, endDate, periodType } = req.query;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    const billStatus = await checkBillsExist(startDate, endDate, periodType);

    res.json({
      success: true,
      data: billStatus,
    });
  } catch (error) {
    console.error("Error checking bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check bills status",
    });
  }
});

// Regenerate all bills (must come before /regenerate/:entityType to avoid route conflict)
router.post("/regenerate/all", async (req, res) => {
  try {
    const { startDate, endDate, periodType, milkType = "all" } = req.body;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    // RCC and MP aggregate across all milk types, so they're only touched when milk type is 'all'
    const isAllMilkTypes = !milkType || milkType.toLowerCase() === "all";
    const emptyResult = { success: true, bills: [], count: 0, skipped: true };

    const [farmersResult, cppResult, rccResult, mpResult] = await Promise.all([
      regenerateFarmerBills(startDate, endDate, periodType, milkType),
      regenerateCppBills(startDate, endDate, periodType, milkType),
      isAllMilkTypes ? regenerateRccBills(startDate, endDate, periodType) : Promise.resolve(emptyResult),
      isAllMilkTypes ? regenerateMpBills(startDate, endDate, periodType) : Promise.resolve(emptyResult),
    ]);

    res.json({
      success: true,
      results: {
        farmers: farmersResult,
        cpp: cppResult,
        rcc: rccResult,
        mp: mpResult,
      },
      totalBills: farmersResult.count + cppResult.count + rccResult.count + mpResult.count,
    });
  } catch (error) {
    console.error("Error regenerating all bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate bills",
    });
  }
});

// Regenerate bills for specific entity type
router.post("/regenerate/:entityType", async (req, res) => {
  try {
    const { entityType } = req.params;
    const { startDate, endDate, periodType, milkType = "all" } = req.body;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    let result;
    switch (entityType) {
      case "farmers":
        result = await regenerateFarmerBills(startDate, endDate, periodType, milkType);
        break;
      case "cpp":
        result = await regenerateCppBills(startDate, endDate, periodType, milkType);
        break;
      case "rcc":
        result = await regenerateRccBills(startDate, endDate, periodType);
        break;
      case "mp":
        result = await regenerateMpBills(startDate, endDate, periodType);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid entity type. Must be farmers, cpp, rcc, or mp",
        });
    }

    res.json(result);
  } catch (error) {
    console.error("Error regenerating bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate bills",
    });
  }
});

// Generate bills for all entity types
router.post("/generate/all", async (req, res) => {
  try {
    const { startDate, endDate, periodType, milkType = "all" } = req.body;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    // RCC and MP aggregate across all milk types, so they're only touched when milk type is 'all'
    const isAllMilkTypes = !milkType || milkType.toLowerCase() === "all";
    const emptyResult = { success: true, bills: [], count: 0, skipped: true };

    const [farmersResult, cppResult, rccResult, mpResult] = await Promise.all([
      generateFarmerBills(startDate, endDate, periodType, milkType),
      generateCppBills(startDate, endDate, periodType, milkType),
      isAllMilkTypes ? generateRccBills(startDate, endDate, periodType) : Promise.resolve(emptyResult),
      isAllMilkTypes ? generateMpBills(startDate, endDate, periodType) : Promise.resolve(emptyResult),
    ]);

    res.json({
      success: true,
      results: {
        farmers: farmersResult,
        cpp: cppResult,
        rcc: rccResult,
        mp: mpResult,
      },
      totalBills: farmersResult.count + cppResult.count + rccResult.count + mpResult.count,
    });
  } catch (error) {
    console.error("Error generating all bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate bills",
    });
  }
});

// Generate bills for specific entity type
router.post("/generate/:entityType", async (req, res) => {
  try {
    const { entityType } = req.params;
    const { startDate, endDate, periodType, milkType = "all" } = req.body;

    if (!startDate || !endDate || !periodType) {
      return res.status(400).json({
        success: false,
        error: "startDate, endDate, and periodType are required",
      });
    }

    let result;
    switch (entityType) {
      case "farmers":
        result = await generateFarmerBills(startDate, endDate, periodType, milkType);
        break;
      case "cpp":
        result = await generateCppBills(startDate, endDate, periodType, milkType);
        break;
      case "rcc":
        result = await generateRccBills(startDate, endDate, periodType);
        break;
      case "mp":
        result = await generateMpBills(startDate, endDate, periodType);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid entity type. Must be farmers, cpp, rcc, or mp",
        });
    }

    res.json(result);
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate bills",
    });
  }
});

export default router;
