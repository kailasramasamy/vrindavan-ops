import pool from "../../../db/pool.js";

export class MachineIssueHistoryModel {
  // Add a history entry
  static async addHistoryEntry(historyData) {
    const { issue_id, field_name, old_value, new_value, changed_by, change_reason } = historyData;

    const sql = `
      INSERT INTO machine_issue_history (
        issue_id, field_name, old_value, new_value, changed_by, change_reason
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [issue_id || null, field_name || null, old_value || null, new_value || null, changed_by || null, change_reason || null]);

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error adding history entry:", error);
      return { success: false, error: error.message };
    }
  }

  // Get history for a specific issue
  static async getIssueHistory(issueId) {
    const sql = `
      SELECT 
        mih.*,
        mi.title as issue_title
      FROM machine_issue_history mih
      LEFT JOIN machine_issues mi ON mih.issue_id = mi.id
      WHERE mih.issue_id = ?
      ORDER BY mih.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [issueId]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching issue history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all history entries
  static async getAllHistory() {
    const sql = `
      SELECT 
        mih.*,
        mi.title as issue_title,
        m.name as machine_name
      FROM machine_issue_history mih
      LEFT JOIN machine_issues mi ON mih.issue_id = mi.id
      LEFT JOIN machines m ON mi.machine_id = m.id
      ORDER BY mih.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching all history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get recent activity (last 30 days)
  static async getRecentActivity() {
    const sql = `
      SELECT 
        mih.*,
        mi.title as issue_title,
        m.name as machine_name
      FROM machine_issue_history mih
      LEFT JOIN machine_issues mi ON mih.issue_id = mi.id
      LEFT JOIN machines m ON mi.machine_id = m.id
      WHERE mih.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY mih.created_at DESC
      LIMIT 50
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      return { success: false, error: error.message };
    }
  }

  // Track field changes (helper method)
  static async trackFieldChange(issueId, fieldName, oldValue, newValue, changedBy, changeReason = null) {
    // Only track if values actually changed
    if (oldValue !== newValue) {
      return await this.addHistoryEntry({
        issue_id: issueId,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        changed_by: changedBy,
        change_reason: changeReason,
      });
    }
    return { success: true };
  }

  // Track status change
  static async trackStatusChange(issueId, oldStatus, newStatus, changedBy, changeReason = null) {
    return await this.trackFieldChange(issueId, "status", oldStatus, newStatus, changedBy, changeReason);
  }

  // Track priority change
  static async trackPriorityChange(issueId, oldPriority, newPriority, changedBy, changeReason = null) {
    return await this.trackFieldChange(issueId, "priority", oldPriority, newPriority, changedBy, changeReason);
  }

  // Track assignment change
  static async trackAssignmentChange(issueId, oldAssignedTo, newAssignedTo, changedBy, changeReason = null) {
    return await this.trackFieldChange(issueId, "assigned_to", oldAssignedTo, newAssignedTo, changedBy, changeReason);
  }

  // Get activity summary for dashboard
  static async getActivitySummary() {
    const sql = `
      SELECT 
        DATE(mih.created_at) as activity_date,
        COUNT(*) as total_changes,
        COUNT(DISTINCT mih.issue_id) as issues_updated,
        COUNT(DISTINCT mih.changed_by) as users_active
      FROM machine_issue_history mih
      WHERE mih.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(mih.created_at)
      ORDER BY activity_date DESC
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching activity summary:", error);
      return { success: false, error: error.message };
    }
  }
}
















