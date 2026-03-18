import { UserModel } from "../models/UserModel.js";

// In-memory session store (in production, use Redis or database)
const sessions = new Map();

// Session configuration
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Generate session ID
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Clean expired sessions
function cleanExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every hour
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// Attach user to request
export function attachUser(req, res, next) {
  const sessionId = req.cookies?.sessionId;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    req.user = session.user;
  }

  next();
}

// Require authentication
export function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return res.redirect("/login");
  }
  next();
}

// Require specific role
export function requireRole(roles) {
  const roleArray = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
        return res.status(401).json({ error: "Authentication required" });
      }
      return res.redirect("/login");
    }

    if (!roleArray.includes(req.user.role)) {
      if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return res.status(403).render("pages/ops/error", {
        seo: { title: "Access Denied" },
        pageKey: "ops/error",
        title: "Access Denied",
        message: "You do not have permission to access this page.",
        error: { status: 403 },
      });
    }

    next();
  };
}

// Require admin role
export function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

// Require plant manager or admin
export function requirePlantManagerOrAdmin(req, res, next) {
  return requireRole(["plant_manager", "admin"])(req, res, next);
}

// Check if user can access RCC data
export function canAccessRcc(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Admin can access all RCCs
  if (req.user.role === "admin") {
    return next();
  }

  // Plant manager can access all RCCs
  if (req.user.role === "plant_manager") {
    return next();
  }

  // RCC manager can only access their assigned RCC
  if (req.user.role === "rcc_manager" && req.user.rcc_id) {
    return next();
  }

  return res.status(403).json({ error: "Insufficient permissions to access RCC data" });
}

// Login user
export async function loginUser(email, password) {
  try {
    const userResult = await UserModel.getUserByEmail(email);

    if (!userResult.success || !userResult.user) {
      return { success: false, error: "Invalid credentials" };
    }

    const user = userResult.user;
    const isValidPassword = await UserModel.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return { success: false, error: "Invalid credentials" };
    }

    // Create session
    const sessionId = generateSessionId();
    const session = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        rcc_id: user.rcc_id,
        rcc_name: user.rcc_name,
      },
      createdAt: Date.now(),
    };

    sessions.set(sessionId, session);

    return { success: true, sessionId, user: session.user };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: "Login failed" };
  }
}

// Logout user
export function logoutUser(sessionId) {
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
    return true;
  }
  return false;
}

// Get user permissions based on role
export function getUserPermissions(role) {
  const permissions = {
    admin: ["ops.admin", "ops.procurement", "ops.production", "ops.sales", "ops.machinery", "ops.material", "ops.users", "ops.settings"],
    plant_manager: ["ops.procurement", "ops.production", "ops.machinery", "ops.material"],
    rcc_manager: ["ops.procurement"],
  };

  return permissions[role] || [];
}

// Check if user has permission (role-based - for backward compatibility)
export function hasPermission(user, permission) {
  const userPermissions = getUserPermissions(user.role);
  return userPermissions.includes(permission);
}

// Check if user has specific module permission (granular permissions)
export async function hasModulePermission(user, module, subModule, permission) {
  try {
    const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
    const result = await UserPermissionsModel.hasPermission(user.id, module, subModule, permission);
    return result.success && result.hasPermission;
  } catch (error) {
    console.error("Error checking module permission:", error);
    return false;
  }
}

// Check if user can access a module (checks both role and granular permissions)
export async function canAccessModule(user, module) {
  // Admin users can access everything
  if (user.role === "admin") {
    return true;
  }

  // Check if user has any permission for this module
  try {
    const { UserPermissionsModel } = await import("../models/UserPermissionsModel.js");
    const result = await UserPermissionsModel.getUserPermissions(user.id);

    if (result.success && result.permissions) {
      return result.permissions[module] && Object.keys(result.permissions[module]).length > 0;
    }

    return false;
  } catch (error) {
    console.error("Error checking module access:", error);
    return false;
  }
}

// Middleware to check permission
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
        return res.status(401).json({ error: "Authentication required" });
      }
      return res.redirect("/login");
    }

    if (!hasPermission(req.user, permission)) {
      if (req.xhr || req.headers.accept?.indexOf("json") > -1) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return res.status(403).render("pages/ops/error", {
        seo: { title: "Access Denied" },
        pageKey: "ops/error",
        title: "Access Denied",
        message: "You do not have permission to access this page.",
        error: { status: 403 },
      });
    }

    next();
  };
}
