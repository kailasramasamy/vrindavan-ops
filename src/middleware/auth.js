// Simple in-memory session + role guard for /ops
import crypto from "crypto";
import pool from "../db/pool.js";
import { verifyPassword } from "../utils/password.js";

const sessions = new Map(); // token -> { id, name, role, scope, exp }
const COOKIE = "ops_sess";
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
}

function parseCookies(req) {
  const header = req.headers["cookie"] || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

export async function loginHandler(req, res) {
  const { identifier = "", password = "" } = req.body || {};
  if (!identifier || !password) return res.status(400).render("pages/ops/auth/login", { seo: { title: "Ops Login" }, error: "Missing credentials" });
  try {
    let user = null;
    if (pool) {
      const [rows] = await pool.query("SELECT * FROM users WHERE (email = ? OR phone = ?) AND is_active = 1 LIMIT 1", [identifier, identifier]);
      user = rows?.[0] || null;
    }
    if (!user) return res.status(401).render("pages/ops/auth/login", { seo: { title: "Ops Login" }, error: "Invalid credentials" });
    const ok = verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).render("pages/ops/auth/login", { seo: { title: "Ops Login" }, error: "Invalid credentials" });
    const token = crypto.randomUUID();
    const scope = { cpp_id: user.cpp_id, rcc_id: user.rcc_id, mp_id: user.mp_id };
    const sessionUser = { id: user.id, name: user.name, role: user.role, scope, exp: Date.now() + SESSION_TTL_MS };
    sessions.set(token, sessionUser);
    setSessionCookie(res, token);
    return res.redirect("/");
  } catch (err) {
    console.error(err);
    return res.status(500).render("pages/ops/auth/login", { seo: { title: "Ops Login" }, error: "Server error" });
  }
}

export function logoutHandler(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  res.redirect("/login");
}

export async function attachUser(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (!token) {
    req.user = null;
    return next();
  }
  const s = sessions.get(token) || null;
  if (!s) {
    req.user = null;
    return next();
  }
  if (s.exp && s.exp < Date.now()) {
    sessions.delete(token);
    req.user = null;
    return next();
  }
  // Sliding expiration: extend session on activity
  s.exp = Date.now() + SESSION_TTL_MS;
  sessions.set(token, s);
  setSessionCookie(res, token);
  const { exp, ...safe } = s;

  // Load user permissions if not admin
  if (safe.role !== "admin") {
    try {
      const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
      const permissionsResult = await UserPermissionsModel.getUserPermissions(safe.id);
      if (permissionsResult.success && permissionsResult.permissions) {
        safe.permissions = permissionsResult.permissions;
      }
    } catch (error) {
      console.error("Error loading user permissions:", error);
    }
  }

  req.user = safe;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect("/login");
    if (!roles.includes(req.user.role)) return res.status(403).send("Forbidden");
    next();
  };
}

// JSON Auth handlers for SPA clients
export async function loginJsonHandler(req, res) {
  const { identifier = "", password = "" } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ ok: false, error: "Missing credentials" });
  try {
    let user = null;
    if (pool) {
      const [rows] = await pool.query('SELECT id, name, email, phone, role, cpp_id, rcc_id, mp_id, password_hash, status FROM users WHERE (email = ? OR phone = ?) AND status = "active" LIMIT 1', [identifier, identifier]);
      user = rows?.[0] || null;
    }
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });
    const ok = verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: "Invalid credentials" });
    const token = crypto.randomUUID();
    const scope = { cpp_id: user.cpp_id, rcc_id: user.rcc_id, mp_id: user.mp_id };
    const safeUser = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, scope };
    sessions.set(token, { ...safeUser, exp: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, token);
    return res.json({ ok: true, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

export function meJsonHandler(req, res) {
  if (!req.user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  return res.json({ ok: true, user: req.user });
}

export function logoutJsonHandler(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return res.json({ ok: true });
}
