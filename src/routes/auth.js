import express from "express";
import { AuthController } from "../controllers/AuthController.js";
import { requireAdmin } from "../middleware/rbac.js";

const auth = express.Router();

// Login routes
auth.get("/login", AuthController.getLogin);
auth.post("/login", AuthController.postLogin);
auth.post("/logout", AuthController.postLogout);

// Test route
auth.get("/test", (req, res) => {
  res.send("Auth routes working!");
});

// User management routes (admin only)
auth.get("/admin/users", requireAdmin, AuthController.getUsers);
// User permissions page (must be before /:id route)
auth.get("/admin/users/permissions", requireAdmin, AuthController.getUserPermissionsPage);
// Get available modules for permissions
auth.get("/admin/users/modules", requireAdmin, AuthController.getAvailableModules);
// Specific routes (must be before generic /:id routes)
auth.put("/admin/users/:id/role-rcc", requireAdmin, AuthController.updateUserRoleAndRcc);
auth.put("/admin/users/:id/permissions", requireAdmin, AuthController.updatePermissions);
auth.put("/admin/users/:id/password", requireAdmin, AuthController.changePassword);
// Generic routes (must be after specific routes)
auth.get("/admin/users/:id", requireAdmin, AuthController.getUser);
auth.post("/admin/users", requireAdmin, AuthController.createUser);
auth.put("/admin/users/:id", requireAdmin, AuthController.updateUser);
auth.delete("/admin/users/:id", requireAdmin, AuthController.deleteUser);

export default auth;
