import pool from "../../../db/pool.js";

export class RemitterModel {
  // Get all remitters
  static async getAllRemitters(includeInactive = false, filters = {}) {
    try {
      let query = `
        SELECT 
          r.*,
          c.category_name,
          c.category_code,
          c.color_code,
          COUNT(DISTINCT t.id) as transaction_count,
          COALESCE(SUM(t.credit_amount), 0) as total_received
        FROM acc_remitters r
        LEFT JOIN acc_categories c ON r.category_id = c.id
        LEFT JOIN acc_transactions t ON r.id = t.remitter_id
      `;

      const conditions = [];
      const params = [];

      // Status filter
      if (!includeInactive && !filters.status) {
        conditions.push(`r.status = 'active'`);
      } else if (filters.status) {
        conditions.push(`r.status = ?`);
        params.push(filters.status);
      }

      // Search filter
      if (filters.search) {
        conditions.push(`(r.remitter_name LIKE ? OR r.alias LIKE ? OR r.account_number LIKE ? OR r.pan_number LIKE ? OR r.gstin LIKE ?)`);
        const searchPattern = `%${filters.search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Category filter
      if (filters.category) {
        conditions.push(`r.category_id = ?`);
        params.push(filters.category);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += ` GROUP BY r.id ORDER BY r.remitter_name ASC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching remitters:", error);
      return { success: false, error: error.message };
    }
  }

  // Get remitter by ID
  static async getRemitterById(id) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, 
         DATE_FORMAT(r.activation_date, '%Y-%m-%d') as activation_date,
         c.category_name, c.color_code
         FROM acc_remitters r
         LEFT JOIN acc_categories c ON r.category_id = c.id
         WHERE r.id = ?`,
        [id],
      );
      return { success: true, remitter: rows[0] || null };
    } catch (error) {
      console.error("Error fetching remitter:", error);
      return { success: false, error: error.message };
    }
  }

  // Search remitters
  static async searchRemitters(searchTerm) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, c.category_name, c.color_code
         FROM acc_remitters r
         LEFT JOIN acc_categories c ON r.category_id = c.id
         WHERE (r.remitter_name LIKE ? OR r.alias LIKE ? OR r.account_number LIKE ?)
         AND r.status = 'active'
         ORDER BY r.remitter_name ASC
         LIMIT 50`,
        [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error searching remitters:", error);
      return { success: false, error: error.message };
    }
  }

  // Create remitter
  static async createRemitter(data) {
    try {
      const { remitter_id, remitter_name, alias, account_number, ifsc_code, bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr, category_id, contact_number, email, address, pan_number, gstin, profile_image, status, activation_date, notes } = data;

      const [result] = await pool.execute(
        `INSERT INTO acc_remitters 
        (remitter_id, remitter_name, alias, account_number, ifsc_code, bank_name,
         bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr,
         category_id, contact_number, email, address, pan_number, gstin, profile_image,
         status, activation_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [remitter_id || null, remitter_name, alias || null, account_number || null, ifsc_code || null, bank_name || null, bank_branch || null, bank_city || null, bank_state || null, bank_address || null, bank_contact || null, bank_micr || null, category_id || null, contact_number || null, email || null, address || null, pan_number || null, gstin || null, profile_image || null, status || "active", activation_date || null, notes || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating remitter:", error);
      return { success: false, error: error.message };
    }
  }

  // Update remitter
  static async updateRemitter(id, data) {
    try {
      const { remitter_id, remitter_name, alias, account_number, ifsc_code, bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr, category_id, contact_number, email, address, pan_number, gstin, profile_image, status, activation_date, notes } = data;

      await pool.execute(
        `UPDATE acc_remitters 
        SET remitter_id = ?, remitter_name = ?, alias = ?, account_number = ?,
            ifsc_code = ?, bank_name = ?, bank_branch = ?, bank_city = ?, 
            bank_state = ?, bank_address = ?, bank_contact = ?, bank_micr = ?,
            category_id = ?, contact_number = ?, email = ?, address = ?, 
            pan_number = ?, gstin = ?, profile_image = ?, status = ?, 
            activation_date = ?, notes = ?
        WHERE id = ?`,
        [remitter_id || null, remitter_name, alias || null, account_number || null, ifsc_code || null, bank_name || null, bank_branch || null, bank_city || null, bank_state || null, bank_address || null, bank_contact || null, bank_micr || null, category_id || null, contact_number || null, email || null, address || null, pan_number || null, gstin || null, profile_image || null, status || "active", activation_date || null, notes || null, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating remitter:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete remitter
  static async deleteRemitter(id) {
    try {
      await pool.execute(`DELETE FROM acc_remitters WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting remitter:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk import remitters
  static async bulkImportRemitters(remitters, importBatchId, userId) {
    const connection = await pool.getConnection();
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      await connection.beginTransaction();

      for (const rem of remitters) {
        try {
          await connection.execute(
            `INSERT INTO acc_remitters 
            (remitter_id, remitter_name, alias, account_number, ifsc_code, 
             bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr,
             status, activation_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              remitter_name = VALUES(remitter_name),
              account_number = VALUES(account_number),
              ifsc_code = VALUES(ifsc_code),
              bank_name = VALUES(bank_name),
              bank_branch = VALUES(bank_branch),
              bank_city = VALUES(bank_city),
              bank_state = VALUES(bank_state),
              bank_address = VALUES(bank_address),
              bank_contact = VALUES(bank_contact),
              bank_micr = VALUES(bank_micr)`,
            [rem.remitter_id || null, rem.remitter_name, rem.alias || null, rem.account_number || null, rem.ifsc_code || null, rem.bank_name || null, rem.bank_branch || null, rem.bank_city || null, rem.bank_state || null, rem.bank_address || null, rem.bank_contact || null, rem.bank_micr || null, rem.status || "active", rem.activation_date || null],
          );
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`Row: ${rem.remitter_name} - ${err.message}`);
        }
      }

      // Log import
      await connection.execute(
        `INSERT INTO acc_import_logs 
        (import_type, file_name, import_batch_id, total_rows, successful_rows, failed_rows, error_log, imported_by)
        VALUES ('remitter', ?, ?, ?, ?, ?, ?, ?)`,
        ["bulk_import", importBatchId, remitters.length, successCount, failCount, errors.length > 0 ? JSON.stringify(errors) : null, userId],
      );

      await connection.commit();
      return { success: true, imported: successCount, failed: failCount, errors };
    } catch (error) {
      await connection.rollback();
      console.error("Error bulk importing remitters:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Find remitter by account number
  static async findByAccountNumber(accountNumber) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM acc_remitters WHERE account_number = ? LIMIT 1`, [accountNumber]);
      return { success: true, remitter: rows[0] || null };
    } catch (error) {
      console.error("Error finding remitter by account:", error);
      return { success: false, error: error.message };
    }
  }

  // Find remitter by name (fuzzy match)
  static async findByName(name) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM acc_remitters 
         WHERE remitter_name LIKE ? OR alias LIKE ?
         ORDER BY 
           CASE 
             WHEN remitter_name = ? THEN 1
             WHEN alias = ? THEN 2
             ELSE 3
           END
         LIMIT 5`,
        [`%${name}%`, `%${name}%`, name, name],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error finding remitter by name:", error);
      return { success: false, error: error.message };
    }
  }
}

















