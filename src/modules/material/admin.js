import express from "express";
import pool from "../../db/pool.js";
import { buildSEO } from "../../utils/seo.js";

const router = express.Router();

// Material Management Dashboard
router.get("/material/dashboard", async (req, res) => {
  const seo = buildSEO({ title: "Material Management Dashboard", url: req.path });

  try {
    // Get dashboard statistics
    let totalMaterials = 0;
    let lowStockCount = 0;
    let receiptsToday = 0;
    let issuesToday = 0;

    if (pool) {
      // Total materials count
      const [materialCountResult] = await pool.query("SELECT COUNT(*) as count FROM materials WHERE is_active = 1");
      totalMaterials = materialCountResult[0]?.count || 0;

      // Low stock count
      const [lowStockResult] = await pool.query(`
        SELECT COUNT(*) as count 
        FROM materials m
        LEFT JOIN (
          SELECT material_id, SUM(on_hand_qty) as total_stock
          FROM material_stock
          GROUP BY material_id
        ) ms ON m.id = ms.material_id
        WHERE m.is_active = 1 
          AND (
            (m.stock_policy = 'min_max' AND COALESCE(ms.total_stock, 0) <= m.min_stock) OR
            (m.stock_policy = 'rop' AND COALESCE(ms.total_stock, 0) <= m.reorder_point)
          )
      `);
      lowStockCount = lowStockResult[0]?.count || 0;

      // Receipts today
      const [receiptsResult] = await pool.query(`
        SELECT COUNT(*) as count 
        FROM material_transactions mt
        LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
        WHERE mtt.stock_impact = 'positive' 
          AND DATE(mt.transaction_date) = CURDATE()
      `);
      receiptsToday = receiptsResult[0]?.count || 0;

      // Issues today
      const [issuesResult] = await pool.query(`
        SELECT COUNT(*) as count 
        FROM material_transactions mt
        LEFT JOIN material_transaction_types mtt ON mt.transaction_type_id = mtt.id
        WHERE mtt.stock_impact = 'negative' 
          AND DATE(mt.transaction_date) = CURDATE()
      `);
      issuesToday = issuesResult[0]?.count || 0;
    }

    const stats = {
      totalMaterials,
      lowStockCount,
      receiptsToday,
      issuesToday,
    };

    res.render("pages/ops/admin/material/dashboard", {
      seo,
      pageKey: "ops/material/dashboard",
      promo: false,
      user: req.user,
      stats,
      section: "Ops",
      subsection: "Material",
    });
  } catch (error) {
    console.error("Error loading material dashboard:", error);
    res.render("pages/ops/admin/material/dashboard", {
      seo,
      pageKey: "ops/material/dashboard",
      promo: false,
      user: req.user,
      stats: {
        totalMaterials: 0,
        lowStockCount: 0,
        receiptsToday: 0,
        issuesToday: 0,
      },
      section: "Ops",
      subsection: "Material",
    });
  }
});

// Categories Management
router.get("/admin/material/categories", async (req, res) => {
  const seo = buildSEO({ title: "Material Categories", url: req.path });

  try {
    const [categories] = pool
      ? await pool.query(`
      SELECT mc.*, 
             COUNT(m.id) as material_count
      FROM material_categories mc
      LEFT JOIN materials m ON mc.id = m.category_id AND m.is_active = true
      WHERE mc.is_active = true
      GROUP BY mc.id
      ORDER BY mc.id ASC
    `)
      : [[]];

    res.render("pages/ops/admin/material/categories", {
      seo,
      pageKey: "ops/admin/material/categories",
      promo: false,
      user: req.user,
      categories,
      section: "Ops",
      subsection: "Material",
    });
  } catch (error) {
    console.error("Error loading categories:", error);
    res.render("pages/ops/admin/material/categories", {
      seo,
      pageKey: "ops/admin/material/categories",
      promo: false,
      user: req.user,
      categories: [],
      section: "Ops",
      subsection: "Material",
    });
  }
});

// Materials Management
router.get("/admin/material/materials", async (req, res) => {
  const seo = buildSEO({ title: "Materials", url: req.path });

  try {
    const [categories] = pool ? await pool.query("SELECT id, name FROM material_categories WHERE is_active = true ORDER BY name") : [[]];
    const [uoms] = pool ? await pool.query("SELECT id, name, symbol FROM material_uom WHERE is_active = true ORDER BY name") : [[]];
    const [locations] = pool ? await pool.query("SELECT id, name FROM material_locations WHERE is_active = true ORDER BY name") : [[]];

    res.render("pages/ops/admin/material/materials", {
      seo,
      pageKey: "ops/admin/material/materials",
      promo: false,
      user: req.user,
      categories,
      uoms,
      locations,
      section: "Ops",
      subsection: "Material",
    });
  } catch (error) {
    console.error("Error loading materials page:", error);
    res.render("pages/ops/admin/material/materials", {
      seo,
      pageKey: "ops/admin/material/materials",
      promo: false,
      user: req.user,
      categories: [],
      uoms: [],
      locations: [],
      section: "Ops",
      subsection: "Material",
    });
  }
});

// Locations Management
router.get("/admin/material/locations", async (req, res) => {
  const seo = buildSEO({ title: "Material Locations", url: req.path });

  try {
    const [locations] = pool
      ? await pool.query(`
      SELECT 
        ml.*,
        COUNT(ms.id) as stock_items_count,
        SUM(ms.on_hand_qty) as total_quantity
      FROM material_locations ml
      LEFT JOIN material_stock ms ON ml.id = ms.location_id
      WHERE ml.is_active = true
      GROUP BY ml.id
      ORDER BY ml.name ASC
    `)
      : [[]];

    res.render("pages/ops/admin/material/locations", {
      seo,
      pageKey: "ops/admin/material/locations",
      promo: false,
      user: req.user,
      locations,
      section: "Ops",
      subsection: "Material",
    });
  } catch (error) {
    console.error("Error loading locations:", error);
    res.render("pages/ops/admin/material/locations", {
      seo,
      pageKey: "ops/admin/material/locations",
      promo: false,
      user: req.user,
      locations: [],
      section: "Ops",
      subsection: "Material",
    });
  }
});

// Transactions Management
router.get("/material/transactions", async (req, res) => {
  const seo = buildSEO({ title: "Material Transactions", url: req.path });

  try {
    const [transactionTypes] = pool ? await pool.query("SELECT id, name, stock_impact FROM material_transaction_types WHERE is_active = true ORDER BY name") : [[]];
    const [materials] = pool ? await pool.query("SELECT id, sku_code, name FROM materials WHERE is_active = true ORDER BY name") : [[]];
    const [locations] = pool ? await pool.query("SELECT id, name FROM material_locations WHERE is_active = true ORDER BY name") : [[]];

    // Handle URL parameters for filtering
    const { type, action } = req.query;
    let selectedTransactionTypeId = null;

    if (type || action) {
      // Map type/action to transaction type ID
      const filterType = type || action;
      const transactionType = transactionTypes.find((tt) => {
        if (filterType === "receive" || filterType === "inbound") {
          return tt.stock_impact === "positive" && (tt.name.toLowerCase().includes("receive") || tt.name.toLowerCase().includes("inbound"));
        } else if (filterType === "issue" || filterType === "outbound") {
          return tt.stock_impact === "negative" && (tt.name.toLowerCase().includes("issue") || tt.name.toLowerCase().includes("outbound"));
        } else if (filterType === "transfer") {
          return tt.name.toLowerCase().includes("transfer");
        } else if (filterType === "adjust") {
          return tt.name.toLowerCase().includes("adjust");
        }
        return false;
      });

      if (transactionType) {
        selectedTransactionTypeId = transactionType.id;
      }
    }

    res.render("pages/ops/admin/material/transactions", {
      seo,
      pageKey: "ops/material/transactions",
      promo: false,
      user: req.user,
      transactionTypes,
      materials,
      locations,
      selectedTransactionTypeId,
      section: "Ops",
      subsection: "Material",
    });
  } catch (error) {
    console.error("Error loading transactions page:", error);
    res.render("pages/ops/admin/material/transactions", {
      seo,
      pageKey: "ops/material/transactions",
      promo: false,
      user: req.user,
      transactionTypes: [],
      materials: [],
      locations: [],
      selectedTransactionTypeId: null,
      section: "Ops",
      subsection: "Material",
    });
  }
});

// Reports
router.get("/material/reports", async (req, res) => {
  const seo = buildSEO({ title: "Material Reports", url: req.path });

  res.render("pages/ops/admin/material/reports", {
    seo,
    pageKey: "ops/material/reports",
    promo: false,
    user: req.user,
    section: "Ops",
    subsection: "Material",
  });
});

export default router;
