// src/routes/ops.js
import { Router } from "express";
import { requireAuth } from "../middleware/rbac.js";
import upload from "../middleware/upload.js";
import { ProductModel } from "../models/ProductModel.js";
import machineryRoutes from "../modules/machinery/routes.js";
import materialAdmin from "../modules/material/admin.js";
import materialRoutes from "../modules/material/routes.js";
import poRoutes from "../modules/po/routes.js";
import admin from "../modules/procurement/admin.js";
import adminApi from "../modules/procurement/adminApi.js";
import billGeneration from "../modules/procurement/billGeneration.js";
import billing from "../modules/procurement/billing.js";
import billingManagement from "../modules/procurement/billingManagement.js";
import { CppMilkController } from "../modules/procurement/controllers/CppMilkController.js";
import { MpMilkController } from "../modules/procurement/controllers/MpMilkController.js";
import { RccMilkController } from "../modules/procurement/controllers/RccMilkController.js";
import { CppMilkModel } from "../modules/procurement/models/CppMilkModel.js";
import { MpMilkModel } from "../modules/procurement/models/MpMilkModel.js";
import { RccMilkModel } from "../modules/procurement/models/RccMilkModel.js";
import * as MilkPoolController from "../modules/production/controllers/MilkPoolController.js";
import { ProductionController } from "../modules/production/controllers/ProductionController.js";
import { MilkInventoryModel } from "../modules/production/models/MilkInventoryModel.js";
import { ProductionModel } from "../modules/production/models/ProductionModel.js";
import { buildSEO } from "../utils/seo.js";
import emailSettingsRoutes from "./emailSettings.js";

const ops = Router();

// Auth routes are now handled by auth.js

// Webhook endpoint (API key auth only, before requireAuth middleware)
import { WebhookController } from "../modules/inward-po/controllers/WebhookController.js";
ops.post("/api/webhook/po", WebhookController.receivePoWebhook);

// Mount shareable product label order route BEFORE authentication
// This allows vendors to access orders without ops login
// Handle both GET (view) and POST (passcode submission) requests
ops.all("/product-labels/orders/share/:shareCode", async (req, res, next) => {
  try {
    const { LabelOrderController } = await import("../modules/product-labels/controllers/LabelOrderController.js");
    return await LabelOrderController.renderShareableOrderPage(req, res);
  } catch (error) {
    return next(error);
  }
});

// All ops routes require authentication
ops.use((req, res, next) => {
  requireAuth(req, res, next);
});

// Landing for Ops PWA (auth required)
ops.get("/", async (req, res) => {
  const seo = buildSEO({ title: "Ops — Dairy Plant Management", url: req.path });

  // Load user permissions if user is authenticated
  let userWithPermissions = req.user;
  if (req.user && req.user.id) {
    try {
      const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
      const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
      if (permissionsResult.success) {
        userWithPermissions = {
          ...req.user,
          permissions: permissionsResult.permissions,
        };
      }
    } catch (error) {
      console.error("Error loading user permissions for dashboard:", error);
    }
  }

  res.render("pages/ops/index", { seo, pageKey: "ops/index", promo: false, user: userWithPermissions });
});

// Procurement overview
ops.get("/procurement", async (req, res) => {
  const seo = buildSEO({ title: "Milk Procurement — Ops", url: req.path });

  // Load user permissions if user is authenticated
  let userWithPermissions = req.user;
  if (req.user && req.user.id) {
    try {
      const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
      const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
      if (permissionsResult.success) {
        userWithPermissions = {
          ...req.user,
          permissions: permissionsResult.permissions,
        };
      }
    } catch (error) {
      console.error("Error loading user permissions for procurement page:", error);
    }
  }

  // Fetch dashboard data for today
  let dashboardData = null;
  try {
    const pool = req.app.get("dbPool");
    if (pool) {
      const today = new Date().toISOString().slice(0, 10);
      const user = req.user;
      const userRole = user?.role;
      const userRccId = user?.rcc_id;

      // Build role-based WHERE conditions
      let rccWhereClause = "";
      let cppWhereClause = "";
      let rccParams = [today];
      let cppParams = [today];

      if (userRole === "rcc_manager" && userRccId) {
        rccWhereClause = " AND e.rcc_id = ?";
        cppWhereClause = " AND c.rcc_id = ?";
        rccParams.push(userRccId);
        cppParams.push(userRccId);
      }

      // Get today's summary
      const [todaySummary] = await pool.query(
        `
        SELECT 
          SUM(qty_litres) AS total_volume,
          COUNT(DISTINCT cpp_id) AS cpp_count,
          COUNT(DISTINCT c.rcc_id) AS rcc_count,
          AVG(fat) AS avg_fat,
          AVG(snf) AS avg_snf,
          AVG(clr) AS avg_clr
        FROM milk_entries_cpp e
        LEFT JOIN cpp c ON c.id = e.cpp_id
        WHERE e.date = ? AND e.status = 'accepted'${cppWhereClause}
        `,
        cppParams,
      );

      // Get milk type breakdown
      const [milkTypeBreakdown] = await pool.query(
        `
        SELECT 
          milk_type,
          SUM(qty_litres) AS total_volume,
          AVG(fat) AS avg_fat
        FROM milk_entries_cpp 
        WHERE date = ? AND status = 'accepted'${cppWhereClause}
        GROUP BY milk_type
        `,
        cppParams,
      );

      dashboardData = {
        today: {
          totalVolume: todaySummary[0]?.total_volume || 0,
          cppCount: todaySummary[0]?.cpp_count || 0,
          rccCount: todaySummary[0]?.rcc_count || 0,
          avgFat: todaySummary[0]?.avg_fat || 0,
          avgSnf: todaySummary[0]?.avg_snf || 0,
          avgClr: todaySummary[0]?.avg_clr || 0,
        },
        milkTypes: milkTypeBreakdown || [],
      };
    }
  } catch (error) {
    console.error("Error loading procurement dashboard data:", error);
  }

  res.render("pages/ops/procurement/index", {
    seo,
    pageKey: "ops/procurement/index",
    promo: false,
    user: userWithPermissions,
    dashboardData,
  });
});

// CPP entry form — select CPP (admin/RCC/MP/PO) or fixed (CPP user)
ops.get("/procurement/cpp", async (req, res) => {
  const seo = buildSEO({ title: "CPP — Milk Entry", url: req.path });
  const pool = req.app.get("dbPool");
  let farmerList = [];
  let cppList = [];
  const scopeCppId = req.user?.scope?.cpp_id || null;
  // Force no auto-selection - only use explicitly provided CPP ID from URL
  const selectedCppId = req.query.cpp_id ? Number(req.query.cpp_id) : null;
  const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);
  const selectedTime = req.query.time || "morning";
  const selectedMilkType = req.query.milkType || "all";
  // Only use CPP ID if explicitly provided in URL query
  let finalSelectedCppId = req.query.cpp_id ? Number(req.query.cpp_id) : null;

  // Initialize existingCppEntries based on selectedTime
  let existingCppEntries = selectedTime === "day" ? { morning: [], evening: [] } : [];
  let bulkCppList = []; // Separate list for bulk entry (all CPPs, not filtered by milk type)

  try {
    if (pool) {
      // Load CPP list for daily entry - filter by user's RCC if user is RCC Manager
      // Also filter by milk type if specified (show only CPPs that have farmers with that milk type)
      let cppQuery = `
        SELECT DISTINCT c.id, c.name, COALESCE(c.milk_type, 'A2') as milk_type 
        FROM cpp c
        WHERE c.status = 'active'
      `;
      let cppParams = [];

      // If user is RCC Manager, filter CPPs by their assigned RCC
      if (req.user.role === "rcc_manager" && req.user.rcc_id) {
        cppQuery += " AND c.rcc_id = ?";
        cppParams.push(req.user.rcc_id);
      }

      // Filter CPPs by milk type if specified (only show CPPs that have farmers with that milk type)
      if (selectedMilkType && selectedMilkType !== 'all') {
        cppQuery += ` AND EXISTS (
          SELECT 1 FROM farmers f 
          WHERE f.cpp_id = c.id 
          AND f.status = 'active' 
          AND COALESCE(f.milk_type, 'A2') = ?
        )`;
        cppParams.push(selectedMilkType);
      }

      cppQuery += " ORDER BY c.id ASC";

      const [cppRows] = await pool.query(cppQuery, cppParams);
      cppList = cppRows || [];

      // Load ALL CPPs for bulk entry (not filtered by milk type)
      let bulkCppQuery = `
        SELECT DISTINCT c.id, c.name, COALESCE(c.milk_type, 'A2') as milk_type 
        FROM cpp c
        WHERE c.status = 'active'
      `;
      let bulkCppParams = [];

      // If user is RCC Manager, filter CPPs by their assigned RCC
      if (req.user.role === "rcc_manager" && req.user.rcc_id) {
        bulkCppQuery += " AND c.rcc_id = ?";
        bulkCppParams.push(req.user.rcc_id);
      }

      bulkCppQuery += " ORDER BY c.id ASC";

      const [bulkCppRows] = await pool.query(bulkCppQuery, bulkCppParams);
      bulkCppList = bulkCppRows || [];

      // No auto-selection - user must select CPP manually

      // Load farmers for selected CPP
      if (finalSelectedCppId) {
        let farmerQuery = `
          SELECT f.id, f.name, f.phone, f.village, COALESCE(f.milk_type, 'A2') AS milk_type
          FROM farmers f
          WHERE f.cpp_id = ? AND f.status = 'active'
        `;
        const farmerParams = [finalSelectedCppId];
        
        // Filter by milk type if specified and not 'all'
        if (selectedMilkType && selectedMilkType !== 'all') {
          farmerQuery += ` AND COALESCE(f.milk_type, 'A2') = ?`;
          farmerParams.push(selectedMilkType);
        }
        
        farmerQuery += ` ORDER BY f.name`;
        
        const [farmerRows] = await pool.query(farmerQuery, farmerParams);
        farmerList = farmerRows || [];

        // Load existing CPP entries using the model directly
        try {
          if (selectedTime === "day") {
            // For day view, load both morning and evening entries
            const morningResult = await CppMilkModel.listMilkEntries({ cpp_id: finalSelectedCppId, date: selectedDate, time: "morning" });
            const eveningResult = await CppMilkModel.listMilkEntries({ cpp_id: finalSelectedCppId, date: selectedDate, time: "evening" });

            const morningEntries = (morningResult.rows || []).map((r) => ({
              id: r.id,
              farmerId: r.farmer_id,
              farmerName: r.farmer_name || "",
              milkType: r.milk_type,
              qty: Number(r.qty || 0),
              fat: r.fat != null ? Number(r.fat) : null,
              snf: r.snf != null ? Number(r.snf) : null,
              clr: r.clr != null ? Number(r.clr) : null,
              water: r.water != null ? Number(r.water) : null,
              status: r.status || "accepted",
              time: "morning",
            }));

            const eveningEntries = (eveningResult.rows || []).map((r) => ({
              id: r.id,
              farmerId: r.farmer_id,
              farmerName: r.farmer_name || "",
              milkType: r.milk_type,
              qty: Number(r.qty || 0),
              fat: r.fat != null ? Number(r.fat) : null,
              snf: r.snf != null ? Number(r.snf) : null,
              clr: r.clr != null ? Number(r.clr) : null,
              water: r.water != null ? Number(r.water) : null,
              status: r.status || "accepted",
              time: "evening",
            }));

            existingCppEntries = {
              morning: morningEntries,
              evening: eveningEntries,
            };
          } else {
            // For morning/evening view, load single time entries
            const result = await CppMilkModel.listMilkEntries({ cpp_id: finalSelectedCppId, date: selectedDate, time: selectedTime });
            existingCppEntries = (result.rows || []).map((r) => ({
              id: r.id,
              farmerId: r.farmer_id,
              farmerName: r.farmer_name || "",
              milkType: r.milk_type,
              qty: Number(r.qty || 0),
              fat: r.fat != null ? Number(r.fat) : null,
              snf: r.snf != null ? Number(r.snf) : null,
              clr: r.clr != null ? Number(r.clr) : null,
              water: r.water != null ? Number(r.water) : null,
              status: r.status || "accepted",
              time: selectedTime,
            }));
          }
        } catch (error) {
          console.error("Error loading existing CPP entries:", error);
          existingCppEntries = selectedTime === "day" ? { morning: [], evening: [] } : [];
        }
      }
    } else {
    }
  } catch (error) {
    console.error("Error loading CPP data:", error);
  }

  // Use finalSelectedCppId only when explicitly provided, otherwise null
  const renderSelectedCppId = finalSelectedCppId;

  res.render("pages/ops/procurement/cpp", {
    seo,
    pageKey: "ops/procurement/cpp",
    promo: false,
    user: req.user,
    farmerList,
    cppList,
    bulkCppList, // All CPPs for bulk entry (not filtered by milk type)
    existingCppEntries,
    selectedCppId: renderSelectedCppId,
    selectedDate,
    selectedTime,
    selectedMilkType,
  });
});

// RCC entry: aggregated CPP data with accept/edit functionality
ops.get("/procurement/rcc", async (req, res) => {
  const seo = buildSEO({ title: "RCC — Milk Entry", url: req.path });
  const pool = req.app.get("dbPool");
  let cppSummaryData = [];
  let existingRccEntries = [];
  let rccList = [];
  const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);
  const selectedTime = req.query.time || "morning";
  const selectedRccId = req.query.rcc_id ? Number(req.query.rcc_id) : req.user?.scope?.rcc_id || 1;

  try {
    if (pool) {
      // Load RCC list
      const [rccRows] = await pool.query("SELECT id, name FROM rcc WHERE status = 'active' ORDER BY id ASC");
      rccList = rccRows || [];

      // Load CPP data for the selected RCC
      if (selectedTime === "day") {
        // For day view, load separate morning and evening data
        const morningResult = await CppMilkModel.listCppSummary({ rcc_id: selectedRccId, date: selectedDate, time: "morning" });
        const eveningResult = await CppMilkModel.listCppSummary({ rcc_id: selectedRccId, date: selectedDate, time: "evening" });

        // Combine morning and evening data
        const morningData = (morningResult.rows || []).map((row) => ({
          cppId: row.cpp_id,
          cppName: row.cpp_name,
          milkType: row.milk_type,
          totalQty: row.total_qty,
          fat: row.avg_fat,
          snf: row.avg_snf,
          clr: row.avg_clr,
          water: row.avg_water,
          time: "morning",
        }));

        const eveningData = (eveningResult.rows || []).map((row) => ({
          cppId: row.cpp_id,
          cppName: row.cpp_name,
          milkType: row.milk_type,
          totalQty: row.total_qty,
          fat: row.avg_fat,
          snf: row.avg_snf,
          clr: row.avg_clr,
          water: row.avg_water,
          time: "evening",
        }));

        // Create a map to combine data by CPP ID
        const cppDataMap = new Map();

        // Add morning data
        morningData.forEach((cpp) => {
          cppDataMap.set(cpp.cppId, {
            cppId: cpp.cppId,
            cppName: cpp.cppName,
            morning: cpp,
            evening: null,
          });
        });

        // Add evening data
        eveningData.forEach((cpp) => {
          if (cppDataMap.has(cpp.cppId)) {
            cppDataMap.get(cpp.cppId).evening = cpp;
          } else {
            cppDataMap.set(cpp.cppId, {
              cppId: cpp.cppId,
              cppName: cpp.cppName,
              morning: null,
              evening: cpp,
            });
          }
        });

        // Convert to the format expected by summary cards by calculating totals
        cppSummaryData = Array.from(cppDataMap.values()).map((cpp) => {
          const morning = cpp.morning || { totalQty: 0, fat: 0, snf: 0, clr: 0, water: 0 };
          const evening = cpp.evening || { totalQty: 0, fat: 0, snf: 0, clr: 0, water: 0 };

          const totalQty = parseFloat(morning.totalQty || 0) + parseFloat(evening.totalQty || 0);
          const morningQty = parseFloat(morning.totalQty || 0);
          const eveningQty = parseFloat(evening.totalQty || 0);

          // Calculate weighted averages
          const totalWeightedFat = parseFloat(morning.fat || 0) * morningQty + parseFloat(evening.fat || 0) * eveningQty;
          const totalWeightedSnf = parseFloat(morning.snf || 0) * morningQty + parseFloat(evening.snf || 0) * eveningQty;
          const totalWeightedClr = parseFloat(morning.clr || 0) * morningQty + parseFloat(evening.clr || 0) * eveningQty;
          const totalWeightedWater = parseFloat(morning.water || 0) * morningQty + parseFloat(evening.water || 0) * eveningQty;

          return {
            cppId: cpp.cppId,
            cppName: cpp.cppName,
            milkType: morning.milkType || evening.milkType || "A2",
            totalQty: totalQty,
            fat: totalQty > 0 ? totalWeightedFat / totalQty : 0,
            snf: totalQty > 0 ? totalWeightedSnf / totalQty : 0,
            clr: totalQty > 0 ? totalWeightedClr / totalQty : 0,
            water: totalQty > 0 ? totalWeightedWater / totalQty : 0,
            morning: morning,
            evening: evening,
          };
        });
      } else {
        // For single time view, use the original logic
        const result = await CppMilkModel.listCppSummary({ rcc_id: selectedRccId, date: selectedDate, time: selectedTime });
        cppSummaryData = (result.rows || []).map((row) => ({
          cppId: row.cpp_id,
          cppName: row.cpp_name,
          milkType: row.milk_type,
          totalQty: row.total_qty,
          fat: row.avg_fat,
          snf: row.avg_snf,
          clr: row.avg_clr,
          water: row.avg_water,
        }));
      }

      // Load existing RCC entries to check status
      if (selectedTime === "day") {
        // For day view, get all individual morning and evening entries
        const rccResult = await RccMilkModel.listMilkEntries({ rcc_id: selectedRccId, date: selectedDate, time: selectedTime });
        existingRccEntries = (rccResult.rows || []).map((r) => ({
          id: r.id,
          cpp_id: r.cpp_id,
          cppName: r.cpp_name || "",
          milkType: r.milk_type,
          qty: Number(r.qty || 0),
          fat: r.fat != null ? Number(r.fat) : null,
          snf: r.snf != null ? Number(r.snf) : null,
          clr: r.clr != null ? Number(r.clr) : null,
          water: r.water != null ? Number(r.water) : null,
          status: r.status,
          time: r.entry_time || "evening", // Include time field to distinguish morning/evening, default to evening
        }));
      } else {
        // For morning/evening view, use individual entries
        const rccResult = await RccMilkModel.listMilkEntries({ rcc_id: selectedRccId, date: selectedDate, time: selectedTime });
        existingRccEntries = (rccResult.rows || []).map((r) => ({
          id: r.id,
          cpp_id: r.cpp_id,
          cppName: r.cpp_name || "",
          milkType: r.milk_type,
          qty: Number(r.qty || 0),
          fat: r.fat != null ? Number(r.fat) : null,
          snf: r.snf != null ? Number(r.snf) : null,
          clr: r.clr != null ? Number(r.clr) : null,
          water: r.water != null ? Number(r.water) : null,
          status: r.status,
          time: r.entry_time, // Include time field
        }));
      }
    }
  } catch (error) {
    console.error("Error loading RCC data:", error);
  }
  res.render("pages/ops/procurement/rcc", {
    seo,
    pageKey: "ops/procurement/rcc",
    promo: false,
    user: req.user,
    cppSummaryData,
    existingRccEntries,
    selectedDate,
    selectedTime,
    rccList,
    selectedRccId,
  });
});

// MP entry: review and accept aggregated RCC data
ops.get("/procurement/mp", async (req, res) => {
  const seo = buildSEO({ title: "MP — Milk Entry", url: req.path });
  const pool = req.app.get("dbPool");
  let rccSummaryData = [];
  let existingMpEntries = [];
  const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    if (pool) {
      // Load aggregated RCC data for all RCCs (daily aggregation)
      const result = await RccMilkModel.listRccSummaryForMp({ date: selectedDate });
      rccSummaryData = (result.rows || []).map((row) => ({
        rccId: row.rcc_id,
        rccName: row.rcc_name,
        milkType: row.milk_type,
        totalQty: row.total_qty,
        fat: row.avg_fat,
        snf: row.avg_snf,
        clr: row.avg_clr,
        water: row.avg_water,
      }));

      // Load existing MP entries to check status
      const mpResult = await MpMilkModel.listMilkEntries({ date: selectedDate });
      existingMpEntries = (mpResult.rows || []).map((r) => ({
        id: r.id,
        rcc_id: r.rcc_id,
        rccName: r.rcc_name || "",
        milkType: r.milk_type,
        qty: Number(r.qty || 0),
        fat: r.fat != null ? Number(r.fat) : null,
        snf: r.snf != null ? Number(r.snf) : null,
        clr: r.clr != null ? Number(r.clr) : null,
        water: r.water != null ? Number(r.water) : null,
        status: r.status,
      }));
    }
  } catch (error) {
    console.error("Error loading MP data:", error);
  }
  res.render("pages/ops/procurement/mp", { seo, pageKey: "ops/procurement/mp", promo: false, user: req.user, rccSummaryData, existingMpEntries, selectedDate });
});

// API routes for CPP milk entries
ops.delete("/api/procurement/cpp/entries/:id", CppMilkController.deleteMilkEntry);
ops.post("/api/procurement/cpp/entries", CppMilkController.saveMilkEntries);
ops.get("/api/procurement/cpp/entries", CppMilkController.listMilkEntries);
ops.get("/api/procurement/cpp/summary", CppMilkController.listCppSummary);
ops.put("/api/procurement/cpp/entries-status", CppMilkController.updateEntriesStatus);
ops.put("/api/procurement/cpp/entries/:id", CppMilkController.updateMilkEntry);
ops.get("/api/procurement/cpp/delete-entry/:id", CppMilkController.deleteMilkEntry);
ops.delete("/api/procurement/cpp/entries", CppMilkController.deleteMilkEntries);
ops.get("/api/procurement/cpp/monthly-data", CppMilkController.getMonthlyData);

  // List farmers by CPP (for bulk entry assistance)
  ops.get("/api/procurement/cpp/farmers", async (req, res) => {
    try {
      const pool = req.app.get("dbPool");
      const { cpp_id } = req.query || {};
      if (!cpp_id) {
        return res.status(400).json({ ok: false, error: "Missing cpp_id" });
      }
      const [rows] = await pool.query(
        `SELECT f.id, f.name, f.phone, f.village, COALESCE(f.milk_type, 'A2') AS milk_type
         FROM farmers f
         WHERE f.cpp_id = ? AND f.status = 'active'
         ORDER BY f.name`,
        [Number(cpp_id)]
      );
      return res.json({ ok: true, farmers: rows || [] });
    } catch (e) {
      console.error("/api/procurement/cpp/farmers error:", e);
      return res.status(500).json({ ok: false, error: "Failed to fetch farmers" });
    }
  });

  // List CPPs filtered by milk type (for dynamic CPP dropdown)
  ops.get("/api/procurement/cpp/list", async (req, res) => {
    try {
      const pool = req.app.get("dbPool");
      const { milkType } = req.query || {};
      
      let cppQuery = `
        SELECT DISTINCT c.id, c.name, COALESCE(c.milk_type, 'A2') as milk_type 
        FROM cpp c
        WHERE c.status = 'active'
      `;
      let cppParams = [];

      // If user is RCC Manager, filter CPPs by their assigned RCC
      if (req.user.role === "rcc_manager" && req.user.rcc_id) {
        cppQuery += " AND c.rcc_id = ?";
        cppParams.push(req.user.rcc_id);
      }

      // Filter CPPs by milk type if specified (only show CPPs that have farmers with that milk type)
      if (milkType && milkType !== 'all') {
        cppQuery += ` AND EXISTS (
          SELECT 1 FROM farmers f 
          WHERE f.cpp_id = c.id 
          AND f.status = 'active' 
          AND COALESCE(f.milk_type, 'A2') = ?
        )`;
        cppParams.push(milkType);
      }

      cppQuery += " ORDER BY c.id ASC";

      const [cppRows] = await pool.query(cppQuery, cppParams);
      return res.json({ ok: true, cpps: cppRows || [] });
    } catch (e) {
      console.error("/api/procurement/cpp/list error:", e);
      return res.status(500).json({ ok: false, error: "Failed to fetch CPPs" });
    }
  });

// API routes for RCC milk entries
ops.post("/api/procurement/rcc/entries", RccMilkController.saveMilkEntries);
ops.get("/api/procurement/rcc/entries", RccMilkController.listMilkEntries);
ops.get("/api/procurement/rcc/summary", RccMilkController.listRccSummary);
ops.get("/api/procurement/rcc/summary-mp", RccMilkController.listRccSummaryForMp);
ops.put("/api/procurement/rcc/entries/:id", RccMilkController.updateMilkEntry);
ops.delete("/api/procurement/rcc/entries", RccMilkController.deleteMilkEntries);

// API routes for MP milk entries
ops.post("/api/procurement/mp/entries", MpMilkController.saveMilkEntries);
ops.get("/api/procurement/mp/entries", MpMilkController.listMilkEntries);
ops.put("/api/procurement/mp/entries/:id", MpMilkController.updateMilkEntry);
ops.delete("/api/procurement/mp/entries", MpMilkController.deleteMilkEntries);

// Payment Analytics Reports page (must be before billing module to avoid route conflict)
ops.get("/procurement/billing/analytics", (req, res) => {
  const seo = buildSEO({ title: "Payment Analytics — Billing Reports", url: req.path });
  res.render("pages/ops/procurement/billing-reports", { seo, pageKey: "ops/procurement/billing-analytics", promo: false, user: req.user });
});

// Mount admin CRUD under /ops/admin/*
ops.use("/", admin);
ops.use("/", billing);
ops.use("/", adminApi);

// Billing management API routes
ops.use("/api/billing", billingManagement);

// Bill generation API routes
ops.use("/api/bills", billGeneration);

// Production Management Routes
// Production overview - redirect to dashboard
ops.get("/production", (req, res) => {
  res.redirect("/production/dashboard");
});

// Production Dashboard
ops.get("/production/dashboard", ProductionController.getDashboard);

// Dashboard API routes
ops.get("/api/procurement/dashboard/chart", async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const endDate = req.query.endDate || new Date().toISOString().slice(0, 10);

  try {
    const pool = req.app.get("dbPool");
    if (!pool) {
      throw new Error("Database pool not available");
    }

    // Calculate start date
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // Get user role and RCC ID for filtering
    const user = req.user;
    const userRole = user?.role;
    const userRccId = user?.rcc_id;

    // Build role-based WHERE conditions
    let whereClause = "WHERE e.date >= ? AND e.date <= ? AND e.status = 'accepted'";
    let params = [startDateStr, endDate];

    if (userRole === "rcc_manager" && userRccId) {
      whereClause += " AND c.rcc_id = ?";
      params.push(userRccId);
    }

    // Get daily volume data
    const [chartData] = await pool.query(
      `
      SELECT 
        e.date,
        SUM(e.qty_litres) AS total_volume,
        COUNT(DISTINCT e.cpp_id) AS cpp_count,
        AVG(e.fat) AS avg_fat,
        AVG(e.snf) AS avg_snf,
        AVG(e.clr) AS avg_clr,
        AVG(e.water_pct) AS avg_water
      FROM milk_entries_cpp e
      LEFT JOIN cpp c ON c.id = e.cpp_id
      ${whereClause}
      GROUP BY e.date
      ORDER BY e.date ASC
      `,
      params,
    );

    // Get milk type breakdown for each day
    const [milkTypeData] = await pool.query(
      `
      SELECT 
        e.date,
        e.milk_type,
        SUM(e.qty_litres) AS volume
      FROM milk_entries_cpp e
      LEFT JOIN cpp c ON c.id = e.cpp_id
      ${whereClause}
      GROUP BY e.date, e.milk_type
      ORDER BY e.date ASC, e.milk_type
      `,
      params,
    );

    // Format data for chart
    const labels = chartData.map((item) => {
      const date = new Date(item.date);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    const volumes = chartData.map((item) => Number(item.total_volume || 0));
    const cppCounts = chartData.map((item) => Number(item.cpp_count || 0));
    const avgFat = chartData.map((item) => Number(item.avg_fat || 0));
    const avgSnf = chartData.map((item) => Number(item.avg_snf || 0));

    // Group milk type data by date
    const milkTypeByDate = {};
    milkTypeData.forEach((item) => {
      if (!milkTypeByDate[item.date]) {
        milkTypeByDate[item.date] = {};
      }
      milkTypeByDate[item.date][item.milk_type] = Number(item.volume || 0);
    });

    // Create datasets for each milk type
    const milkTypeDatasets = {};
    const milkTypes = ["A1", "A2", "Buffalo"];

    milkTypes.forEach((type) => {
      milkTypeDatasets[type] = chartData.map((item) => {
        return milkTypeByDate[item.date] && milkTypeByDate[item.date][type] ? milkTypeByDate[item.date][type] : 0;
      });
    });

    const summary = {
      totalVolume: volumes.reduce((sum, vol) => sum + vol, 0),
      avgDailyVolume: volumes.length > 0 ? volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length : 0,
      maxVolume: volumes.length > 0 ? Math.max(...volumes) : 0,
      minVolume: volumes.length > 0 ? Math.min(...volumes) : 0,
      totalDays: volumes.length,
    };

    res.json({
      success: true,
      data: {
        labels,
        datasets: {
          total: volumes,
          cppCount: cppCounts,
          avgFat,
          avgSnf,
          milkTypes: milkTypeDatasets,
        },
        summary,
      },
    });
  } catch (error) {
    console.error("Chart data error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load chart data",
    });
  }
});

ops.get("/api/procurement/dashboard/export", async (req, res) => {
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      error: "Start date and end date are required",
    });
  }

  try {
    const pool = req.app.get("dbPool");
    if (!pool) {
      throw new Error("Database pool not available");
    }

    // Get user role and RCC ID for filtering
    const user = req.user;
    const userRole = user?.role;
    const userRccId = user?.rcc_id;

    // Build role-based WHERE conditions
    let whereClause = "WHERE e.date >= ? AND e.date <= ? AND e.status = 'accepted'";
    let params = [startDate, endDate];

    if (userRole === "rcc_manager" && userRccId) {
      whereClause += " AND c.rcc_id = ?";
      params.push(userRccId);
    }

    // Get detailed data for export
    const [exportData] = await pool.query(
      `
      SELECT 
        e.date,
        e.time,
        r.name AS rcc_name,
        c.name AS cpp_name,
        e.milk_type,
        e.qty_litres,
        e.fat,
        e.snf,
        e.clr,
        e.water_pct,
        e.status,
        e.created_at
      FROM milk_entries_cpp e
      LEFT JOIN cpp c ON c.id = e.cpp_id
      LEFT JOIN rcc r ON r.id = c.rcc_id
      ${whereClause}
      ORDER BY e.date DESC, e.time, r.name, c.name, e.milk_type
      `,
      params,
    );

    // Generate CSV content
    const headers = ["Date", "Time", "RCC Name", "CPP Name", "Milk Type", "Quantity (L)", "Fat %", "SNF %", "CLR", "Water %", "Status", "Created At"];

    const csvContent = [headers.join(","), ...exportData.map((row) => [row.date, row.time, `"${row.rcc_name || ""}"`, `"${row.cpp_name || ""}"`, row.milk_type || "", Number(row.qty_litres || 0).toFixed(2), Number(row.fat || 0).toFixed(2), Number(row.snf || 0).toFixed(2), Number(row.clr || 0).toFixed(2), Number(row.water_pct || 0).toFixed(2), row.status || "", row.created_at ? new Date(row.created_at).toISOString() : ""].join(","))].join("\n");

    // Set headers for CSV download
    const filename = `milk_procurement_${startDate}_to_${endDate}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to export data",
    });
  }
});

// Daily Production Entry
ops.get("/production/daily-production", ProductionController.getDailyProduction);
ops.post("/production/daily-production", ProductionController.saveDailyProduction);
ops.delete("/production/daily-production", ProductionController.deleteDailyProduction);

// Production Analytics
ops.get("/production/analytics", ProductionController.getAnalytics);

// Product Management
ops.get("/production/products", (req, res) => {
  console.log("🚨 ROUTE: /ops/production/products called!");
  ProductionController.getProducts(req, res);
});
ops.get("/production/products-api", ProductionController.getProductsApi); // API route - must be before /:id route
ops.get("/production/products/api", ProductionController.getProductsApi); // Alternative API route
ops.get("/production/products/:id", ProductionController.getProductById); // Added for fetching single product
ops.post("/production/products", upload.single("product_image"), ProductionController.createProduct);
ops.put("/production/products/:id", upload.single("product_image"), ProductionController.updateProduct);
ops.delete("/production/products/:id", ProductionController.deleteProduct);

// Category Management
ops.get("/production/categories", ProductionController.getCategories);
ops.get("/production/categories/:id", ProductionController.getCategoryById);
ops.post("/production/categories", ProductionController.createCategory);
ops.put("/production/categories/:id", ProductionController.updateCategory);
ops.delete("/production/categories/:id", ProductionController.deleteCategory);

// Milk Pool routes
ops.get("/production/milk-pools", MilkPoolController.renderMilkPools);
ops.get("/production/pool-management", MilkPoolController.renderMilkPools);
ops.get("/production/milk-pools/api", MilkPoolController.getAllMilkPools);
ops.get("/production/milk-pools/api/:id", MilkPoolController.getMilkPoolById);
ops.post("/production/milk-pools/api", MilkPoolController.createMilkPool);
ops.put("/production/milk-pools/api/:id", MilkPoolController.updateMilkPool);
ops.delete("/production/milk-pools/api/:id", MilkPoolController.deleteMilkPool);

// Pool Allocation routes
ops.get("/production/pool-allocations/api", MilkPoolController.getDailyPoolAllocations);
ops.post("/production/pool-allocations/api", MilkPoolController.saveDailyPoolAllocation);
ops.delete("/production/pool-allocations/api", MilkPoolController.deleteDailyPoolAllocation);

// Milk Inventory API route
ops.get("/production/milk-inventory/api", ProductionController.getMilkInventoryApi);
ops.get("/production/daily-production/api", ProductionController.getDailyProductionApi);
ops.get("/production/production-data/api", ProductionController.getProductionDataApi);
ops.get("/production/milk-volume-trends/api", ProductionController.getMilkVolumeTrendsApi);
ops.get("/production/debug-milk-inventory/api", ProductionController.getDebugMilkInventoryApi);

// Machinery Management Routes
ops.use("/machinery", machineryRoutes);

// Email settings routes
ops.use("/email-settings", emailSettingsRoutes);

// PO Management routes
ops.use("/po", poRoutes);

// PO API routes
ops.use("/po/api/v1", poRoutes);

// Inward PO Management routes
import inwardPoRoutes from "../modules/inward-po/routes.js";
ops.use("/inward-po", inwardPoRoutes);

// Material Management routes
ops.use("/", materialAdmin);
ops.use("/api/v1/material", materialRoutes);

// Sales Management routes
import salesRoutes from "../modules/sales/routes/salesRoutes.js";
ops.use("/sales", salesRoutes);

import accountingRoutes from "../modules/accounting/routes/accountingRoutes.js";
ops.use("/accounting", accountingRoutes);

import paymentsRoutes from "../modules/payments/routes.js";
ops.use("/payments", paymentsRoutes);

// Employee Management routes
import employeeRoutes from "../modules/employees/routes.js";
ops.use("/employees", employeeRoutes);

// Rental Properties Management routes
import rentalPropertiesRoutes from "../modules/rental-properties/routes.js";
ops.use("/rental-properties", rentalPropertiesRoutes);

// Transport Vehicles Management routes
import transportVehiclesRoutes from "../modules/transport-vehicles/routes.js";
ops.use("/transport-vehicles", transportVehiclesRoutes);

// IT Services Management routes
import itServicesRoutes from "../modules/it-services/routes.js";
import electricityMetersRoutes from "../modules/electricity-meters/routes.js";
ops.use("/it-services", itServicesRoutes);
ops.use("/electricity-meters", electricityMetersRoutes);

// Analytics routes
import analyticsRoutes from "../modules/analytics/index.js";
ops.use("/analytics", analyticsRoutes);

// Product Margin Management routes
import productMarginRoutes from "../modules/product-margin/routes.js";
ops.use("/product-margin", productMarginRoutes);

// Product Labels routes
import productLabelsRoutes from "../modules/product-labels/routes.js";
ops.use("/product-labels", productLabelsRoutes);

// Product Margin Management Dashboard
ops.get("/product-margin", async (req, res) => {
  const seo = buildSEO({ title: "Product Margin Management — Ops", url: req.path });

  // Load user permissions if user is authenticated
  let userWithPermissions = req.user;
  if (req.user && req.user.id) {
    try {
      const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
      const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
      if (permissionsResult.success) {
        userWithPermissions = {
          ...req.user,
          permissions: permissionsResult.permissions,
        };
      }
    } catch (error) {
      console.error("Error loading user permissions for product margin page:", error);
    }
  }

  res.render("pages/ops/product-margin/dashboard", {
    seo,
    pageKey: "ops/product-margin/dashboard",
    promo: false,
    user: userWithPermissions,
  });
});

export default ops;
