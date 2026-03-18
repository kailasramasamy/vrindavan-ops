import pool from "../config/database.js";

export const auditLog = async (req, action, entityType, entityId, oldValues = null, newValues = null) => {
  try {
    const userId = req.user?.id || null;
    const userRole = req.user?.role || null;
    const ipAddress = req.ip || req.connection.remoteAddress;

    await pool.execute(
      `INSERT INTO cp_audit_logs (user_id, user_role, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userRole,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
      ]
    );
  } catch (error) {
    console.error("Audit log error:", error);
    // Don't throw - audit logging should not break the main flow
  }
};

