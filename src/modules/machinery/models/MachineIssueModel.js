import pool from "../../../db/pool.js";

export class MachineIssueModel {
  // Create a new issue
  static async createIssue(issueData) {
    const { machine_id, issue_type, title, description, priority = "medium", status = "open", reported_by, assigned_to, estimated_resolution_date, resolution_notes } = issueData;

    const sql = `
      INSERT INTO machine_issues (
        machine_id, issue_type, title, description, priority, status,
        reported_by, assigned_to, estimated_resolution_date, resolution_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id || null, issue_type || null, title || null, description || null, priority || "medium", status || "open", reported_by || null, assigned_to || null, estimated_resolution_date || null, resolution_notes || null]);

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating issue:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all issues for a specific machine
  static async getIssuesByMachine(machineId) {
    const sql = `
      SELECT 
        mi.*,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      WHERE mi.machine_id = ?
      ORDER BY mi.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(machineId)]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching machine issues:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all issues across all machines
  static async getAllIssues() {
    const sql = `
      SELECT 
        mi.*,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      ORDER BY mi.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching all issues:", error);
      return { success: false, error: error.message };
    }
  }

  // Get issues by status
  static async getIssuesByStatus(status) {
    const sql = `
      SELECT 
        mi.*,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      WHERE mi.status = ?
      ORDER BY 
        CASE mi.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        mi.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [status]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching issues by status:", error);
      return { success: false, error: error.message };
    }
  }

  // Get pending issues (open + in_progress)
  static async getPendingIssues() {
    const sql = `
      SELECT 
        mi.*,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      WHERE mi.status IN ('open', 'in_progress')
      ORDER BY 
        CASE mi.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        mi.created_at DESC
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching pending issues:", error);
      return { success: false, error: error.message };
    }
  }

  // Get issue by ID
  static async getIssueById(issueId) {
    const sql = `
      SELECT 
        mi.*,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      WHERE mi.id = ?
    `;

    try {
      const [rows] = await pool.execute(sql, [issueId]);
      return { success: true, rows: rows[0] };
    } catch (error) {
      console.error("Error fetching issue by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Update issue
  static async updateIssue(issueId, updateData) {
    // Build dynamic SQL query based on provided fields
    const fields = [];
    const values = [];

    if (updateData.issue_type !== undefined) {
      fields.push("issue_type = ?");
      values.push(updateData.issue_type);
    }
    if (updateData.title !== undefined) {
      fields.push("title = ?");
      values.push(updateData.title);
    }
    if (updateData.description !== undefined) {
      fields.push("description = ?");
      values.push(updateData.description);
    }
    if (updateData.priority !== undefined) {
      fields.push("priority = ?");
      values.push(updateData.priority);
    }
    if (updateData.status !== undefined) {
      fields.push("status = ?");
      values.push(updateData.status);
    }
    if (updateData.assigned_to !== undefined) {
      fields.push("assigned_to = ?");
      values.push(updateData.assigned_to === "" ? null : updateData.assigned_to);
    }
    if (updateData.estimated_resolution_date !== undefined) {
      fields.push("estimated_resolution_date = ?");
      values.push(updateData.estimated_resolution_date === "" ? null : updateData.estimated_resolution_date);
    }
    if (updateData.actual_resolution_date !== undefined) {
      fields.push("actual_resolution_date = ?");
      values.push(updateData.actual_resolution_date === "" ? null : updateData.actual_resolution_date);
    }
    if (updateData.resolution_notes !== undefined) {
      fields.push("resolution_notes = ?");
      values.push(updateData.resolution_notes);
    }

    // Always update the updated_at timestamp
    fields.push("updated_at = CURRENT_TIMESTAMP");

    if (fields.length === 1) {
      // Only updated_at field
      return { success: true, affectedRows: 0 };
    }

    const sql = `UPDATE machine_issues SET ${fields.join(", ")} WHERE id = ?`;
    values.push(issueId);

    try {
      const [result] = await pool.execute(sql, values);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating issue:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete issue
  static async deleteIssue(issueId) {
    const sql = `DELETE FROM machine_issues WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [issueId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting issue:", error);
      return { success: false, error: error.message };
    }
  }

  // Get issue statistics
  static async getIssueStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_issues,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_issues,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_issues,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_issues,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_issues,
        SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) as critical_issues,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority_issues
      FROM machine_issues
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows: rows[0] };
    } catch (error) {
      console.error("Error fetching issue stats:", error);
      return { success: false, error: error.message };
    }
  }

  // Get issues count by machine
  static async getIssuesCountByMachine() {
    const sql = `
      SELECT 
        m.id,
        m.name as machine_name,
        m.model as machine_model,
        COUNT(mi.id) as total_issues,
        SUM(CASE WHEN mi.status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as pending_issues,
        SUM(CASE WHEN mi.priority = 'critical' AND mi.status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as critical_issues
      FROM machines m
      LEFT JOIN machine_issues mi ON m.id = mi.machine_id
      GROUP BY m.id, m.name, m.model
      ORDER BY pending_issues DESC, critical_issues DESC
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching issues count by machine:", error);
      return { success: false, error: error.message };
    }
  }

  // Get active issues for dashboard
  static async getActiveIssuesDashboard(limit = 5) {
    const limitInt = Number(limit) || 5;
    const sql = `
      SELECT 
        mi.id,
        mi.title,
        mi.description,
        mi.priority,
        mi.status,
        mi.created_at,
        mi.estimated_resolution_date,
        mi.assigned_to,
        m.id as machine_id,
        m.name as machine_name,
        m.model as machine_model,
        m.location as machine_location,
        m.images as machine_images,
        mc.name as category_name,
        mc.color as category_color
      FROM machine_issues mi
      LEFT JOIN machines m ON mi.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      WHERE mi.status IN ('open', 'in_progress')
      ORDER BY 
        CASE mi.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        mi.created_at DESC
      LIMIT ${limitInt}
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching active issues for dashboard:", error);
      return { success: false, error: error.message };
    }
  }
}
