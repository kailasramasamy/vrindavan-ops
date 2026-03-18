import pool from "../../../db/pool.js";

export class ImportLogModel {
  // Get all import logs with filters
  static async getImportLogs(filters = {}) {
    try {
      let query = `
        SELECT 
          il.*,
          ba.account_name as bank_account_name,
          ba.bank_name,
          u.name as imported_by_username
        FROM acc_import_logs il
        LEFT JOIN acc_bank_accounts ba ON il.bank_account_id = ba.id
        LEFT JOIN users u ON il.imported_by = u.id
        WHERE JSON_EXTRACT(COALESCE(il.error_log, '{}'), '$.status') IS NULL
          OR JSON_EXTRACT(COALESCE(il.error_log, '{}'), '$.status') != 'deleted'
      `;

      const params = [];

      // Filter by import type
      if (filters.import_type && filters.import_type !== "") {
        query += ` AND il.import_type = ?`;
        params.push(filters.import_type);
      }

      // Filter by bank account
      if (filters.bank_account_id && filters.bank_account_id !== "") {
        query += ` AND il.bank_account_id = ?`;
        params.push(filters.bank_account_id);
      }

      // Filter by date range
      if (filters.start_date && filters.start_date !== "") {
        query += ` AND DATE(il.imported_at) >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date && filters.end_date !== "") {
        query += ` AND DATE(il.imported_at) <= ?`;
        params.push(filters.end_date);
      }

      // Filter by imported user
      if (filters.imported_by && filters.imported_by !== "") {
        query += ` AND il.imported_by = ?`;
        params.push(filters.imported_by);
      }

      // Pagination - ensure we always have valid integers
      const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? filters.limit : typeof filters.limit === "string" && filters.limit !== "" ? parseInt(filters.limit, 10) : 50;
      const offset = Number.isInteger(filters.offset) && filters.offset >= 0 ? filters.offset : typeof filters.offset === "string" && filters.offset !== "" ? parseInt(filters.offset, 10) : 0;

      // Final validation
      const finalLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
      const finalOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

      // Get total count (use a copy of params for count query)
      const countQuery = query.replace(/SELECT.*FROM/, "SELECT COUNT(*) as total FROM");
      const [countResult] = await pool.execute(countQuery, [...params]);
      const total = countResult[0].total;

      // Add sorting and pagination to main query using string interpolation
      // Note: finalLimit and finalOffset are validated integers, so this is safe from SQL injection
      query += ` ORDER BY il.imported_at DESC LIMIT ${finalLimit} OFFSET ${finalOffset}`;

      const [rows] = await pool.execute(query, params);

      return {
        success: true,
        rows,
        pagination: {
          total,
          limit: finalLimit,
          offset: finalOffset,
          totalPages: Math.ceil(total / finalLimit),
        },
      };
    } catch (error) {
      console.error("Error getting import logs:", error);
      return { success: false, error: error.message };
    }
  }

  // Get import log by ID
  static async getImportLogById(id) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          il.*,
          ba.account_name as bank_account_name,
          ba.bank_name,
          u.name as imported_by_username
        FROM acc_import_logs il
        LEFT JOIN acc_bank_accounts ba ON il.bank_account_id = ba.id
        LEFT JOIN users u ON il.imported_by = u.id
        WHERE il.id = ?`,
        [id],
      );

      if (rows.length === 0) {
        return { success: false, error: "Import log not found" };
      }

      // Parse error_log if it exists
      if (rows[0].error_log) {
        try {
          rows[0].error_log = JSON.parse(rows[0].error_log);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }

      return { success: true, log: rows[0] };
    } catch (error) {
      console.error("Error getting import log:", error);
      return { success: false, error: error.message };
    }
  }

  // Get import statistics
  static async getImportStatistics(filters = {}) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_imports,
          SUM(total_rows) as total_rows_processed,
          SUM(successful_rows) as total_successful,
          SUM(failed_rows) as total_failed,
          import_type
        FROM acc_import_logs
        WHERE 1=1
      `;

      const params = [];

      if (filters.start_date) {
        query += ` AND DATE(imported_at) >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND DATE(imported_at) <= ?`;
        params.push(filters.end_date);
      }

      query += ` GROUP BY import_type`;

      const [rows] = await pool.execute(query, params);

      return { success: true, statistics: rows };
    } catch (error) {
      console.error("Error getting import statistics:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete import log (soft delete - just for cleanup)
  static async deleteImportLog(id) {
    try {
      await pool.execute(`DELETE FROM acc_import_logs WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting import log:", error);
      return { success: false, error: error.message };
    }
  }
}
