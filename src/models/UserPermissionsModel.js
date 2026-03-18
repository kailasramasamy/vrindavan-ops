import pool from "../db/pool.js";

export class UserPermissionsModel {
  // Get all permissions for a user
  static async getUserPermissions(userId) {
    try {
      const [rows] = await pool.execute(
        `SELECT module, sub_module, permission, granted 
         FROM user_permissions 
         WHERE user_id = ?`,
        [userId],
      );

      // Convert to a more usable format
      const permissions = {};
      rows.forEach((row) => {
        if (!permissions[row.module]) {
          permissions[row.module] = {};
        }
        if (!permissions[row.module][row.sub_module]) {
          permissions[row.module][row.sub_module] = {};
        }
        permissions[row.module][row.sub_module][row.permission] = row.granted;
      });

      return { success: true, permissions };
    } catch (error) {
      console.error("Error getting user permissions:", error);
      return { success: false, error: error.message };
    }
  }

  // Update user permissions
  static async updateUserPermissions(userId, permissions) {
    const connection = await pool.getConnection();
    try {
      // Start transaction
      await connection.beginTransaction();

      // Delete existing permissions for this user
      await connection.execute("DELETE FROM user_permissions WHERE user_id = ?", [userId]);

      // Insert new permissions
      for (const [module, subModules] of Object.entries(permissions)) {
        for (const [subModule, perms] of Object.entries(subModules)) {
          for (const [permission, granted] of Object.entries(perms)) {
            if (granted) {
              await connection.execute(
                `INSERT INTO user_permissions (user_id, module, sub_module, permission, granted) 
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, module, subModule, permission, granted],
              );
            }
          }
        }
      }

      // Commit transaction
      await connection.commit();

      return { success: true };
    } catch (error) {
      // Rollback transaction
      await connection.rollback();
      console.error("Error updating user permissions:", error);
      return { success: false, error: error.message };
    } finally {
      // Always release the connection back to the pool
      connection.release();
    }
  }

  // Get all available modules and sub-modules
  static async getAvailableModules() {
    return {
      procurement: {
        cpp: { name: "Collection Points", description: "Manage CPP operations" },
        rcc: { name: "Regional Collection Centers", description: "Manage RCC operations" },
        mp: { name: "Milk Pool", description: "Manage milk pool operations" },
        dashboard: { name: "Dashboard", description: "View procurement analytics" },
        billing: { name: "Billing", description: "Manage billing and payments" },
      },
      production: {
        products: { name: "Products", description: "Manage product catalog" },
        categories: { name: "Categories", description: "Manage product categories" },
        pools: { name: "Milk Pools", description: "Manage milk pools" },
      },
      material: {
        dashboard: { name: "Material Dashboard", description: "Material management overview" },
        materials: { name: "Materials", description: "Manage materials and items" },
        categories: { name: "Categories", description: "Manage material categories" },
        locations: { name: "Locations", description: "Manage material storage locations" },
        transactions: { name: "Transactions", description: "Material receipts, issues and transfers" },
        reports: { name: "Reports", description: "Material reports and analytics" }
      },
      machinery: {
        machines: { name: "Machines", description: "Manage machinery" },
        schedules: { name: "Service Schedules", description: "Manage service schedules" },
        issues: { name: "Issues", description: "Manage machine issues" },
      },
      admin: {
        users: { name: "User Management", description: "Manage users and roles" },
        settings: { name: "Settings", description: "System settings and configuration" },
      },
    };
  }

  // Check if user has specific permission
  static async hasPermission(userId, module, subModule, permission) {
    try {
      const [rows] = await pool.execute(
        `SELECT granted FROM user_permissions 
         WHERE user_id = ? AND module = ? AND sub_module = ? AND permission = ?`,
        [userId, module, subModule, permission],
      );

      return rows.length > 0 && rows[0].granted;
    } catch (error) {
      console.error("Error checking permission:", error);
      return false;
    }
  }
}
