import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pool from "../db/pool.js";
import { verifyPassword as customVerifyPassword } from "../utils/password.js";

dotenv.config();

export class UserModel {
  // Create a new user
  static async createUser(userData) {
    const { email, password, name, role = "user", rcc_id = null, is_active = true } = userData;

    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const [result] = await pool.execute(
        `INSERT INTO users (email, password_hash, password_salt, name, role, rcc_id, is_active, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [email, hashedPassword, "salt", name, role, rcc_id, is_active],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating user:", error);
      return { success: false, error: error.message };
    }
  }

  // Get user by email
  static async getUserByEmail(email) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT u.*, '' as rcc_name 
         FROM users u 
         WHERE u.email = ? AND u.is_active = true`,
        [email],
      );

      return { success: true, user: rows[0] || null };
    } catch (error) {
      console.error("Error getting user by email:", error);
      return { success: false, error: error.message };
    }
  }

  // Get user by ID
  static async getUserById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT u.*, r.name as rcc_name 
         FROM users u 
         LEFT JOIN rcc r ON u.rcc_id = r.id 
         WHERE u.id = ? AND u.is_active = true`,
        [id],
      );

      return { success: true, user: rows[0] || null };
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      // Check if it's a bcrypt hash (starts with $2a$, $2b$, or $2y$)
      if (hashedPassword && hashedPassword.match(/^\$2[aby]\$/)) {
        return await bcrypt.compare(plainPassword, hashedPassword);
      }
      // Try custom password verification for PBKDF2 format
      if (hashedPassword && hashedPassword.includes("$")) {
        return customVerifyPassword(plainPassword, hashedPassword);
      }
      // Fallback to bcrypt for other formats
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error("Error verifying password:", error);
      return false;
    }
  }

  // Get all users
  static async getAllUsers() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT u.*, r.name as rcc_name 
         FROM users u 
         LEFT JOIN rcc r ON u.rcc_id = r.id 
         ORDER BY u.created_at DESC`,
      );

      return { success: true, users: rows };
    } catch (error) {
      console.error("Error getting all users:", error);
      return { success: false, error: error.message };
    }
  }

  // Update user
  static async updateUser(id, userData) {
    const { email, name, role, rcc_id, is_active } = userData;

    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute(
        `UPDATE users 
         SET email = ?, name = ?, role = ?, rcc_id = ?, is_active = ?, updated_at = NOW() 
         WHERE id = ?`,
        [email, name, role, rcc_id, is_active, id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating user:", error);
      return { success: false, error: error.message };
    }
  }

  // Update user role and RCC assignment
  static async updateUserRoleAndRcc(id, role, rcc_id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute(
        `UPDATE users 
         SET role = ?, rcc_id = ?, updated_at = NOW() 
         WHERE id = ?`,
        [role, rcc_id, id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating user role and RCC:", error);
      return { success: false, error: error.message };
    }
  }

  // Update user password
  static async updatePassword(id, newPassword) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      const [result] = await pool.execute(
        `UPDATE users 
         SET password_hash = ?, updated_at = NOW() 
         WHERE id = ?`,
        [hashedPassword, id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating password:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete user (soft delete)
  static async deleteUser(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute(
        `UPDATE users 
         SET is_active = false, updated_at = NOW() 
         WHERE id = ?`,
        [id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting user:", error);
      return { success: false, error: error.message };
    }
  }

  // Get users by role
  static async getUsersByRole(role) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT u.*, r.name as rcc_name 
         FROM users u 
         LEFT JOIN rcc r ON u.rcc_id = r.id 
         WHERE u.role = ? AND u.is_active = true 
         ORDER BY u.name`,
        [role],
      );

      return { success: true, users: rows };
    } catch (error) {
      console.error("Error getting users by role:", error);
      return { success: false, error: error.message };
    }
  }

  // Get users by RCC
  static async getUsersByRcc(rcc_id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT u.*, r.name as rcc_name 
         FROM users u 
         LEFT JOIN rcc r ON u.rcc_id = r.id 
         WHERE u.rcc_id = ? AND u.is_active = true 
         ORDER BY u.name`,
        [rcc_id],
      );

      return { success: true, users: rows };
    } catch (error) {
      console.error("Error getting users by RCC:", error);
      return { success: false, error: error.message };
    }
  }
}
