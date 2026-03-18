// src/modules/procurement/admin.js
import { Router } from "express";
import pool from "../../db/pool.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { buildSEO } from "../../utils/seo.js";

const admin = Router();

// Guard admin routes: Admin only, but allow other modules (eg. /ops/admin/material) to be handled by their own routers
admin.use("/admin", (req, res, next) => {
  // Allow material module routes (and other module-owned admin subpaths) to bypass this admin-only guard
  const original = req.originalUrl || '';
  if (original.startsWith('/ops/admin/material')) {
    return next();
  }
  return requireAdmin(req, res, next);
});

// Main Admin Dashboard
admin.get("/admin", async (req, res) => {
  const seo = buildSEO({ title: "Admin Dashboard", url: req.path });

  // Get counts for dashboard cards
  let stats = {
    // Procurement stats
    totalRccs: 0,
    totalCpps: 0,
    totalFarmers: 0,
    activeRccs: 0,
    activeCpps: 0,
    activeFarmers: 0,
    // Machinery stats
    totalMachines: 0,
    activeMachines: 0,
    totalCategories: 0,
    totalServiceTypes: 0,
    openIssues: 0,
    // Production stats
    totalProducts: 0,
    totalProductCategories: 0,
    totalMilkPools: 0,
  };

  if (pool) {
    try {
      // Procurement stats
      const [rccCount] = await pool.query("SELECT COUNT(*) as count FROM rcc");
      const [cppCount] = await pool.query("SELECT COUNT(*) as count FROM cpp");
      const [farmerCount] = await pool.query("SELECT COUNT(*) as count FROM farmers");
      const [activeRccCount] = await pool.query("SELECT COUNT(*) as count FROM rcc WHERE status = 'active'");
      const [activeCppCount] = await pool.query("SELECT COUNT(*) as count FROM cpp WHERE status = 'active'");
      const [activeFarmerCount] = await pool.query("SELECT COUNT(*) as count FROM farmers WHERE status = 'active'");

      // Machinery stats
      const [machineCount] = await pool.query("SELECT COUNT(*) as count FROM machines");
      const [activeMachineCount] = await pool.query("SELECT COUNT(*) as count FROM machines WHERE status = 'active'");
      const [categoryCount] = await pool.query("SELECT COUNT(*) as count FROM machine_categories");
      const [serviceTypeCount] = await pool.query("SELECT COUNT(*) as count FROM service_types");
      const [openIssueCount] = await pool.query("SELECT COUNT(*) as count FROM machine_issues WHERE status IN ('open', 'in_progress')");

      // Production stats
      const [productCount] = await pool.query("SELECT COUNT(*) as count FROM products");
      const [productCategoryCount] = await pool.query("SELECT COUNT(*) as count FROM product_categories");
      const [milkPoolCount] = await pool.query("SELECT COUNT(*) as count FROM milk_pools");

      stats = {
        // Procurement stats
        totalRccs: rccCount[0]?.count || 0,
        totalCpps: cppCount[0]?.count || 0,
        totalFarmers: farmerCount[0]?.count || 0,
        activeRccs: activeRccCount[0]?.count || 0,
        activeCpps: activeCppCount[0]?.count || 0,
        activeFarmers: activeFarmerCount[0]?.count || 0,
        // Machinery stats
        totalMachines: machineCount[0]?.count || 0,
        activeMachines: activeMachineCount[0]?.count || 0,
        totalCategories: categoryCount[0]?.count || 0,
        totalServiceTypes: serviceTypeCount[0]?.count || 0,
        openIssues: openIssueCount[0]?.count || 0,
        // Production stats
        totalProducts: productCount[0]?.count || 0,
        totalProductCategories: productCategoryCount[0]?.count || 0,
        totalMilkPools: milkPoolCount[0]?.count || 0,
      };
    } catch (error) {
      console.error("Error fetching admin stats:", error);
    }
  }

  res.render("pages/ops/admin/index", {
    seo,
    pageKey: "ops/admin",
    promo: false,
    user: req.user,
    stats,
    section: "Admin",
    page: "Dashboard",
  });
});

// RCC list/create
admin.get("/admin/rcc", async (req, res) => {
  const seo = buildSEO({ title: "Admin — RCC", url: req.path });
  const [rows] = pool ? await pool.query("SELECT * FROM rcc ORDER BY created_at DESC") : [[]];
  res.render("pages/ops/admin/rcc", {
    seo,
    pageKey: "ops/admin/rcc",
    promo: false,
    user: req.user,
    rows,
    section: "Admin",
    subsection: "RCC",
  });
});
admin.post("/admin/rcc", async (req, res) => {
  const { name, location, manager_name = null, phone = null, rent = 0 } = req.body || {};
  if (pool && name) await pool.query("INSERT INTO rcc (name, location, manager_name, phone, rent) VALUES (?,?,?,?,?)", [name, location || null, manager_name || null, phone || null, Number(rent || 0)]);
  res.redirect("/admin/rcc");
});

// Update RCC
admin.post("/admin/rcc/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, location, manager_name = null, phone = null, rent = 0, status = "active" } = req.body || {};
  if (!pool || !id) return res.redirect("/admin/rcc");
  await pool.query("UPDATE rcc SET name = ?, location = ?, manager_name = ?, phone = ?, rent = ?, status = ? WHERE id = ?", [name || null, location || null, manager_name || null, phone || null, Number(rent || 0), status === "inactive" ? "inactive" : "active", id]);
  res.redirect("/admin/rcc");
});

// CPP list/create
admin.get("/admin/cpp", async (req, res) => {
  const seo = buildSEO({ title: "Admin — CPP", url: req.path });
  const [rows] = pool ? await pool.query("SELECT c.*, r.name AS rcc_name, rc.name AS rate_chart_name FROM cpp c LEFT JOIN rcc r ON r.id = c.rcc_id LEFT JOIN rate_charts rc ON rc.id = c.rate_chart_id ORDER BY c.id ASC") : [[]];
  const [rccs] = pool ? await pool.query('SELECT id, name FROM rcc WHERE status = "active" ORDER BY name') : [[]];
  const [rateCharts] = pool ? await pool.query("SELECT id, name FROM rate_charts ORDER BY name ASC") : [[]];
  res.render("pages/ops/admin/cpp", {
    seo,
    pageKey: "ops/admin/cpp",
    promo: false,
    user: req.user,
    rows,
    rccs,
    rateCharts,
    section: "Admin",
    subsection: "CPP",
  });
});
admin.post("/admin/cpp", async (req, res) => {
  const { name, person_name = null, village, phone, milk_type = "A2", rcc_id = null, salary_type = "fixed", salary_amount = 0, rate_type = "flat", flat_rate = null, rate_chart_id = null } = req.body || {};
  if (pool && name) {
    await pool.query("INSERT INTO cpp (rcc_id, name, person_name, village, phone, milk_type, salary_type, salary_amount, rate_type, flat_rate, rate_chart_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [rcc_id || null, name, person_name || null, village || null, phone || null, milk_type, salary_type, Number(salary_amount || 0), rate_type, flat_rate ? Number(flat_rate) : null, rate_chart_id ? Number(rate_chart_id) : null]);
  }
  res.redirect("/admin/cpp");
});

// Update CPP
admin.post("/admin/cpp/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!pool || !id) return res.redirect("/admin/cpp");
  const { rcc_id = null, name, person_name = null, village, phone, milk_type = "A2", status = "active", salary_type = "fixed", salary_amount = 0, rate_type = "flat", flat_rate = null, rate_chart_id = null } = req.body || {};
  await pool.query("UPDATE cpp SET rcc_id=?, name=?, person_name=?, village=?, phone=?, milk_type=?, status=?, salary_type=?, salary_amount=?, rate_type=?, flat_rate=?, rate_chart_id=? WHERE id=?", [rcc_id || null, name || null, person_name || null, village || null, phone || null, milk_type, status === "inactive" ? "inactive" : "active", salary_type, Number(salary_amount || 0), rate_type, flat_rate ? Number(flat_rate) : null, rate_chart_id ? Number(rate_chart_id) : null, id]);
  res.redirect("/admin/cpp");
});

// Farmers list/create
admin.get("/admin/farmers", async (req, res) => {
  const seo = buildSEO({ title: "Admin — Farmers", url: req.path });
  const [rows] = pool ? await pool.query("SELECT f.*, c.name AS cpp_name, rc.name AS rate_chart_name FROM farmers f LEFT JOIN cpp c ON c.id=f.cpp_id LEFT JOIN rate_charts rc ON rc.id=f.rate_chart_id ORDER BY f.created_at DESC") : [[]];
  const [cpps] = pool ? await pool.query('SELECT id, name FROM cpp WHERE status = "active" ORDER BY id ASC') : [[]];
  const [rateCharts] = pool ? await pool.query("SELECT id, name FROM rate_charts ORDER BY name ASC") : [[]];
  let totals = { total: rows.length, active: 0, inactive: 0 };
  if (pool) {
    try {
      const [[t]] = await pool.query("SELECT COUNT(*) AS total FROM farmers");
      const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM farmers WHERE status='active'");
      const [[i]] = await pool.query("SELECT COUNT(*) AS c FROM farmers WHERE status='inactive'");
      totals = { total: Number(t.total || 0), active: Number(a.c || 0), inactive: Number(i.c || 0) };
    } catch (_) {}
  }
  res.render("pages/ops/admin/farmers", {
    seo,
    pageKey: "ops/admin/farmers",
    promo: false,
    user: req.user,
    rows,
    cpps,
    rateCharts,
    totals,
    section: "Admin",
    subsection: "Farmers",
  });
});
admin.post("/admin/farmers", async (req, res) => {
  const { name, village, phone, milk_type = "A2", cpp_id = null, rate_type = "flat", flat_rate = null, rate_chart_id = null } = req.body || {};
  if (pool && name) await pool.query("INSERT INTO farmers (cpp_id, name, village, phone, milk_type, rate_type, flat_rate, rate_chart_id) VALUES (?,?,?,?,?,?,?,?)", [cpp_id || null, name, village || null, phone || null, milk_type, rate_type, flat_rate ? Number(flat_rate) : null, rate_chart_id ? Number(rate_chart_id) : null]);
  res.redirect("/admin/farmers");
});

// Update Farmer
admin.post("/admin/farmers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!pool || !id) return res.redirect("/admin/farmers");
  const { cpp_id = null, name, village, phone, milk_type = "A2", rate_type = "flat", flat_rate = null, rate_chart_id = null, status = "active" } = req.body || {};
  await pool.query("UPDATE farmers SET cpp_id=?, name=?, village=?, phone=?, milk_type=?, rate_type=?, flat_rate=?, rate_chart_id=?, status=? WHERE id=?", [cpp_id || null, name || null, village || null, phone || null, milk_type, rate_type, flat_rate ? Number(flat_rate) : null, rate_chart_id ? Number(rate_chart_id) : null, status === "inactive" ? "inactive" : "active", id]);
  res.redirect("/admin/farmers");
});

// Delete Farmer
admin.delete("/admin/farmers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!pool || !id) return res.status(400).json({ ok: false, error: "Invalid farmer ID" });

  try {
    // Check if farmer has any milk entries
    const [entries] = await pool.query("SELECT COUNT(*) as count FROM milk_entries_cpp WHERE farmer_id = ?", [id]);
    if (entries[0].count > 0) {
      return res.status(400).json({
        ok: false,
        error: "Cannot delete farmer with existing milk entries. Please deactivate instead.",
      });
    }

    // Delete the farmer
    await pool.query("DELETE FROM farmers WHERE id = ?", [id]);
    res.json({ ok: true, message: "Farmer deleted successfully" });
  } catch (error) {
    console.error("Error deleting farmer:", error);
    res.status(500).json({ ok: false, error: "Failed to delete farmer" });
  }
});

// Rate charts list/create
admin.get("/admin/rate-charts", async (req, res) => {
  const seo = buildSEO({ title: "Admin — Rate Charts", url: req.path });

  let charts = [];
  if (pool) {
    // Get all charts
    const [chartResults] = await pool.query("SELECT * FROM rate_charts ORDER BY created_at DESC");

    // For each chart, calculate stats
    charts = await Promise.all(
      chartResults.map(async (chart) => {
        const [slabResults] = await pool.query("SELECT COUNT(*) as slab_count, MIN(rate_per_litre) as min_rate, MAX(rate_per_litre) as max_rate FROM rate_chart_slabs WHERE chart_id = ?", [chart.id]);

        return {
          ...chart,
          slab_count: slabResults[0]?.slab_count || 0,
          min_rate: slabResults[0]?.min_rate || 0,
          max_rate: slabResults[0]?.max_rate || 0,
        };
      }),
    );
  }

  res.render("pages/ops/admin/rate-charts", { seo, pageKey: "ops/admin/rate-charts", promo: false, user: req.user, charts });
});
admin.post("/admin/rate-charts", async (req, res) => {
  const { name, description = "" } = req.body || {};
  if (pool && name) await pool.query("INSERT INTO rate_charts (name, description) VALUES (?, ?)", [name, description]);
  res.redirect("/admin/rate-charts");
});

// Rate chart details + add slab
admin.get("/admin/rate-charts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const seo = buildSEO({ title: "Admin — Rate Chart", url: req.path });
  const [[chart]] = pool ? await pool.query("SELECT * FROM rate_charts WHERE id=?", [id]) : [[null]];
  const [slabs] = pool ? await pool.query("SELECT * FROM rate_chart_slabs WHERE chart_id=? ORDER BY fat_min", [id]) : [[]];
  res.render("pages/ops/admin/rate-chart-detail", { seo, pageKey: "ops/admin/rate-chart-detail", promo: false, user: req.user, chart, slabs });
});
admin.post("/admin/rate-charts/:id/slabs", async (req, res) => {
  const id = Number(req.params.id);
  const { fat_min, fat_max, rate_per_litre } = req.body || {};
  if (pool) await pool.query("INSERT INTO rate_chart_slabs (chart_id, fat_min, fat_max, rate_per_litre) VALUES (?,?,?,?)", [id, Number(fat_min), Number(fat_max), Number(rate_per_litre)]);
  res.redirect(`/ops/admin/rate-charts/${id}`);
});

// Edit chart
admin.post("/admin/rate-charts/:id/edit", async (req, res) => {
  const id = Number(req.params.id);
  const { name, description = "" } = req.body || {};
  if (pool && name) {
    await pool.query("UPDATE rate_charts SET name = ?, description = ? WHERE id = ?", [name, description, id]);
  }
  res.redirect(`/ops/admin/rate-charts/${id}`);
});

// Edit slab
admin.post("/admin/rate-charts/:chartId/slabs/:slabId/edit", async (req, res) => {
  const chartId = Number(req.params.chartId);
  const slabId = Number(req.params.slabId);
  const { fat_min, fat_max, rate_per_litre } = req.body || {};
  if (pool) {
    await pool.query("UPDATE rate_chart_slabs SET fat_min = ?, fat_max = ?, rate_per_litre = ? WHERE id = ? AND chart_id = ?", [Number(fat_min), Number(fat_max), Number(rate_per_litre), slabId, chartId]);
  }
  res.redirect(`/ops/admin/rate-charts/${chartId}`);
});

// Delete slab
admin.post("/admin/rate-charts/:chartId/slabs/:slabId/delete", async (req, res) => {
  const chartId = Number(req.params.chartId);
  const slabId = Number(req.params.slabId);
  if (pool) {
    await pool.query("DELETE FROM rate_chart_slabs WHERE id = ? AND chart_id = ?", [slabId, chartId]);
  }
  res.redirect(`/ops/admin/rate-charts/${chartId}`);
});

// MP (Main Plants) list/create
admin.get("/admin/mp", async (req, res) => {
  const seo = buildSEO({ title: "Admin — MP", url: req.path });
  const [rows] = pool ? await pool.query("SELECT * FROM mp ORDER BY created_at DESC") : [[]];
  res.render("pages/ops/admin/mp", {
    seo,
    pageKey: "ops/admin/mp",
    promo: false,
    user: req.user,
    rows,
    section: "Admin",
    subsection: "MP",
  });
});
admin.post("/admin/mp", async (req, res) => {
  const { name, location = null, rent = 0 } = req.body || {};
  if (pool && name) await pool.query("INSERT INTO mp (name, location, rent) VALUES (?,?,?)", [name, location || null, Number(rent || 0)]);
  res.redirect("/admin/mp");
});

// Update MP
admin.post("/admin/mp/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, location = null, rent = 0, status = "active" } = req.body || {};
  if (!pool || !id) return res.redirect("/admin/mp");
  await pool.query("UPDATE mp SET name = ?, location = ?, rent = ?, status = ? WHERE id = ?", [name || null, location || null, Number(rent || 0), status === "inactive" ? "inactive" : "active", id]);
  res.redirect("/admin/mp");
});

export default admin;
