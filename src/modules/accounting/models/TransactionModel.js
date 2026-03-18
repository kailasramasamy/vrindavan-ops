import pool from "../../../db/pool.js";

export class TransactionModel {
  // Get all transactions with filters
  static async getTransactions(filters = {}) {
    try {
      let query = `
        SELECT 
          t.*,
          b.beneficiary_name,
          b.alias as beneficiary_alias,
          b.account_number as beneficiary_account,
          b.invoice_required as beneficiary_invoice_required,
          r.remitter_name,
          r.alias as remitter_alias,
          r.account_number as remitter_account,
          c.category_name,
          c.color_code,
          ba.account_name as bank_account_name,
          ig.invoice_number,
          CASE 
            WHEN t.invoice_id IS NOT NULL THEN 
              (SELECT CASE WHEN ig.invoice_url IS NOT NULL AND ig.invoice_url != '' THEN 1 ELSE 0 END 
               FROM acc_invoice_groups ig 
               WHERE ig.id = t.invoice_id)
            ELSE 0
          END as invoice_group_has_invoice
        FROM acc_transactions t
        LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON t.remitter_id = r.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
        LEFT JOIN acc_invoice_groups ig ON t.invoice_id = ig.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.bank_account_id) {
        query += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
      }

      if (filters.start_date) {
        query += ` AND t.transaction_date >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND t.transaction_date <= ?`;
        params.push(filters.end_date);
      }

      if (filters.category_id) {
        query += ` AND t.category_id = ?`;
        params.push(filters.category_id);
      }

      if (filters.beneficiary_id) {
        query += ` AND t.beneficiary_id = ?`;
        params.push(filters.beneficiary_id);
      }

      if (filters.remitter_id) {
        query += ` AND t.remitter_id = ?`;
        params.push(filters.remitter_id);
      }

      if (filters.is_matched !== undefined) {
        query += ` AND t.is_matched = ?`;
        params.push(filters.is_matched);
      }

      if (filters.transaction_type) {
        if (filters.transaction_type === "debit") {
          query += ` AND t.debit_amount > 0`;
        } else if (filters.transaction_type === "credit") {
          query += ` AND t.credit_amount > 0`;
        }
      }

      // Search filter - searches across description, narration, beneficiary, remitter, category
      if (filters.search) {
        query += ` AND (
          t.description LIKE ? OR 
          t.narration LIKE ? OR 
          b.beneficiary_name LIKE ? OR 
          b.alias LIKE ? OR 
          r.remitter_name LIKE ? OR 
          r.alias LIKE ? OR 
          c.category_name LIKE ? OR
          t.transaction_id LIKE ? OR
          t.payment_mode LIKE ? OR
          CAST(t.debit_amount AS CHAR) LIKE ? OR
          CAST(t.credit_amount AS CHAR) LIKE ?
        )`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      query += ` ORDER BY t.transaction_date DESC, t.id DESC`;

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM acc_transactions t
        LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON t.remitter_id = r.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
        WHERE 1=1
      `;

      // Add the same WHERE conditions for count query
      if (filters.bank_account_id) {
        countQuery += ` AND t.bank_account_id = ?`;
      }
      if (filters.start_date) {
        countQuery += ` AND t.transaction_date >= ?`;
      }
      if (filters.end_date) {
        countQuery += ` AND t.transaction_date <= ?`;
      }
      if (filters.category_id) {
        countQuery += ` AND t.category_id = ?`;
      }
      if (filters.beneficiary_id) {
        countQuery += ` AND t.beneficiary_id = ?`;
      }
      if (filters.remitter_id) {
        countQuery += ` AND t.remitter_id = ?`;
      }
      if (filters.is_matched !== undefined) {
        countQuery += ` AND t.is_matched = ?`;
      }
      if (filters.transaction_type) {
        if (filters.transaction_type === "debit") {
          countQuery += ` AND t.debit_amount > 0`;
        } else if (filters.transaction_type === "credit") {
          countQuery += ` AND t.credit_amount > 0`;
        }
      }
      if (filters.search) {
        countQuery += ` AND (
          t.description LIKE ? OR 
          t.narration LIKE ? OR 
          b.beneficiary_name LIKE ? OR 
          b.alias LIKE ? OR 
          r.remitter_name LIKE ? OR 
          r.alias LIKE ? OR 
          c.category_name LIKE ? OR
          t.transaction_id LIKE ? OR
          t.payment_mode LIKE ? OR
          CAST(t.debit_amount AS CHAR) LIKE ? OR
          CAST(t.credit_amount AS CHAR) LIKE ?
        )`;
      }

      const [countResult] = await pool.execute(countQuery, params);
      const totalCount = countResult[0]?.total || 0;

      // Apply pagination
      if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
        if (filters.offset) {
          query += ` OFFSET ${parseInt(filters.offset)}`;
        }
      }

      const [rows] = await pool.execute(query, params);
      return { success: true, rows, totalCount };
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transaction by ID
  static async getTransactionById(id) {
    try {
      const [rows] = await pool.execute(
        `SELECT t.*, 
         b.beneficiary_name, 
         r.remitter_name,
         c.category_name, 
         ba.account_name
         FROM acc_transactions t
         LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
         LEFT JOIN acc_remitters r ON t.remitter_id = r.id
         LEFT JOIN acc_categories c ON t.category_id = c.id
         LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
         WHERE t.id = ?`,
        [id],
      );
      return { success: true, transaction: rows[0] || null };
    } catch (error) {
      console.error("Error fetching transaction:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transactions by import batch ID
  static async getTransactionsByBatchId(importBatchId) {
    try {
      const [rows] = await pool.execute(
        `SELECT t.*, 
         b.beneficiary_name, 
         b.alias as beneficiary_alias,
         r.remitter_name,
         r.alias as remitter_alias,
         c.category_name,
         c.color_code,
         ba.account_name as bank_account_name
         FROM acc_transactions t
         LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
         LEFT JOIN acc_remitters r ON t.remitter_id = r.id
         LEFT JOIN acc_categories c ON t.category_id = c.id
         LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
         WHERE t.import_batch_id = ?
         ORDER BY t.transaction_date DESC, t.id DESC`,
        [importBatchId],
      );
      return { success: true, transactions: rows };
    } catch (error) {
      console.error("Error fetching transactions by batch ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Get incomplete transactions (missing narration, beneficiary/remitter, or category)
  static async getIncompleteTransactions(filters = {}) {
    try {
      let query = `
        SELECT t.*, 
         b.beneficiary_name, 
         b.alias as beneficiary_alias,
         r.remitter_name,
         r.alias as remitter_alias,
         c.category_name,
         c.color_code,
         ba.account_name as bank_account_name
         FROM acc_transactions t
         LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
         LEFT JOIN acc_remitters r ON t.remitter_id = r.id
         LEFT JOIN acc_categories c ON t.category_id = c.id
         LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
         WHERE (
           t.narration IS NULL OR t.narration = '' OR
           (t.debit_amount > 0 AND t.beneficiary_id IS NULL) OR
           (t.credit_amount > 0 AND t.remitter_id IS NULL) OR
           t.category_id IS NULL
         )
      `;

      const params = [];

      // Apply optional filters
      if (filters.bank_account_id) {
        query += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
      }

      if (filters.start_date) {
        query += ` AND DATE(t.transaction_date) >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND DATE(t.transaction_date) <= ?`;
        params.push(filters.end_date);
      }

      // Limit results
      const limit = parseInt(filters.limit, 10) || 100;
      query += ` ORDER BY t.transaction_date DESC, t.id DESC LIMIT ${limit}`;

      const [rows] = await pool.execute(query, params);
      return { success: true, transactions: rows };
    } catch (error) {
      console.error("Error fetching incomplete transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Get count of missing mandatory invoices (properly handles invoice groups)
  static async getMissingMandatoryInvoicesCount(filters = {}) {
    try {
      // Count individual transactions that require invoices but are not in any invoice group
      let ungroupedCountQuery = `
        SELECT COUNT(*) as count
        FROM acc_transactions t
        INNER JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        WHERE t.debit_amount > 0 
          AND b.invoice_required = 1
          AND (t.invoice_url IS NULL OR t.invoice_url = '')
          AND t.invoice_id IS NULL
      `;

      // Count invoice groups that require invoices but don't have any uploaded
      let groupedCountQuery = `
        SELECT COUNT(DISTINCT ig.id) as count
        FROM acc_invoice_groups ig
        INNER JOIN acc_invoice_transactions it ON ig.id = it.invoice_id
        INNER JOIN acc_transactions t ON it.transaction_id = t.id
        INNER JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        WHERE t.debit_amount > 0 
          AND b.invoice_required = 1
          AND (ig.invoice_url IS NULL OR ig.invoice_url = '')
      `;

      const params = [];
      const groupedParams = [];

      // Apply optional filters to both queries
      if (filters.bank_account_id) {
        ungroupedCountQuery += ` AND t.bank_account_id = ?`;
        groupedCountQuery += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
        groupedParams.push(filters.bank_account_id);
      }

      if (filters.start_date) {
        ungroupedCountQuery += ` AND DATE(t.transaction_date) >= ?`;
        groupedCountQuery += ` AND DATE(t.transaction_date) >= ?`;
        params.push(filters.start_date);
        groupedParams.push(filters.start_date);
      }

      if (filters.end_date) {
        ungroupedCountQuery += ` AND DATE(t.transaction_date) <= ?`;
        groupedCountQuery += ` AND DATE(t.transaction_date) <= ?`;
        params.push(filters.end_date);
        groupedParams.push(filters.end_date);
      }

      if (filters.beneficiary_id) {
        ungroupedCountQuery += ` AND t.beneficiary_id = ?`;
        groupedCountQuery += ` AND t.beneficiary_id = ?`;
        params.push(filters.beneficiary_id);
        groupedParams.push(filters.beneficiary_id);
      }

      // Execute both queries
      const [ungroupedResult] = await pool.execute(ungroupedCountQuery, params);
      const [groupedResult] = await pool.execute(groupedCountQuery, groupedParams);

      const totalCount = (ungroupedResult[0].count || 0) + (groupedResult[0].count || 0);

      return { success: true, count: totalCount };
    } catch (error) {
      console.error("Error counting missing mandatory invoices:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transactions with missing mandatory invoices (grouped by invoice groups)
  static async getTransactionsWithMissingMandatoryInvoices(filters = {}) {
    try {
      // First, get transactions that are NOT in any invoice group and missing invoices
      let ungroupedQuery = `
        SELECT t.*, 
         b.beneficiary_name, 
         b.alias as beneficiary_alias,
         b.invoice_required,
         c.category_name,
         c.color_code,
         ba.account_name as bank_account_name,
         NULL as invoice_group_id,
         NULL as invoice_number
         FROM acc_transactions t
         INNER JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
         LEFT JOIN acc_categories c ON t.category_id = c.id
         LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
         WHERE t.debit_amount > 0 
           AND b.invoice_required = 1
           AND (t.invoice_url IS NULL OR t.invoice_url = '')
           AND t.invoice_id IS NULL
      `;

      // Second, get invoice groups that have missing invoices (at least one transaction without invoice)
      let groupedQuery = `
        SELECT 
          ig.id as invoice_group_id,
          ig.invoice_number,
          ig.total_amount,
          ig.paid_amount,
          ig.remaining_amount,
          ig.status as invoice_status,
          ig.created_at as invoice_created_at,
          COUNT(t.id) as transaction_count,
          GROUP_CONCAT(t.id ORDER BY t.transaction_date DESC) as transaction_ids,
          GROUP_CONCAT(t.transaction_date ORDER BY t.transaction_date DESC) as transaction_dates,
          GROUP_CONCAT(t.description ORDER BY t.transaction_date DESC SEPARATOR ' | ') as descriptions,
          SUM(t.debit_amount) as total_debit,
          MAX(b.beneficiary_name) as beneficiary_name,
          MAX(b.alias) as beneficiary_alias,
          MAX(b.invoice_required) as invoice_required,
          MAX(c.category_name) as category_name,
          MAX(c.color_code) as color_code,
          MAX(ba.account_name) as bank_account_name
        FROM acc_invoice_groups ig
        INNER JOIN acc_invoice_transactions it ON ig.id = it.invoice_id
        INNER JOIN acc_transactions t ON it.transaction_id = t.id
        INNER JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
        WHERE t.debit_amount > 0 
          AND b.invoice_required = 1
          AND (ig.invoice_url IS NULL OR ig.invoice_url = '')
      `;

      const params = [];
      const groupedParams = [];

      // Apply optional filters to both queries
      if (filters.bank_account_id) {
        ungroupedQuery += ` AND t.bank_account_id = ?`;
        groupedQuery += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
        groupedParams.push(filters.bank_account_id);
      }

      if (filters.start_date) {
        ungroupedQuery += ` AND DATE(t.transaction_date) >= ?`;
        groupedQuery += ` AND DATE(t.transaction_date) >= ?`;
        params.push(filters.start_date);
        groupedParams.push(filters.start_date);
      }

      if (filters.end_date) {
        ungroupedQuery += ` AND DATE(t.transaction_date) <= ?`;
        groupedQuery += ` AND DATE(t.transaction_date) <= ?`;
        params.push(filters.end_date);
        groupedParams.push(filters.end_date);
      }

      if (filters.beneficiary_id) {
        ungroupedQuery += ` AND t.beneficiary_id = ?`;
        groupedQuery += ` AND t.beneficiary_id = ?`;
        params.push(filters.beneficiary_id);
        groupedParams.push(filters.beneficiary_id);
      }

      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        ungroupedQuery += ` AND (t.description LIKE ? OR b.beneficiary_name LIKE ? OR b.alias LIKE ? OR t.id LIKE ?)`;
        groupedQuery += ` AND (t.description LIKE ? OR b.beneficiary_name LIKE ? OR b.alias LIKE ? OR t.id LIKE ?)`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        groupedParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      // Add ORDER BY and LIMIT
      const limit = parseInt(filters.limit, 10) || 100;
      ungroupedQuery += ` ORDER BY t.transaction_date DESC, t.id DESC LIMIT ${limit}`;
      groupedQuery += ` GROUP BY ig.id ORDER BY ig.created_at DESC LIMIT ${limit}`;

      // Execute both queries
      const [ungroupedRows] = await pool.execute(ungroupedQuery, params);
      const [groupedRows] = await pool.execute(groupedQuery, groupedParams);

      // Combine results
      const allResults = [...ungroupedRows, ...groupedRows];

      return { success: true, transactions: allResults };
    } catch (error) {
      console.error("Error fetching transactions with missing mandatory invoices:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete transactions by import batch ID
  static async deleteTransactionsByBatchId(importBatchId, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get count before deletion
      const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM acc_transactions WHERE import_batch_id = ?`, [importBatchId]);
      const deletedCount = countResult[0].count;

      if (deletedCount === 0) {
        await connection.rollback();
        return { success: false, error: "No transactions found with this batch ID" };
      }

      // Delete transactions
      await connection.execute(`DELETE FROM acc_transactions WHERE import_batch_id = ?`, [importBatchId]);

      // Update import log to mark as deleted
      await connection.execute(
        `UPDATE acc_import_logs 
         SET error_log = JSON_MERGE_PATCH(
           COALESCE(error_log, '{}'),
           JSON_OBJECT('deleted_at', NOW(), 'deleted_by', ?, 'status', 'deleted')
         )
         WHERE import_batch_id = ?`,
        [userId, importBatchId],
      );

      await connection.commit();
      return { success: true, deletedCount };
    } catch (error) {
      await connection.rollback();
      console.error("Error deleting transactions by batch ID:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Get recent imports for deletion
  static async getRecentImports(limit = 5) {
    try {
      // Validate limit as integer
      const validLimit = Number.isInteger(limit) && limit > 0 ? limit : 5;

      const [rows] = await pool.execute(
        `SELECT 
          il.id,
          il.import_batch_id,
          il.file_name,
          il.imported_at,
          il.successful_rows,
          ba.account_name as bank_account_name,
          ba.bank_name,
          u.name as imported_by_name,
          (SELECT COUNT(*) FROM acc_transactions WHERE import_batch_id = il.import_batch_id) as current_transaction_count
         FROM acc_import_logs il
         LEFT JOIN acc_bank_accounts ba ON il.bank_account_id = ba.id
         LEFT JOIN users u ON il.imported_by = u.id
         WHERE il.import_type = 'bank_statement'
           AND JSON_EXTRACT(COALESCE(il.error_log, '{}'), '$.status') IS NULL
         ORDER BY il.imported_at DESC
         LIMIT ${validLimit}`,
      );
      return { success: true, imports: rows };
    } catch (error) {
      console.error("Error fetching recent imports:", error);
      return { success: false, error: error.message };
    }
  }

  // Create transaction
  static async createTransaction(data) {
    try {
      const { bank_account_id, transaction_date, transaction_id, description, narration, debit_amount, credit_amount, balance, beneficiary_id, category_id, payment_mode, notes } = data;

      const [result] = await pool.execute(
        `INSERT INTO acc_transactions 
        (bank_account_id, transaction_date, transaction_id, description, narration, debit_amount, 
         credit_amount, balance, beneficiary_id, category_id, payment_mode, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bank_account_id, transaction_date, transaction_id || null, description || null, narration || null, debit_amount || 0, credit_amount || 0, balance || null, beneficiary_id || null, category_id || null, payment_mode || "Other", notes || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating transaction:", error);
      return { success: false, error: error.message };
    }
  }

  // Update transaction
  static async updateTransaction(id, data) {
    try {
      // Build dynamic UPDATE query based on provided fields
      const updates = [];
      const values = [];

      const fieldMapping = {
        transaction_date: "transaction_date",
        transaction_id: "transaction_id",
        description: "description",
        narration: "narration",
        debit_amount: "debit_amount",
        credit_amount: "credit_amount",
        balance: "balance",
        beneficiary_id: "beneficiary_id",
        remitter_id: "remitter_id",
        category_id: "category_id",
        payment_mode: "payment_mode",
        is_matched: "is_matched",
        is_reconciled: "is_reconciled",
        notes: "notes",
        invoice_url: "invoice_url",
      };

      Object.keys(data).forEach((key) => {
        if (fieldMapping[key]) {
          updates.push(`${fieldMapping[key]} = ?`);

          // Handle specific field types
          if (key === "debit_amount" || key === "credit_amount") {
            values.push(data[key] !== undefined ? data[key] : 0);
          } else if (key === "is_matched" || key === "is_reconciled") {
            values.push(data[key] !== undefined ? data[key] : false);
          } else {
            values.push(data[key] !== undefined ? data[key] : null);
          }
        }
      });

      if (updates.length === 0) {
        return { success: false, error: "No fields to update" };
      }

      values.push(id);

      const query = `UPDATE acc_transactions SET ${updates.join(", ")} WHERE id = ?`;
      await pool.execute(query, values);

      return { success: true };
    } catch (error) {
      console.error("Error updating transaction:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete transaction
  static async deleteTransaction(id) {
    try {
      await pool.execute(`DELETE FROM acc_transactions WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting transaction:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk import transactions
  static async bulkImportTransactions(transactions, importBatchId, userId, fileName = null, filePath = null, bankAccountId = null) {
    const connection = await pool.getConnection();
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      await connection.beginTransaction();

      for (const txn of transactions) {
        try {
          await connection.execute(
            `INSERT INTO acc_transactions 
            (bank_account_id, transaction_date, transaction_id, description, narration,
             debit_amount, credit_amount, balance, beneficiary_id, remitter_id, category_id, is_matched, 
             payment_mode, notes, import_batch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              description = VALUES(description),
              narration = VALUES(narration),
              debit_amount = VALUES(debit_amount),
              credit_amount = VALUES(credit_amount),
              balance = VALUES(balance),
              beneficiary_id = VALUES(beneficiary_id),
              remitter_id = VALUES(remitter_id),
              category_id = VALUES(category_id),
              is_matched = VALUES(is_matched)`,
            [txn.bank_account_id, txn.transaction_date, txn.transaction_id || null, txn.description || null, txn.narration || null, txn.debit_amount || 0, txn.credit_amount || 0, txn.balance || null, txn.beneficiary_id || null, txn.remitter_id || null, txn.category_id || null, txn.is_matched || false, txn.payment_mode || "Other", txn.notes || null, importBatchId],
          );
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`Date: ${txn.transaction_date}, Desc: ${txn.description?.substring(0, 50)} - ${err.message}`);
        }
      }

      // Log import
      await connection.execute(
        `INSERT INTO acc_import_logs 
        (import_type, bank_account_id, file_name, file_path, import_batch_id, total_rows, successful_rows, failed_rows, error_log, imported_by)
        VALUES ('bank_statement', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bankAccountId, fileName, filePath, importBatchId, transactions.length, successCount, failCount, errors.length > 0 ? JSON.stringify(errors) : null, userId],
      );

      await connection.commit();
      return { success: true, imported: successCount, failed: failCount, errors };
    } catch (error) {
      await connection.rollback();
      console.error("Error bulk importing transactions:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Get unmatched transactions
  static async getUnmatchedTransactions(bankAccountId = null) {
    try {
      let query = `
        SELECT t.*, ba.account_name
        FROM acc_transactions t
        JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
        WHERE t.is_matched = 0 AND t.debit_amount > 0
      `;

      const params = [];

      if (bankAccountId) {
        query += ` AND t.bank_account_id = ?`;
        params.push(bankAccountId);
      }

      query += ` ORDER BY t.transaction_date DESC LIMIT 100`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching unmatched transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Auto-match transactions to beneficiaries
  static async autoMatchTransactions(bankAccountId = null) {
    try {
      // This would implement matching logic using account numbers and narration patterns
      // For now, return a basic implementation
      let matched = 0;

      const unmatchedResult = await this.getUnmatchedTransactions(bankAccountId);
      const { BeneficiaryModel } = await import("./BeneficiaryModel.js");

      for (const txn of unmatchedResult.rows || []) {
        // Try to match by account number in description
        const accountMatch = txn.description?.match(/\d{10,18}/); // Indian account numbers
        if (accountMatch) {
          const benResult = await BeneficiaryModel.findByAccountNumber(accountMatch[0]);
          if (benResult.success && benResult.beneficiary) {
            await pool.execute(
              `UPDATE acc_transactions 
               SET beneficiary_id = ?, is_matched = 1, category_id = ?
               WHERE id = ?`,
              [benResult.beneficiary.id, benResult.beneficiary.category_id, txn.id],
            );
            matched++;
            continue;
          }
        }

        // Try to match by beneficiary name in description
        if (txn.description) {
          const benResult = await BeneficiaryModel.findByName(txn.description);
          if (benResult.success && benResult.rows && benResult.rows.length > 0) {
            const ben = benResult.rows[0];
            await pool.execute(
              `UPDATE acc_transactions 
               SET beneficiary_id = ?, is_matched = 1, category_id = ?
               WHERE id = ?`,
              [ben.id, ben.category_id, txn.id],
            );
            matched++;
          }
        }
      }

      return { success: true, matched };
    } catch (error) {
      console.error("Error auto-matching transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transaction summary
  static async getTransactionSummary(filters = {}) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(t.debit_amount), 0) as total_debit,
          COALESCE(SUM(t.credit_amount), 0) as total_credit,
          COALESCE(SUM(t.credit_amount) - SUM(t.debit_amount), 0) as net_balance,
          COUNT(CASE WHEN t.is_matched = 1 THEN 1 END) as matched_count,
          COUNT(CASE WHEN t.is_matched = 0 THEN 1 END) as unmatched_count
        FROM acc_transactions t
        LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON t.remitter_id = r.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.bank_account_id) {
        query += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
      }

      if (filters.start_date) {
        query += ` AND t.transaction_date >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND t.transaction_date <= ?`;
        params.push(filters.end_date);
      }

      if (filters.category_id) {
        query += ` AND t.category_id = ?`;
        params.push(filters.category_id);
      }

      if (filters.beneficiary_id) {
        query += ` AND t.beneficiary_id = ?`;
        params.push(filters.beneficiary_id);
      }

      if (filters.remitter_id) {
        query += ` AND t.remitter_id = ?`;
        params.push(filters.remitter_id);
      }

      if (filters.is_matched !== undefined) {
        query += ` AND t.is_matched = ?`;
        params.push(filters.is_matched);
      }

      if (filters.transaction_type) {
        if (filters.transaction_type === "debit") {
          query += ` AND t.debit_amount > 0`;
        } else if (filters.transaction_type === "credit") {
          query += ` AND t.credit_amount > 0`;
        }
      }

      // Search filter - same as getTransactions
      if (filters.search) {
        query += ` AND (
          t.description LIKE ? OR 
          t.narration LIKE ? OR 
          b.beneficiary_name LIKE ? OR 
          b.alias LIKE ? OR 
          r.remitter_name LIKE ? OR 
          r.alias LIKE ? OR 
          c.category_name LIKE ? OR
          t.transaction_id LIKE ? OR
          t.payment_mode LIKE ? OR
          CAST(t.debit_amount AS CHAR) LIKE ? OR
          CAST(t.credit_amount AS CHAR) LIKE ?
        )`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
      }

      const [rows] = await pool.execute(query, params);
      return { success: true, summary: rows[0] };
    } catch (error) {
      console.error("Error fetching transaction summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get category-wise summary
  static async getCategoryWiseSummary(startDate, endDate, bankAccountId = null) {
    try {
      let query = `
        SELECT 
          c.id,
          c.category_name,
          c.category_code,
          c.color_code,
          COUNT(t.id) as transaction_count,
          COALESCE(SUM(t.debit_amount), 0) as total_debit,
          COALESCE(SUM(t.credit_amount), 0) as total_credit
        FROM acc_categories c
        LEFT JOIN acc_transactions t ON c.id = t.category_id 
          AND t.transaction_date BETWEEN ? AND ?
      `;

      const params = [startDate, endDate];

      if (bankAccountId) {
        query += ` AND t.bank_account_id = ?`;
        params.push(bankAccountId);
      }

      query += ` GROUP BY c.id ORDER BY total_debit DESC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching category-wise summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get beneficiary-wise summary
  static async getBeneficiaryWiseSummary(startDate, endDate, bankAccountId = null) {
    try {
      let query = `
        SELECT 
          b.id,
          b.beneficiary_name,
          b.alias,
          c.category_name,
          c.color_code,
          COUNT(t.id) as transaction_count,
          COALESCE(SUM(t.debit_amount), 0) as total_paid,
          MAX(t.transaction_date) as last_payment_date
        FROM acc_beneficiaries b
        INNER JOIN acc_transactions t ON b.id = t.beneficiary_id
        LEFT JOIN acc_categories c ON b.category_id = c.id
        WHERE t.transaction_date BETWEEN ? AND ?
      `;

      const params = [startDate, endDate];

      if (bankAccountId) {
        query += ` AND t.bank_account_id = ?`;
        params.push(bankAccountId);
      }

      query += ` GROUP BY b.id ORDER BY total_paid DESC LIMIT 20`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching beneficiary-wise summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get daily trends
  static async getDailyTrends(startDate, endDate, bankAccountId = null) {
    try {
      let query = `
        SELECT 
          DATE(transaction_date) as date,
          COALESCE(SUM(debit_amount), 0) as total_debit,
          COALESCE(SUM(credit_amount), 0) as total_credit,
          COUNT(*) as transaction_count
        FROM acc_transactions
        WHERE transaction_date BETWEEN ? AND ?
      `;

      const params = [startDate, endDate];

      if (bankAccountId) {
        query += ` AND bank_account_id = ?`;
        params.push(bankAccountId);
      }

      query += ` GROUP BY DATE(transaction_date) ORDER BY date ASC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching daily trends:", error);
      return { success: false, error: error.message };
    }
  }

  // Get monthly trends - shows all available data
  static async getMonthlyTrends() {
    try {
      const query = `
        SELECT 
          YEAR(transaction_date) as year,
          MONTH(transaction_date) as month_num,
          DATE_FORMAT(MIN(transaction_date), '%Y-%m-01') as month,
          COALESCE(SUM(debit_amount), 0) as total_debit,
          COALESCE(SUM(credit_amount), 0) as total_credit,
          COUNT(*) as transaction_count
        FROM acc_transactions
        GROUP BY YEAR(transaction_date), MONTH(transaction_date)
        ORDER BY year DESC, month_num DESC
        LIMIT 24
      `;

      const [rows] = await pool.execute(query);
      // Reverse to show oldest first
      return { success: true, rows: rows.reverse() };
    } catch (error) {
      console.error("Error fetching monthly trends:", error);
      return { success: false, error: error.message };
    }
  }

  // Get past transactions with narrations for auto-fill
  static async getPastTransactionsWithNarrations(bankAccountId = null) {
    try {
      let query = `
        SELECT 
          beneficiary_id,
          remitter_id,
          description,
          narration,
          category_id,
          payment_mode,
          debit_amount,
          credit_amount,
          transaction_date
        FROM (
          SELECT 
            t.*,
            ROW_NUMBER() OVER (
              PARTITION BY 
                CASE WHEN t.debit_amount > 0 THEN t.beneficiary_id ELSE t.remitter_id END,
                t.narration
              ORDER BY t.transaction_date DESC
            ) as rn
          FROM acc_transactions t
          WHERE t.narration IS NOT NULL 
            AND t.narration != ''
            ${bankAccountId ? "AND t.bank_account_id = ?" : ""}
        ) ranked
        WHERE rn = 1
        ORDER BY transaction_date DESC
        LIMIT 500
      `;

      const params = bankAccountId ? [bankAccountId] : [];

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching past transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Get monthly summary data for reports
  static async getMonthlySummary(startDate, endDate, bankAccountId = null) {
    try {
      let query = `
        SELECT 
          DATE_FORMAT(transaction_date, '%Y-%m') as month,
          COUNT(*) as transaction_count,
          COALESCE(SUM(debit_amount), 0) as total_debit,
          COALESCE(SUM(credit_amount), 0) as total_credit
        FROM acc_transactions
        WHERE transaction_date >= ? AND transaction_date <= ?
      `;

      const params = [startDate, endDate];

      if (bankAccountId) {
        query += ` AND bank_account_id = ?`;
        params.push(bankAccountId);
      }

      query += `
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
        ORDER BY month DESC
      `;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching monthly summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transactions with invoices for download
  static async getTransactionsWithInvoices(filters = {}) {
    try {
      let query = `
        SELECT 
          t.*,
          b.beneficiary_name,
          r.remitter_name,
          c.category_name,
          ba.account_name as bank_account_name
        FROM acc_transactions t
        LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON t.remitter_id = r.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        LEFT JOIN acc_bank_accounts ba ON t.bank_account_id = ba.id
        WHERE t.invoice_url IS NOT NULL AND t.invoice_url != ''
      `;

      const params = [];

      if (filters.start_date) {
        query += ` AND t.transaction_date >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND t.transaction_date <= ?`;
        params.push(filters.end_date);
      }

      if (filters.category_id) {
        query += ` AND t.category_id = ?`;
        params.push(filters.category_id);
      }

      if (filters.bank_account_id) {
        query += ` AND t.bank_account_id = ?`;
        params.push(filters.bank_account_id);
      }

      query += ` ORDER BY t.transaction_date DESC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching transactions with invoices:", error);
      return { success: false, error: error.message };
    }
  }
}
