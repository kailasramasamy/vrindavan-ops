import pool from "../../../db/pool.js";

export class BeneficiaryModel {
  // Get all beneficiaries
  static async getAllBeneficiaries(includeInactive = false, filters = {}) {
    try {
      let query = `
        SELECT 
          b.*,
          c.category_name,
          c.category_code,
          c.color_code,
          COUNT(DISTINCT t.id) as transaction_count,
          COALESCE(SUM(t.debit_amount), 0) as total_paid
        FROM acc_beneficiaries b
        LEFT JOIN acc_categories c ON b.category_id = c.id
        LEFT JOIN acc_transactions t ON b.id = t.beneficiary_id
      `;

      const conditions = [];
      const params = [];

      // Status filter
      if (!includeInactive && !filters.status) {
        conditions.push(`b.status = 'active'`);
      } else if (filters.status) {
        conditions.push(`b.status = ?`);
        params.push(filters.status);
      }

      // Search filter
      if (filters.search) {
        conditions.push(`(b.beneficiary_name LIKE ? OR b.alias LIKE ? OR b.account_number LIKE ? OR b.pan_number LIKE ? OR b.gstin LIKE ?)`);
        const searchPattern = `%${filters.search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Category filter
      if (filters.category) {
        conditions.push(`b.category_id = ?`);
        params.push(filters.category);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += ` GROUP BY b.id ORDER BY b.beneficiary_name ASC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching beneficiaries:", error);
      return { success: false, error: error.message };
    }
  }

  // Get beneficiary by ID
  static async getBeneficiaryById(id) {
    try {
      const [rows] = await pool.execute(
        `SELECT b.*, 
         DATE_FORMAT(b.activation_date, '%Y-%m-%d') as activation_date,
         c.category_name, c.color_code
         FROM acc_beneficiaries b
         LEFT JOIN acc_categories c ON b.category_id = c.id
         WHERE b.id = ?`,
        [id],
      );
      return { success: true, beneficiary: rows[0] || null };
    } catch (error) {
      console.error("Error fetching beneficiary:", error);
      return { success: false, error: error.message };
    }
  }

  // Search beneficiaries
  static async searchBeneficiaries(searchTerm) {
    try {
      const [rows] = await pool.execute(
        `SELECT b.*, c.category_name, c.color_code
         FROM acc_beneficiaries b
         LEFT JOIN acc_categories c ON b.category_id = c.id
         WHERE (b.beneficiary_name LIKE ? OR b.alias LIKE ? OR b.account_number LIKE ?)
         AND b.status = 'active'
         ORDER BY b.beneficiary_name ASC
         LIMIT 50`,
        [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error searching beneficiaries:", error);
      return { success: false, error: error.message };
    }
  }

  // Create beneficiary
  static async createBeneficiary(data) {
    try {
      const { beneficiary_id, beneficiary_name, alias, account_number, ifsc_code, bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr, category_id, contact_number, email, address, pan_number, gstin, profile_image, status, activation_date, invoice_required, notes } = data;

      const [result] = await pool.execute(
        `INSERT INTO acc_beneficiaries 
        (beneficiary_id, beneficiary_name, alias, account_number, ifsc_code, bank_name,
         bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr,
         category_id, contact_number, email, address, pan_number, gstin, profile_image,
         status, activation_date, invoice_required, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [beneficiary_id || null, beneficiary_name, alias || null, account_number || null, ifsc_code || null, bank_name || null, bank_branch || null, bank_city || null, bank_state || null, bank_address || null, bank_contact || null, bank_micr || null, category_id || null, contact_number || null, email || null, address || null, pan_number || null, gstin || null, profile_image || null, status || "active", activation_date || null, invoice_required || false, notes || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating beneficiary:", error);
      return { success: false, error: error.message };
    }
  }

  // Update beneficiary
  static async updateBeneficiary(id, data) {
    try {
      const { beneficiary_id, beneficiary_name, alias, account_number, ifsc_code, bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr, category_id, contact_number, email, address, pan_number, gstin, profile_image, status, activation_date, invoice_required, notes } = data;

      await pool.execute(
        `UPDATE acc_beneficiaries 
        SET beneficiary_id = ?, beneficiary_name = ?, alias = ?, account_number = ?,
            ifsc_code = ?, bank_name = ?, bank_branch = ?, bank_city = ?, 
            bank_state = ?, bank_address = ?, bank_contact = ?, bank_micr = ?,
            category_id = ?, contact_number = ?, email = ?, address = ?, 
            pan_number = ?, gstin = ?, profile_image = ?, status = ?, 
            activation_date = ?, invoice_required = ?, notes = ?
        WHERE id = ?`,
        [beneficiary_id || null, beneficiary_name, alias || null, account_number || null, ifsc_code || null, bank_name || null, bank_branch || null, bank_city || null, bank_state || null, bank_address || null, bank_contact || null, bank_micr || null, category_id || null, contact_number || null, email || null, address || null, pan_number || null, gstin || null, profile_image || null, status || "active", activation_date || null, invoice_required || false, notes || null, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating beneficiary:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete beneficiary
  static async deleteBeneficiary(id) {
    try {
      await pool.execute(`DELETE FROM acc_beneficiaries WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting beneficiary:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk import beneficiaries
  static async bulkImportBeneficiaries(beneficiaries, importBatchId, userId) {
    const connection = await pool.getConnection();
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      await connection.beginTransaction();

      for (const ben of beneficiaries) {
        try {
          await connection.execute(
            `INSERT INTO acc_beneficiaries 
            (beneficiary_id, beneficiary_name, alias, account_number, ifsc_code, 
             bank_name, bank_branch, bank_city, bank_state, bank_address, bank_contact, bank_micr,
             status, activation_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
              beneficiary_name = VALUES(beneficiary_name),
              account_number = VALUES(account_number),
              ifsc_code = VALUES(ifsc_code),
              bank_name = VALUES(bank_name),
              bank_branch = VALUES(bank_branch),
              bank_city = VALUES(bank_city),
              bank_state = VALUES(bank_state),
              bank_address = VALUES(bank_address),
              bank_contact = VALUES(bank_contact),
              bank_micr = VALUES(bank_micr)`,
            [ben.beneficiary_id || null, ben.beneficiary_name, ben.alias || null, ben.account_number || null, ben.ifsc_code || null, ben.bank_name || null, ben.bank_branch || null, ben.bank_city || null, ben.bank_state || null, ben.bank_address || null, ben.bank_contact || null, ben.bank_micr || null, ben.status || "active", ben.activation_date || null],
          );
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`Row: ${ben.beneficiary_name} - ${err.message}`);
        }
      }

      // Log import
      await connection.execute(
        `INSERT INTO acc_import_logs 
        (import_type, file_name, import_batch_id, total_rows, successful_rows, failed_rows, error_log, imported_by)
        VALUES ('beneficiary', ?, ?, ?, ?, ?, ?, ?)`,
        ["bulk_import", importBatchId, beneficiaries.length, successCount, failCount, errors.length > 0 ? JSON.stringify(errors) : null, userId],
      );

      await connection.commit();
      return { success: true, imported: successCount, failed: failCount, errors };
    } catch (error) {
      await connection.rollback();
      console.error("Error bulk importing beneficiaries:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Find beneficiary by account number
  static async findByAccountNumber(accountNumber) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM acc_beneficiaries WHERE account_number = ? LIMIT 1`, [accountNumber]);
      return { success: true, beneficiary: rows[0] || null };
    } catch (error) {
      console.error("Error finding beneficiary by account:", error);
      return { success: false, error: error.message };
    }
  }

  // Find beneficiary by name (fuzzy match)
  static async findByName(name) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM acc_beneficiaries 
         WHERE beneficiary_name LIKE ? OR alias LIKE ?
         ORDER BY 
           CASE 
             WHEN beneficiary_name = ? THEN 1
             WHEN alias = ? THEN 2
             ELSE 3
           END
         LIMIT 5`,
        [`%${name}%`, `%${name}%`, name, name],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error finding beneficiary by name:", error);
      return { success: false, error: error.message };
    }
  }
}
