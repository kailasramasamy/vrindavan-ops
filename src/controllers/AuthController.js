import pool from "../db/pool.js";
import { loginUser, logoutUser } from "../middleware/rbac.js";
import { UserModel } from "../models/UserModel.js";
import { UserPermissionsModel } from "../models/UserPermissionsModel.js";
import { buildSEO } from "../utils/seo.js";

export class AuthController {
  // Show login page
  static async getLogin(req, res) {
    const seo = buildSEO({ title: "Login - Operations", url: req.path });

    res.render("pages/ops/auth/login", {
      seo,
      pageKey: "ops/auth/login",
      title: "Login",
      error: null,
    });
  }

  // Handle login
  static async postLogin(req, res) {
    const { identifier, email, password } = req.body;
    const loginEmail = identifier || email;

    try {
      const result = await loginUser(loginEmail, password);

      if (result.success) {
        // Set session cookie
        res.cookie("sessionId", result.sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: "/",
        });

        // Redirect based on role
        if (result.user.role === "admin") {
          return res.redirect("/");
        } else if (result.user.role === "plant_manager") {
          return res.redirect("/");
        } else if (result.user.role === "rcc_manager") {
          return res.redirect("/procurement");
        } else {
          return res.redirect("/");
        }
      } else {
        const seo = buildSEO({ title: "Login - Operations", url: req.path });
        return res.render("pages/ops/auth/login", {
          seo,
          pageKey: "ops/auth/login",
          title: "Login",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Login error:", error);
      const seo = buildSEO({ title: "Login - Operations", url: req.path });
      return res.render("pages/ops/auth/login", {
        seo,
        pageKey: "ops/auth/login",
        title: "Login",
        error: "Login failed. Please try again.",
      });
    }
  }

  // Handle logout
  static async postLogout(req, res) {
    const sessionId = req.cookies.sessionId;

    if (sessionId) {
      logoutUser(sessionId);
    }

    res.clearCookie("sessionId");
    res.redirect("/login");
  }

  // Show user management page
  static async getUsers(req, res) {
    try {
      const usersResult = await UserModel.getAllUsers();

      // Get RCCs from the database directly
      const rccsResult = await pool.execute("SELECT id, name FROM rcc ORDER BY name");

      const seo = buildSEO({ title: "User Management", url: req.path });

      res.render("pages/ops/admin/users", {
        seo,
        pageKey: "ops/admin/users",
        title: "User Management",
        users: usersResult.success ? usersResult.users : [],
        rccs: rccsResult[0] || [],
        currentUser: req.user,
        user: req.user,
      });
    } catch (error) {
      console.error("Error loading users:", error);
      res.status(500).render("pages/ops/error", {
        seo: buildSEO({ title: "Error", url: req.path }),
        pageKey: "ops/error",
        title: "Error",
        message: "Failed to load users.",
        error: { status: 500 },
      });
    }
  }

  // Return single user as JSON
  static async getUser(req, res) {
    try {
      const { id } = req.params;
      const result = await UserModel.getUserById(id);

      if (result.success) {
        // Get user permissions
        const permissionsResult = await UserPermissionsModel.getUserPermissions(id);
        const permissions = permissionsResult.success ? permissionsResult.permissions : {};

        // Get available modules for the UI
        const availableModules = await UserPermissionsModel.getAvailableModules();

        return res.json({
          success: true,
          user: result.user,
          permissions,
          availableModules,
        });
      } else {
        return res.status(404).json({ success: false, error: "User not found" });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ success: false, error: "Failed to fetch user" });
    }
  }

  // Create new user
  static async createUser(req, res) {
    try {
      const { email, password, name, role = "rcc_manager", rcc_id } = req.body;

      const result = await UserModel.createUser({
        email,
        password,
        name,
        role,
        rcc_id: rcc_id || null,
      });

      if (result.success) {
        res.json({ success: true, message: "User created successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ success: false, error: "Failed to create user" });
    }
  }

  // Update user
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { email, name, role, rcc_id, is_active } = req.body;

      const result = await UserModel.updateUser(id, {
        email,
        name,
        role,
        rcc_id: rcc_id || null,
        is_active: is_active === "true" || is_active === true,
      });

      if (result.success) {
        res.json({ success: true, message: "User updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ success: false, error: "Failed to update user" });
    }
  }

  // Delete user
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;

      const result = await UserModel.deleteUser(id);

      if (result.success) {
        res.json({ success: true, message: "User deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ success: false, error: "Failed to delete user" });
    }
  }

  // Change password
  static async changePassword(req, res) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      const result = await UserModel.updatePassword(id, newPassword);

      if (result.success) {
        res.json({ success: true, message: "Password updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ success: false, error: "Failed to change password" });
    }
  }

  // Update user role and RCC assignment
  static async updateUserRoleAndRcc(req, res) {
    try {
      const { id } = req.params;
      const { role, rcc_id } = req.body;

      const result = await UserModel.updateUserRoleAndRcc(id, role, rcc_id || null);

      if (result.success) {
        res.json({ success: true, message: "User role and RCC updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating user role and RCC:", error);
      res.status(500).json({ success: false, error: "Failed to update user role and RCC" });
    }
  }

  // Update user permissions
  static async updatePermissions(req, res) {
    try {
      const { id } = req.params;
      const { permissions } = req.body;

      const result = await UserPermissionsModel.updateUserPermissions(id, permissions);

      if (result.success) {
        res.json({ success: true, message: "Permissions updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating permissions:", error);
      res.status(500).json({ success: false, error: "Failed to update permissions" });
    }
  }

  // Get available modules for permissions
  static async getAvailableModules(req, res) {
    try {
      const modules = await UserPermissionsModel.getAvailableModules();
      res.json({ success: true, modules });
    } catch (error) {
      console.error("Error fetching available modules:", error);
      res.status(500).json({ success: false, error: "Failed to fetch available modules" });
    }
  }

  // Get user permissions page
  static async getUserPermissionsPage(req, res) {
    try {
      const usersResult = await UserModel.getAllUsers();
      const allUsers = usersResult.success ? usersResult.users : [];

      // Exclude admin users from permissions management
      const users = allUsers.filter((user) => user.role !== "admin");

      // Get RCC data for role assignment
      const [rccsResult] = await pool.execute("SELECT id, name FROM rcc ORDER BY name");
      const rccs = rccsResult || [];

      const seo = buildSEO({
        title: "User Permissions - Admin Panel",
        description: "Manage module and sub-module permissions for users",
        keywords: "user permissions, admin, access control, modules",
      });

      res.render("pages/ops/admin/user-permissions", {
        users,
        rccs,
        seo,
        user: req.user,
      });
    } catch (error) {
      console.error("Error loading user permissions page:", error);
      res.status(500).render("pages/ops/error", {
        error: "Failed to load user permissions page",
        user: req.user,
      });
    }
  }
}
