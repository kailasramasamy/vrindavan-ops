// src/modules/procurement/adminApi.js
import { Router } from "express";
import pool from "../../db/pool.js";

const adminApi = Router();
// adminApi.use("/api/admin", attachUser, requireRole("ADMIN", "PO")); // Temporarily disabled for testing

// RCC
adminApi.get("/api/admin/rcc", async (_req, res) => {
  const [rows] = pool ? await pool.query("SELECT * FROM rcc ORDER BY name") : [[]];
  res.json({ ok: true, rows });
});
adminApi.post("/api/admin/rcc", async (req, res) => {
  const { name, location, manager_name = null, phone = null, rent } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
  await pool.query("INSERT INTO rcc (name, location, manager_name, phone, rent) VALUES (?,?,?,?,?)", [name, location || null, manager_name || null, phone || null, Number(rent || 0)]);
  res.json({ ok: true });
});

// CPP
adminApi.get("/api/admin/cpp", async (_req, res) => {
  const [rows] = await pool.query("SELECT c.*, r.name AS rcc_name FROM cpp c LEFT JOIN rcc r ON r.id=c.rcc_id ORDER BY c.id ASC");
  const [rccs] = await pool.query('SELECT id, name FROM rcc WHERE status="active" ORDER BY name');
  res.json({ ok: true, rows, rccs });
});
adminApi.post("/api/admin/cpp", async (req, res) => {
  const { rcc_id, name, person_name = null, village, phone, milk_type = "A2" } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
  await pool.query("INSERT INTO cpp (rcc_id, name, person_name, village, phone, milk_type) VALUES (?,?,?,?,?,?)", [rcc_id || null, name, person_name || null, village || null, phone || null, milk_type]);
  res.json({ ok: true });
});

// Farmers
adminApi.get("/api/admin/farmers", async (_req, res) => {
  const [rows] = await pool.query("SELECT f.*, c.name AS cpp_name FROM farmers f LEFT JOIN cpp c ON c.id=f.cpp_id ORDER BY f.name");
  const [cpps] = await pool.query('SELECT id, name FROM cpp WHERE status="active" ORDER BY id ASC');
  res.json({ ok: true, rows, cpps });
});
adminApi.post("/api/admin/farmers", async (req, res) => {
  const { cpp_id, name, village, phone, milk_type = "A2", rate_type = "flat", flat_rate = null } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
  await pool.query("INSERT INTO farmers (cpp_id, name, village, phone, milk_type, rate_type, flat_rate) VALUES (?,?,?,?,?,?,?)", [cpp_id || null, name, village || null, phone || null, milk_type, rate_type, flat_rate ? Number(flat_rate) : null]);
  res.json({ ok: true });
});

// Rate charts
adminApi.get("/api/admin/rate-charts", async (_req, res) => {
  const [charts] = await pool.query("SELECT * FROM rate_charts ORDER BY created_at DESC");
  res.json({ ok: true, charts });
});
adminApi.post("/api/admin/rate-charts", async (req, res) => {
  const { name, description = "" } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
  await pool.query("INSERT INTO rate_charts (name, description) VALUES (?,?)", [name, description]);
  res.json({ ok: true });
});
adminApi.get("/api/admin/rate-charts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [[chart]] = await pool.query("SELECT * FROM rate_charts WHERE id=?", [id]);
  const [slabs] = await pool.query("SELECT * FROM rate_chart_slabs WHERE chart_id=? ORDER BY fat_min", [id]);
  res.json({ ok: true, chart, slabs });
});
adminApi.post("/api/admin/rate-charts/:id/slabs", async (req, res) => {
  const id = Number(req.params.id);
  const { fat_min, fat_max, rate_per_litre } = req.body || {};
  await pool.query("INSERT INTO rate_chart_slabs (chart_id, fat_min, fat_max, rate_per_litre) VALUES (?,?,?,?)", [id, Number(fat_min), Number(fat_max), Number(rate_per_litre)]);
  res.json({ ok: true });
});

// MP (Main Plants)
adminApi.get("/api/admin/mp", async (_req, res) => {
  const [rows] = pool ? await pool.query("SELECT * FROM mp ORDER BY name") : [[]];
  res.json({ ok: true, rows });
});
adminApi.post("/api/admin/mp", async (req, res) => {
  const { name, location = null, rent = 0 } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
  if (pool) {
    await pool.query("INSERT INTO mp (name, location, rent) VALUES (?,?,?)", [name, location || null, Number(rent || 0)]);
  }
  res.json({ ok: true });
});
adminApi.put("/api/admin/mp/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, location = null, rent = 0, status = "active" } = req.body || {};
  if (!id || !name) return res.status(400).json({ ok: false, error: "Missing id or name" });
  if (pool) {
    await pool.query("UPDATE mp SET name = ?, location = ?, rent = ?, status = ? WHERE id = ?", [name, location || null, Number(rent || 0), status === "inactive" ? "inactive" : "active", id]);
  }
  res.json({ ok: true });
});
adminApi.delete("/api/admin/mp/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
  if (pool) {
    await pool.query("DELETE FROM mp WHERE id = ?", [id]);
  }
  res.json({ ok: true });
});

export default adminApi;
