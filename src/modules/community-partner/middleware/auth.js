import crypto from "crypto";
import pool from "../config/database.js";

// Session-based authentication (similar to OPS module)
const sessions = new Map(); // token -> { id, email, role, cp_id, exp }
const COOKIE = "cp_sess";
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
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

// Optional auth middleware - attaches user if session exists, but doesn't require it
export const attachUser = (req, res, next) => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];

  if (!token) {
    req.user = null;
    return next();
  }

  const session = sessions.get(token);
  if (!session || Date.now() > session.exp) {
    if (session) sessions.delete(token);
    req.user = null;
    return next();
  }

  req.user = {
    id: session.id,
    email: session.email,
    role: session.role,
    cp_id: session.cp_id,
  };
  next();
};

// Session-based authentication middleware
export const requireAuth = (req, res, next) => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];

  if (!token) {
    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // Preserve the original URL for redirect after login
    const returnUrl = encodeURIComponent(req.originalUrl || req.url);
    return res.redirect(`/cp/login?returnUrl=${returnUrl}`);
  }

  const session = sessions.get(token);
  if (!session || Date.now() > session.exp) {
    if (session) sessions.delete(token);
    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(401).json({ error: "Session expired" });
    }
    // Preserve the original URL for redirect after login
    const returnUrl = encodeURIComponent(req.originalUrl || req.url);
    return res.redirect(`/cp/login?returnUrl=${returnUrl}`);
  }

  req.user = {
    id: session.id,
    email: session.email,
    role: session.role,
    cp_id: session.cp_id,
  };
  next();
};

// Login handler (for form submission)
export async function loginHandler(req, res) {
  const { email = "", password = "" } = req.body || {};
  if (!email || !password) {
    return res.status(400).render("pages/community-partner/portal/login", {
      seo: { title: "Community Partner Login — Vrindavan" },
      pageKey: "community-partner/portal/login",
      promo: false,
      error: "Missing credentials",
      user: null,
    });
  }

  try {
    const [users] = await pool.execute("SELECT id, email, password_hash, role, cp_id, is_active FROM cp_users WHERE email = ?", [email]);

    if (!users.length) {
      return res.status(401).render("pages/community-partner/portal/login", {
        seo: { title: "Community Partner Login — Vrindavan" },
        pageKey: "community-partner/portal/login",
        promo: false,
        error: "Invalid credentials",
        user: null,
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(401).render("pages/community-partner/portal/login", {
        seo: { title: "Community Partner Login — Vrindavan" },
        pageKey: "community-partner/portal/login",
        promo: false,
        error: "Account is inactive",
        user: null,
      });
    }

    const bcrypt = await import("bcryptjs");
    const isValidPassword = await bcrypt.default.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).render("pages/community-partner/portal/login", {
        seo: { title: "Community Partner Login — Vrindavan" },
        pageKey: "community-partner/portal/login",
        promo: false,
        error: "Invalid credentials",
        user: null,
      });
    }

    // Update last login
    await pool.execute("UPDATE cp_users SET last_login = NOW() WHERE id = ?", [user.id]);

    // Create session
    const token = crypto.randomUUID();
    const sessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      cp_id: user.cp_id,
      exp: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(token, sessionUser);
    setSessionCookie(res, token);

    // Check for return URL
    const returnUrl = req.query.returnUrl || req.body.returnUrl;
    
    // Check if CP has seen welcome page (only for CP role, not admin)
    if (user.role === "admin") {
      // If returnUrl is provided and it's an admin route, use it; otherwise go to admin dashboard
      if (returnUrl && returnUrl.startsWith("/cp/admin")) {
        return res.redirect(decodeURIComponent(returnUrl));
      }
      return res.redirect("/cp/admin/dashboard");
    } else {
      // Check if welcome page has been seen
      const [userData] = await pool.execute(
        "SELECT welcome_seen FROM cp_users WHERE id = ?",
        [user.id]
      );
      
      if (userData.length > 0 && !userData[0].welcome_seen) {
        return res.redirect("/cp/welcome");
      }
      
      // If returnUrl is provided and it's a valid CP route, use it; otherwise go to dashboard
      if (returnUrl && returnUrl.startsWith("/cp/") && !returnUrl.startsWith("/cp/login") && !returnUrl.startsWith("/cp/register")) {
        return res.redirect(decodeURIComponent(returnUrl));
      }
      
      return res.redirect("/cp/dashboard");
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).render("pages/community-partner/portal/login", {
      seo: { title: "Community Partner Login — Vrindavan" },
      pageKey: "community-partner/portal/login",
      promo: false,
      error: "Server error",
      user: null,
    });
  }
}

// Logout handler
export function logoutHandler(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie(COOKIE);
  res.redirect("/cp/login");
}

// Clean up expired sessions periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (now > session.exp) {
        sessions.delete(token);
      }
    }
  },
  5 * 60 * 1000,
); // Every 5 minutes

// For API endpoints (backward compatibility)
export const authenticate = requireAuth;

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(403).json({ error: "Admin access required" });
    }
    return res.status(403).redirect("/cp/dashboard");
  }
  next();
};

export const requireCP = (req, res, next) => {
  if (req.user?.role !== "cp") {
    return res.status(403).json({ error: "CP access required" });
  }
  next();
};
