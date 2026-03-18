import pool from "../../../db/pool.js";

export class BankAccountModel {
  // Get all bank accounts
  static async getAllAccounts() {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM acc_bank_accounts 
         WHERE is_active = 1 
         ORDER BY account_name ASC`,
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      return { success: false, error: error.message };
    }
  }

  // Get account by ID
  static async getAccountById(id) {
    try {
      const [rows] = await pool.execute(`SELECT * FROM acc_bank_accounts WHERE id = ?`, [id]);
      return { success: true, account: rows[0] || null };
    } catch (error) {
      console.error("Error fetching bank account:", error);
      return { success: false, error: error.message };
    }
  }

  // Create bank account
  static async createAccount(data) {
    try {
      const { account_name, account_number, bank_name, branch_name, ifsc_code, account_type, opening_balance, notes } = data;

      const [result] = await pool.execute(
        `INSERT INTO acc_bank_accounts 
        (account_name, account_number, bank_name, branch_name, ifsc_code, 
         account_type, opening_balance, current_balance, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [account_name, account_number, bank_name, branch_name || null, ifsc_code || null, account_type || "current", opening_balance || 0, opening_balance || 0, notes || null],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating bank account:", error);
      return { success: false, error: error.message };
    }
  }

  // Update bank account
  static async updateAccount(id, data) {
    try {
      const { account_name, account_number, bank_name, branch_name, ifsc_code, account_type, is_active, notes } = data;

      await pool.execute(
        `UPDATE acc_bank_accounts 
        SET account_name = ?, account_number = ?, bank_name = ?, branch_name = ?,
            ifsc_code = ?, account_type = ?, is_active = ?, notes = ?
        WHERE id = ?`,
        [account_name, account_number, bank_name, branch_name || null, ifsc_code || null, account_type, is_active !== undefined ? is_active : 1, notes || null, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating bank account:", error);
      return { success: false, error: error.message };
    }
  }

  // Update account balance
  static async updateBalance(id, newBalance) {
    try {
      await pool.execute(`UPDATE acc_bank_accounts SET current_balance = ? WHERE id = ?`, [newBalance, id]);
      return { success: true };
    } catch (error) {
      console.error("Error updating account balance:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete bank account
  static async deleteAccount(id) {
    try {
      await pool.execute(`DELETE FROM acc_bank_accounts WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting bank account:", error);
      return { success: false, error: error.message };
    }
  }

  // Get account summary
  static async getAccountSummary(accountId, startDate, endDate) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          COUNT(*) as transaction_count,
          COALESCE(SUM(debit_amount), 0) as total_debit,
          COALESCE(SUM(credit_amount), 0) as total_credit,
          COALESCE(SUM(credit_amount) - SUM(debit_amount), 0) as net_balance
        FROM acc_transactions
        WHERE bank_account_id = ? 
        AND transaction_date BETWEEN ? AND ?`,
        [accountId, startDate, endDate],
      );
      return { success: true, summary: rows[0] };
    } catch (error) {
      console.error("Error fetching account summary:", error);
      return { success: false, error: error.message };
    }
  }
}
