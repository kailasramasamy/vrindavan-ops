import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { analyticsPool } from "../../../db/pool.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";
import { getEffectiveMargin } from "./margins.js";

const router = express.Router();

// Sync all payouts for all CPs (Admin only)
router.post("/sync-all", authenticate, requireAdmin, async (req, res) => {
  try {
    const { month, year } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    const payoutMonth = `${year}-${String(month).padStart(2, "0")}-01`;

    // Get all CPs
    const [cpRows] = await pool.execute("SELECT id, name FROM community_partners ORDER BY name");
    const cps = cpRows || [];

    const results = {
      total: cps.length,
      synced: 0,
      failed: 0,
      errors: [],
    };

    if (!analyticsPool) {
      return res.status(500).json({ error: "Analytics database not available" });
    }

    // Process each CP
    for (const cp of cps) {
      try {
        // Get customer user_ids mapped to this CP (only active/registered)
        const [customerMappings] = await pool.execute(
          `SELECT DISTINCT user_id 
           FROM cp_customer_mappings 
           WHERE cp_id = ? 
             AND is_active = TRUE 
             AND user_id IS NOT NULL
             AND status IN ('Active', 'Registered')`,
          [cp.id],
        );

        const customerUserIds = customerMappings.map((cm) => cm.user_id);

        if (customerUserIds.length === 0) {
          // No customers, create empty payout record
          await pool.execute(
            `INSERT INTO cp_monthly_payouts 
             (cp_id, payout_month, total_orders, total_sales, total_commission, payout_status)
             VALUES (?, ?, 0, 0, 0, 'Pending')
             ON DUPLICATE KEY UPDATE 
             total_orders = VALUES(total_orders),
             total_sales = VALUES(total_sales),
             total_commission = VALUES(total_commission)`,
            [cp.id, payoutMonth],
          );
          results.synced++;
          continue;
        }

        // Get orders for the month
        const [orderRows] = await analyticsPool.execute(
          `SELECT 
            o.id as order_id,
            o.user_id,
            o.order_date,
            (
              SELECT SUM(fo.price * fo.quantity)
              FROM food_orders fo
              WHERE fo.order_id = o.id
            ) as order_value
           FROM orders o
           WHERE o.user_id IN (${customerUserIds.map(() => "?").join(",")})
             AND o.active = 1
             AND MONTH(o.order_date) = ?
             AND YEAR(o.order_date) = ?
           ORDER BY o.order_date DESC`,
          [...customerUserIds, month, year],
        );

        if (orderRows.length === 0) {
          // No orders, create empty payout record
          await pool.execute(
            `INSERT INTO cp_monthly_payouts 
             (cp_id, payout_month, total_orders, total_sales, total_commission, payout_status)
             VALUES (?, ?, 0, 0, 0, 'Pending')
             ON DUPLICATE KEY UPDATE 
             total_orders = VALUES(total_orders),
             total_sales = VALUES(total_sales),
             total_commission = VALUES(total_commission)`,
            [cp.id, payoutMonth],
          );
          results.synced++;
          continue;
        }

        // Get order items
        const orderIds = orderRows.map((o) => o.order_id);
        const [orderItemsRows] = await analyticsPool.execute(
          `SELECT 
            fo.order_id,
            fo.food_id,
            fo.quantity,
            fo.price
           FROM food_orders fo
           WHERE fo.order_id IN (${orderIds.map(() => "?").join(",")})`,
          orderIds,
        );

        // Get product categories
        const foodIds = [...new Set(orderItemsRows.map((item) => item.food_id).filter((id) => id))];
        const productCategoryMap = new Map();

        if (foodIds.length > 0) {
          const [productRows] = await pool.execute(
            `SELECT 
              p.id as product_id,
              pc.name as category_name
             FROM products p
             LEFT JOIN product_categories pc ON pc.id = p.category_id
             WHERE p.id IN (${foodIds.map(() => "?").join(",")}) AND p.is_active = TRUE`,
            foodIds,
          );

          productRows.forEach((row) => {
            productCategoryMap.set(row.product_id, row.category_name);
          });
        }

        // Group order items by order_id
        const orderItemsMap = new Map();
        orderItemsRows.forEach((item) => {
          if (!orderItemsMap.has(item.order_id)) {
            orderItemsMap.set(item.order_id, []);
          }
          orderItemsMap.get(item.order_id).push({
            ...item,
            category_name: productCategoryMap.get(item.food_id) || null,
          });
        });

        // Calculate commission for each order
        let totalOrders = orderRows.length;
        let totalSales = 0;
        let totalCommission = 0;

        for (const order of orderRows) {
          const items = orderItemsMap.get(order.order_id) || [];
          let orderEligibleAmount = 0;
          let orderCommission = 0;

          for (const item of items) {
            const productId = item.food_id;
            const categoryName = item.category_name;
            const itemValue = parseFloat(item.price || 0) * parseFloat(item.quantity || 0);

            // Get effective margin for this product
            const marginPercentage = await getEffectiveMargin(cp.id, productId, categoryName);

            if (marginPercentage > 0) {
              orderEligibleAmount += itemValue;
              const itemCommission = (itemValue * marginPercentage) / 100;
              orderCommission += itemCommission;
            }
          }

          totalSales += orderEligibleAmount;
          totalCommission += orderCommission;
        }

        // Get mission bonuses for this month (sum of all completed mission bonuses)
        const [missionBonuses] = await pool.execute(
          `SELECT COALESCE(SUM(m.bonus_amount), 0) as total_bonus
           FROM cp_mission_progress mp
           JOIN cp_missions m ON mp.mission_id = m.id
           WHERE mp.cp_id = ?
           AND mp.bonus_awarded = TRUE
           AND mp.is_completed = TRUE
           AND DATE_FORMAT(mp.bonus_awarded_at, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`,
          [cp.id, payoutMonth]
        );
        const missionBonus = parseFloat(missionBonuses[0]?.total_bonus || 0);

        // Insert or update monthly payout
        await pool.execute(
          `INSERT INTO cp_monthly_payouts 
           (cp_id, payout_month, total_orders, total_sales, total_commission, mission_bonus, payout_status)
           VALUES (?, ?, ?, ?, ?, ?, 'Pending')
           ON DUPLICATE KEY UPDATE 
           total_orders = VALUES(total_orders),
           total_sales = VALUES(total_sales),
           total_commission = VALUES(total_commission),
           mission_bonus = VALUES(mission_bonus)`,
          [cp.id, payoutMonth, totalOrders, totalSales, totalCommission, missionBonus],
        );

        results.synced++;
      } catch (error) {
        console.error(`Error syncing payout for CP ${cp.id} (${cp.name}):`, error);
        results.failed++;
        results.errors.push({
          cp_id: cp.id,
          cp_name: cp.name,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Synced ${results.synced} payouts, ${results.failed} failed`,
      results,
    });
  } catch (error) {
    console.error("Sync all payouts error:", error);
    res.status(500).json({ error: "Failed to sync payouts" });
  }
});

// Calculate monthly payout for a CP
router.post("/calculate/:cpId/:month/:year", authenticate, requireAdmin, async (req, res) => {
  try {
    const { cpId, month, year } = req.params;
    const payoutMonth = `${year}-${month.padStart(2, "0")}-01`;

    // First, try to get from commission ledger (if any approved commissions exist)
    const [commissions] = await pool.execute(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(eligible_amount) as total_sales,
        SUM(commission_amount) as total_commission
       FROM cp_commission_ledger
       WHERE cp_id = ? 
       AND status = 'Approved'
       AND MONTH(order_date) = ? 
       AND YEAR(order_date) = ?`,
      [cpId, month, year]
    );

    let stats = commissions[0];
    let totalOrders = parseInt(stats?.total_orders || 0);
    let totalSales = parseFloat(stats?.total_sales || 0);
    let totalCommission = parseFloat(stats?.total_commission || 0);

    // If no approved commissions in ledger, calculate from actual orders dynamically
    if (totalOrders === 0 && analyticsPool) {
      // Get customer user_ids mapped to this CP (only active/registered)
      const [customerMappings] = await pool.execute(
        `SELECT DISTINCT user_id 
         FROM cp_customer_mappings 
         WHERE cp_id = ? 
           AND is_active = TRUE 
           AND user_id IS NOT NULL
           AND status IN ('Active', 'Registered')`,
        [cpId],
      );

      const customerUserIds = customerMappings.map((cm) => cm.user_id);

      if (customerUserIds.length > 0) {
        // Get orders for the month
        const [orderRows] = await analyticsPool.execute(
          `SELECT 
            o.id as order_id,
            o.user_id,
            o.order_date,
            (
              SELECT SUM(fo.price * fo.quantity)
              FROM food_orders fo
              WHERE fo.order_id = o.id
            ) as order_value
           FROM orders o
           WHERE o.user_id IN (${customerUserIds.map(() => "?").join(",")})
             AND o.active = 1
             AND MONTH(o.order_date) = ?
             AND YEAR(o.order_date) = ?
           ORDER BY o.order_date DESC`,
          [...customerUserIds, month, year],
        );

        // Get order items
        const orderIds = orderRows.map((o) => o.order_id);
        if (orderIds.length > 0) {
          const [orderItemsRows] = await analyticsPool.execute(
            `SELECT 
              fo.order_id,
              fo.food_id,
              fo.quantity,
              fo.price
             FROM food_orders fo
             WHERE fo.order_id IN (${orderIds.map(() => "?").join(",")})`,
            orderIds,
          );

          // Get product categories
          const foodIds = [...new Set(orderItemsRows.map(item => item.food_id).filter(id => id))];
          const productCategoryMap = new Map();
          
          if (foodIds.length > 0) {
            const [productRows] = await pool.execute(
              `SELECT 
                p.id as product_id,
                pc.name as category_name
               FROM products p
               LEFT JOIN product_categories pc ON pc.id = p.category_id
               WHERE p.id IN (${foodIds.map(() => "?").join(",")}) AND p.is_active = TRUE`,
              foodIds,
            );
            
            productRows.forEach((row) => {
              productCategoryMap.set(row.product_id, row.category_name);
            });
          }

          // Group order items by order_id
          const orderItemsMap = new Map();
          orderItemsRows.forEach((item) => {
            if (!orderItemsMap.has(item.order_id)) {
              orderItemsMap.set(item.order_id, []);
            }
            orderItemsMap.get(item.order_id).push({
              ...item,
              category_name: productCategoryMap.get(item.food_id) || null,
            });
          });

          // Calculate commission for each order
          totalOrders = orderRows.length;
          totalSales = 0;
          totalCommission = 0;

          for (const order of orderRows) {
            const items = orderItemsMap.get(order.order_id) || [];
            let orderEligibleAmount = 0;
            let orderCommission = 0;

            for (const item of items) {
              const productId = item.food_id;
              const categoryName = item.category_name;
              const itemValue = parseFloat(item.price || 0) * parseFloat(item.quantity || 0);

              // Get effective margin for this product
              const marginPercentage = await getEffectiveMargin(cpId, productId, categoryName);

              if (marginPercentage > 0) {
                orderEligibleAmount += itemValue;
                const itemCommission = (itemValue * marginPercentage) / 100;
                orderCommission += itemCommission;
              }
            }

            totalSales += orderEligibleAmount;
            totalCommission += orderCommission;
          }
        }
      }
    }

    // Get mission bonuses for this month (sum of all completed mission bonuses)
    const [missionBonuses] = await pool.execute(
      `SELECT COALESCE(SUM(m.bonus_amount), 0) as total_bonus
       FROM cp_mission_progress mp
       JOIN cp_missions m ON mp.mission_id = m.id
       WHERE mp.cp_id = ?
       AND mp.bonus_awarded = TRUE
       AND mp.is_completed = TRUE
       AND DATE_FORMAT(mp.bonus_awarded_at, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`,
      [cpId, payoutMonth]
    );
    const missionBonus = parseFloat(missionBonuses[0]?.total_bonus || 0);

    // Insert or update monthly payout
    await pool.execute(
      `INSERT INTO cp_monthly_payouts 
       (cp_id, payout_month, total_orders, total_sales, total_commission, mission_bonus, payout_status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')
       ON DUPLICATE KEY UPDATE 
       total_orders = VALUES(total_orders),
       total_sales = VALUES(total_sales),
       total_commission = VALUES(total_commission),
       mission_bonus = VALUES(mission_bonus)`,
      [cpId, payoutMonth, totalOrders, totalSales, totalCommission, missionBonus],
    );

    const [payout] = await pool.execute("SELECT * FROM cp_monthly_payouts WHERE cp_id = ? AND payout_month = ?", [
      cpId,
      payoutMonth,
    ]);

    res.json(payout[0]);
  } catch (error) {
    console.error("Calculate payout error:", error);
    res.status(500).json({ error: "Failed to calculate payout" });
  }
});

// Get monthly payouts for a CP
router.get("/cp/:cpId", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;
    const { year } = req.query;

    // CPs can only view their own payouts
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let query = `
      SELECT * FROM cp_monthly_payouts 
      WHERE cp_id = ?
    `;
    const params = [cpId];

    if (year) {
      query += " AND YEAR(payout_month) = ?";
      params.push(year);
    }

    query += " ORDER BY payout_month DESC";

    const [payouts] = await pool.execute(query, params);
    res.json(payouts);
  } catch (error) {
    console.error("Get payouts error:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

// Get all payouts (Admin only)
router.get("/", authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, month, year } = req.query;

    let query = `
      SELECT 
        p.*,
        cp.name as cp_name,
        cp.email as cp_email
      FROM cp_monthly_payouts p
      JOIN community_partners cp ON p.cp_id = cp.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND p.payout_status = ?";
      params.push(status);
    }

    if (month && year) {
      query += " AND MONTH(p.payout_month) = ? AND YEAR(p.payout_month) = ?";
      params.push(month, year);
    }

    query += " ORDER BY p.payout_month DESC, cp.name";

    const [payouts] = await pool.execute(query, params);
    res.json(payouts);
  } catch (error) {
    console.error("Get all payouts error:", error);
    res.status(500).json({ error: "Failed to fetch payouts" });
  }
});

// Update payout status (Admin only)
router.patch(
  "/:id/status",
  authenticate,
  requireAdmin,
  [
    body("payout_status").isIn(["Pending", "Paid", "On Hold"]),
    body("payout_reference").optional().notEmpty(),
    body("payout_date").optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { payout_status, payout_reference, payout_date, notes } = req.body;

      // Get existing payout
      const [existing] = await pool.execute("SELECT * FROM cp_monthly_payouts WHERE id = ?", [id]);

      if (!existing.length) {
        return res.status(404).json({ error: "Payout not found" });
      }

      const oldValues = existing[0];

      await pool.execute(
        `UPDATE cp_monthly_payouts 
         SET payout_status = ?, payout_reference = ?, payout_date = ?, notes = ?
         WHERE id = ?`,
        [payout_status, payout_reference || null, payout_date || null, notes || null, id]
      );

      await auditLog(req, "UPDATE_PAYOUT_STATUS", "payout", id, oldValues, req.body);

      const [updated] = await pool.execute("SELECT * FROM cp_monthly_payouts WHERE id = ?", [id]);

      res.json(updated[0]);
    } catch (error) {
      console.error("Update payout status error:", error);
      res.status(500).json({ error: "Failed to update payout status" });
    }
  }
);

export default router;


