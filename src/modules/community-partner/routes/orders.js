import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { findCPForCustomer } from "./mappings.js";
import { getEffectiveMargin } from "./margins.js";

const router = express.Router();

// Sync order from main app (public endpoint, should be secured with API key in production)
router.post(
  "/sync",
  [
    body("order_id").isInt(),
    body("user_id").isInt(),
    body("locality_id").optional().isInt(),
    body("total_amount").isFloat({ min: 0 }),
    body("order_date").isISO8601(),
    body("products").isArray().notEmpty(),
    body("products.*.product_id").isInt(),
    body("products.*.product_category").notEmpty(),
    body("products.*.quantity").isInt({ min: 1 }),
    body("products.*.unit_price").isFloat({ min: 0 }),
    body("products.*.total_price").isFloat({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { order_id, user_id, locality_id, total_amount, order_date, products } = req.body;

      // Check if order already synced
      const [existing] = await pool.execute("SELECT id FROM cp_commission_ledger WHERE order_id = ?", [order_id]);

      if (existing.length) {
        return res.status(409).json({ error: "Order already synced" });
      }

      // Find CP for this customer
      const cpId = await findCPForCustomer(user_id, locality_id);

      if (!cpId) {
        return res.json({ message: "No CP found for this customer", synced: false });
      }

      // Calculate commission for each product
      let eligibleAmount = 0;
      let totalCommission = 0;
      const productCommissions = [];

      for (const product of products) {
        const margin = await getEffectiveMargin(cpId, product.product_id, product.product_category);

        if (margin > 0) {
          const productEligibleAmount = product.total_price;
          const productCommission = (productEligibleAmount * margin) / 100;

          eligibleAmount += productEligibleAmount;
          totalCommission += productCommission;

          productCommissions.push({
            product_id: product.product_id,
            margin,
            amount: productEligibleAmount,
            commission: productCommission,
          });
        }
      }

      if (eligibleAmount === 0) {
        return res.json({ message: "No eligible products for commission", synced: false });
      }

      // Apply tier-based multiplier to commission
      try {
        const { getCurrentTier, applyTierMultiplier } = await import("../services/tierService.js");
        const tierInfo = await getCurrentTier(cpId);
        totalCommission = await applyTierMultiplier(totalCommission, tierInfo.tier);
      } catch (tierError) {
        console.error("Error applying tier multiplier:", tierError);
        // Continue with base commission if tier calculation fails
      }

      // Calculate effective commission rate
      const effectiveRate = (totalCommission / eligibleAmount) * 100;

      // Insert into commission ledger
      const [result] = await pool.execute(
        `INSERT INTO cp_commission_ledger 
         (cp_id, order_id, user_id, order_date, gross_order_amount, eligible_amount, 
          commission_rate, commission_amount, status, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Order')`,
        [cpId, order_id, user_id, order_date, total_amount, eligibleAmount, effectiveRate, totalCommission]
      );

      res.json({
        message: "Order synced successfully",
        synced: true,
        commission_id: result.insertId,
        cp_id: cpId,
        eligible_amount: eligibleAmount,
        commission_amount: totalCommission,
        product_commissions: productCommissions,
      });
    } catch (error) {
      console.error("Sync order error:", error);
      res.status(500).json({ error: "Failed to sync order" });
    }
  }
);

// Get orders for a CP (must come before /:id to avoid route conflicts)
router.get("/cp/:cpId", authenticate, async (req, res) => {
  try {
    const { cpId } = req.params;
    const { status, startDate, endDate } = req.query;

    // CPs can only view their own orders
    if (req.user.role === "cp" && req.user.cp_id !== parseInt(cpId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    let query = `
      SELECT 
        id,
        order_id,
        user_id,
        order_date,
        gross_order_amount,
        eligible_amount,
        commission_rate,
        commission_amount,
        status,
        source,
        created_at
      FROM cp_commission_ledger
      WHERE cp_id = ?
    `;
    const params = [cpId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (startDate) {
      query += " AND order_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND order_date <= ?";
      params.push(endDate);
    }

    query += " ORDER BY order_date DESC LIMIT 100";

    const [orders] = await pool.execute(query, params);
    res.json(orders);
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Get order details by ID (Admin only) - must come after /cp/:cpId to avoid route conflicts
router.get("/:id", authenticate, async (req, res) => {
  // Check if user is admin
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    // Import analyticsPool dynamically
    const { analyticsPool } = await import("../../../db/pool.js");

    if (!analyticsPool) {
      return res.status(500).json({ error: "Analytics database not available" });
    }

    // Fetch order details
    const [orderRows] = await analyticsPool.execute(
      `SELECT 
        o.id,
        o.order_date,
        o.tax,
        o.delivery_fee,
        u.name as customer_name,
        u.phone as customer_phone,
        COALESCE(l.name, '') as locality_name,
        COALESCE(da.complete_address, da.address, '') as address,
        (
          SELECT SUM(fo.price * fo.quantity)
          FROM food_orders fo
          WHERE fo.order_id = o.id
        ) as order_value
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN delivery_addresses da ON da.id = o.delivery_address_id
       LEFT JOIN localities l ON l.id = da.locality_id
       WHERE o.id = ? AND o.active = 1
       LIMIT 1`,
      [orderId],
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderRows[0];

    // Fetch order items
    const [itemRows] = await analyticsPool.execute(
      `SELECT 
        fo.id,
        fo.food_id,
        fo.quantity,
        fo.price,
        f.name as product_name,
        f.unit
       FROM food_orders fo
       LEFT JOIN foods f ON f.id = fo.food_id
       WHERE fo.order_id = ?
       ORDER BY fo.id ASC`,
      [orderId],
    );

    order.items = itemRows.map(item => ({
      product_name: item.product_name ? `${item.product_name}${item.unit ? ` (${item.unit})` : ''}` : 'N/A',
      quantity: parseFloat(item.quantity || 0),
      price: parseFloat(item.price || 0),
    }));

    res.json(order);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

export default router;


