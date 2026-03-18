import { v4 as uuidv4 } from "uuid";
import pool from "../../../db/pool.js";

export class InvoiceGroupModel {
  // Create a new invoice group
  static async createInvoiceGroup(invoiceData) {
    try {
      const invoiceId = uuidv4();
      const { invoice_number, invoice_date, total_amount, beneficiary_id, remitter_id, description, due_date, created_by } = invoiceData;

      const query = `
        INSERT INTO acc_invoice_groups 
        (id, invoice_number, invoice_date, total_amount, remaining_amount, beneficiary_id, remitter_id, description, due_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        invoiceId,
        invoice_number,
        invoice_date,
        total_amount,
        total_amount, // remaining_amount starts same as total_amount
        beneficiary_id || null,
        remitter_id || null,
        description || null,
        due_date || null,
        created_by || null,
      ];

      const [result] = await pool.execute(query, params);
      return { success: true, invoiceId, insertId: result.insertId };
    } catch (error) {
      console.error("Error creating invoice group:", error);
      return { success: false, error: error.message };
    }
  }

  // Get invoice group by ID
  static async getInvoiceGroupById(invoiceId) {
    try {
      const query = `
        SELECT 
          ig.*,
          b.beneficiary_name,
          b.account_number as beneficiary_account,
          b.pan_number as beneficiary_pan,
          b.gstin as beneficiary_gstin,
          c.category_name,
          r.remitter_name,
          r.account_number as remitter_account,
          u.name as created_by_name
        FROM acc_invoice_groups ig
        LEFT JOIN acc_beneficiaries b ON ig.beneficiary_id = b.id
        LEFT JOIN acc_categories c ON b.category_id = c.id
        LEFT JOIN acc_remitters r ON ig.remitter_id = r.id
        LEFT JOIN users u ON ig.created_by = u.id
        WHERE ig.id = ?
      `;

      const [rows] = await pool.execute(query, [invoiceId]);
      return { success: true, invoice: rows[0] || null };
    } catch (error) {
      console.error("Error fetching invoice group:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all invoice groups with filters
  static async getInvoiceGroups(filters = {}) {
    try {
      let query = `
        SELECT 
          ig.*,
          b.beneficiary_name,
          r.remitter_name,
          u.name as created_by_name,
          COUNT(it.transaction_id) as transaction_count,
          GROUP_CONCAT(DISTINCT COALESCE(b2.beneficiary_name, r2.remitter_name) SEPARATOR ', ') as all_beneficiaries_remitters,
          COUNT(DISTINCT COALESCE(b2.beneficiary_name, r2.remitter_name)) as unique_count
        FROM acc_invoice_groups ig
        LEFT JOIN acc_beneficiaries b ON ig.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON ig.remitter_id = r.id
        LEFT JOIN users u ON ig.created_by = u.id
        LEFT JOIN acc_invoice_transactions it ON ig.id = it.invoice_id
        LEFT JOIN acc_transactions t ON it.transaction_id = t.id
        LEFT JOIN acc_beneficiaries b2 ON t.beneficiary_id = b2.id
        LEFT JOIN acc_remitters r2 ON t.remitter_id = r2.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.status) {
        query += ` AND ig.status = ?`;
        params.push(filters.status);
      }

      if (filters.beneficiary_id) {
        query += ` AND ig.beneficiary_id = ?`;
        params.push(filters.beneficiary_id);
      }

      if (filters.remitter_id) {
        query += ` AND ig.remitter_id = ?`;
        params.push(filters.remitter_id);
      }

      if (filters.start_date) {
        query += ` AND ig.invoice_date >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND ig.invoice_date <= ?`;
        params.push(filters.end_date);
      }

      query += ` GROUP BY ig.id ORDER BY ig.created_at DESC`;

      if (filters.limit) {
        query += ` LIMIT ${parseInt(filters.limit)}`;
      }

      if (filters.offset) {
        query += ` OFFSET ${parseInt(filters.offset)}`;
      }

      const [rows] = await pool.execute(query, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching invoice groups:", error);
      return { success: false, error: error.message };
    }
  }

  // Add transaction to invoice group
  static async addTransactionToInvoice(invoiceId, transactionId, amount) {
    try {
      const query = `
        INSERT INTO acc_invoice_transactions (invoice_id, transaction_id, amount)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE amount = VALUES(amount)
      `;

      const params = [invoiceId, transactionId, amount];
      const [result] = await pool.execute(query, params);

      // Update transaction's invoice_id
      await pool.execute("UPDATE acc_transactions SET invoice_id = ? WHERE id = ?", [invoiceId, transactionId]);

      // Manually update invoice group amounts (in case triggers don't exist)
      await this.updateInvoiceGroupAmounts(invoiceId);

      return { success: true, insertId: result.insertId };
    } catch (error) {
      console.error("Error adding transaction to invoice:", error);
      return { success: false, error: error.message };
    }
  }

  // Remove transaction from invoice group
  static async removeTransactionFromInvoice(invoiceId, transactionId) {
    try {
      const query = `DELETE FROM acc_invoice_transactions WHERE invoice_id = ? AND transaction_id = ?`;
      const params = [invoiceId, transactionId];
      const [result] = await pool.execute(query, params);

      // Clear transaction's invoice_id
      await pool.execute("UPDATE acc_transactions SET invoice_id = NULL WHERE id = ?", [transactionId]);

      // Manually update invoice group amounts (in case triggers don't exist)
      await this.updateInvoiceGroupAmounts(invoiceId);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error removing transaction from invoice:", error);
      return { success: false, error: error.message };
    }
  }

  // Update invoice group amounts based on associated transactions
  static async updateInvoiceGroupAmounts(invoiceId) {
    try {
      const query = `
        UPDATE acc_invoice_groups 
        SET paid_amount = (
          SELECT COALESCE(SUM(amount), 0) 
          FROM acc_invoice_transactions 
          WHERE invoice_id = ?
        ),
        remaining_amount = total_amount - (
          SELECT COALESCE(SUM(amount), 0) 
          FROM acc_invoice_transactions 
          WHERE invoice_id = ?
        ),
        status = CASE 
          WHEN total_amount - (
            SELECT COALESCE(SUM(amount), 0) 
            FROM acc_invoice_transactions 
            WHERE invoice_id = ?
          ) <= 0 THEN 'paid'
          WHEN (
            SELECT COALESCE(SUM(amount), 0) 
            FROM acc_invoice_transactions 
            WHERE invoice_id = ?
          ) > 0 THEN 'partial'
          ELSE 'pending'
        END
        WHERE id = ?
      `;

      await pool.execute(query, [invoiceId, invoiceId, invoiceId, invoiceId, invoiceId]);
      return { success: true };
    } catch (error) {
      console.error("Error updating invoice group amounts:", error);
      return { success: false, error: error.message };
    }
  }

  // Get transactions for an invoice group
  static async getInvoiceTransactions(invoiceId) {
    try {
      const query = `
        SELECT 
          t.*,
          b.beneficiary_name,
          r.remitter_name,
          c.category_name,
          it.amount as invoice_amount
        FROM acc_invoice_transactions it
        JOIN acc_transactions t ON it.transaction_id = t.id
        LEFT JOIN acc_beneficiaries b ON t.beneficiary_id = b.id
        LEFT JOIN acc_remitters r ON t.remitter_id = r.id
        LEFT JOIN acc_categories c ON t.category_id = c.id
        WHERE it.invoice_id = ?
        ORDER BY t.transaction_date DESC
      `;

      const [rows] = await pool.execute(query, [invoiceId]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching invoice transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Update invoice group
  static async updateInvoiceGroup(invoiceId, updateData) {
    try {
      const allowedFields = ["invoice_number", "invoice_date", "total_amount", "beneficiary_id", "remitter_id", "description", "due_date"];

      const updates = [];
      const params = [];

      Object.keys(updateData).forEach((key) => {
        if (allowedFields.includes(key) && updateData[key] !== undefined) {
          updates.push(`${key} = ?`);
          params.push(updateData[key]);
        }
      });

      if (updates.length === 0) {
        return { success: false, error: "No valid fields to update" };
      }

      // Recalculate remaining amount if total_amount is being updated
      if (updateData.total_amount !== undefined) {
        const paidAmountQuery = `
          SELECT COALESCE(SUM(amount), 0) as paid_amount 
          FROM acc_invoice_transactions 
          WHERE invoice_id = ?
        `;
        const [paidResult] = await pool.execute(paidAmountQuery, [invoiceId]);
        const paidAmount = paidResult[0].paid_amount;

        updates.push("remaining_amount = ?");
        params.push(updateData.total_amount - paidAmount);
      }

      params.push(invoiceId);

      const query = `UPDATE acc_invoice_groups SET ${updates.join(", ")} WHERE id = ?`;
      const [result] = await pool.execute(query, params);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating invoice group:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete invoice group
  static async deleteInvoiceGroup(invoiceId) {
    try {
      // Start transaction
      await pool.execute("START TRANSACTION");

      try {
        // Remove all transaction associations
        await pool.execute("UPDATE acc_transactions SET invoice_id = NULL WHERE invoice_id = ?", [invoiceId]);

        // Delete invoice transactions
        await pool.execute("DELETE FROM acc_invoice_transactions WHERE invoice_id = ?", [invoiceId]);

        // Delete invoice group
        const [result] = await pool.execute("DELETE FROM acc_invoice_groups WHERE id = ?", [invoiceId]);

        await pool.execute("COMMIT");
        return { success: true, affectedRows: result.affectedRows };
      } catch (error) {
        await pool.execute("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("Error deleting invoice group:", error);
      return { success: false, error: error.message };
    }
  }

  // Get invoice statistics
  static async getInvoiceStatistics() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_invoices,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_invoices,
          SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial_invoices,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_invoices,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_invoices,
          SUM(total_amount) as total_invoice_amount,
          SUM(paid_amount) as total_paid_amount,
          SUM(remaining_amount) as total_remaining_amount
        FROM acc_invoice_groups
      `;

      const [rows] = await pool.execute(query);
      return { success: true, stats: rows[0] };
    } catch (error) {
      console.error("Error fetching invoice statistics:", error);
      return { success: false, error: error.message };
    }
  }

  // Mark all transactions in an invoice as having uploaded invoices
  static async markInvoiceTransactionsAsUploaded(invoiceId) {
    try {
      const query = `
        UPDATE acc_transactions 
        SET invoice_url = CONCAT('invoice_', ?, '_', id, '.pdf')
        WHERE invoice_id = ?
      `;

      const [result] = await pool.execute(query, [invoiceId, invoiceId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error marking transactions as uploaded:", error);
      return { success: false, error: error.message };
    }
  }

  // Update all transactions in an invoice group with the same invoice URL
  static async updateInvoiceGroupTransactions(invoiceId, invoiceUrl) {
    try {
      // Update the invoice group with the invoice URL
      const groupQuery = `
        UPDATE acc_invoice_groups 
        SET invoice_url = ?
        WHERE id = ?
      `;

      const [groupResult] = await pool.execute(groupQuery, [invoiceUrl, invoiceId]);
      
      // Clear invoice_url from individual transactions in the group
      // since the invoice is now stored at the group level
      const transactionQuery = `
        UPDATE acc_transactions 
        SET invoice_url = NULL
        WHERE invoice_id = ?
      `;

      const [transactionResult] = await pool.execute(transactionQuery, [invoiceId]);
      
      return { 
        success: true, 
        groupUpdated: groupResult.affectedRows > 0,
        transactionsCleared: transactionResult.affectedRows 
      };
    } catch (error) {
      console.error("Error updating invoice group transactions:", error);
      return { success: false, error: error.message };
    }
  }

  // Clear invoice file from invoice group
  static async clearInvoiceGroupFile(invoiceId) {
    try {
      // Clear the invoice_url from the invoice group
      const query = `
        UPDATE acc_invoice_groups 
        SET invoice_url = NULL
        WHERE id = ?
      `;

      const [result] = await pool.execute(query, [invoiceId]);
      
      return { 
        success: true, 
        affectedRows: result.affectedRows 
      };
    } catch (error) {
      console.error("Error clearing invoice group file:", error);
      return { success: false, error: error.message };
    }
  }

  // Update invoice group details
  static async updateInvoiceGroup(invoiceId, updateData) {
    try {
      const query = `
        UPDATE acc_invoice_groups 
        SET invoice_number = ?, 
            invoice_date = ?, 
            due_date = ?, 
            description = ?, 
            beneficiary_id = ?, 
            remitter_id = ?,
            total_amount = ?,
            remaining_amount = ? - paid_amount,
            status = CASE 
                WHEN (? - paid_amount) <= 0 THEN 'paid'
                WHEN paid_amount > 0 THEN 'partial'
                ELSE 'pending'
            END,
            updated_at = NOW()
        WHERE id = ?
      `;

      const params = [
        updateData.invoice_number,
        updateData.invoice_date,
        updateData.due_date,
        updateData.description,
        updateData.beneficiary_id,
        updateData.remitter_id,
        updateData.total_amount,
        updateData.total_amount,
        updateData.total_amount,
        invoiceId
      ];

      const [result] = await pool.execute(query, params);

      if (result.affectedRows > 0) {
        // Get the updated invoice group
        const updatedInvoice = await this.getInvoiceGroupById(invoiceId);
        return { 
          success: true, 
          affectedRows: result.affectedRows,
          invoiceGroup: updatedInvoice.success ? updatedInvoice.invoice : null
        };
      } else {
        return { success: false, error: "Invoice group not found" };
      }
    } catch (error) {
      console.error("Error updating invoice group:", error);
      return { success: false, error: error.message };
    }
  }

  // Recalculate all invoice group amounts (for fixing existing data)
  static async recalculateAllInvoiceGroupAmounts() {
    try {
      const query = `
        UPDATE acc_invoice_groups ig
        SET paid_amount = (
          SELECT COALESCE(SUM(it.amount), 0) 
          FROM acc_invoice_transactions it 
          WHERE it.invoice_id = ig.id
        ),
        remaining_amount = ig.total_amount - (
          SELECT COALESCE(SUM(it.amount), 0) 
          FROM acc_invoice_transactions it 
          WHERE it.invoice_id = ig.id
        ),
        status = CASE 
          WHEN ig.total_amount - (
            SELECT COALESCE(SUM(it.amount), 0) 
            FROM acc_invoice_transactions it 
            WHERE it.invoice_id = ig.id
          ) <= 0 THEN 'paid'
          WHEN (
            SELECT COALESCE(SUM(it.amount), 0) 
            FROM acc_invoice_transactions it 
            WHERE it.invoice_id = ig.id
          ) > 0 THEN 'partial'
          ELSE 'pending'
        END
      `;

      const [result] = await pool.execute(query);
      return { 
        success: true, 
        affectedRows: result.affectedRows,
        message: `Updated amounts for ${result.affectedRows} invoice groups`
      };
    } catch (error) {
      console.error("Error recalculating invoice group amounts:", error);
      return { success: false, error: error.message };
    }
  }
}
