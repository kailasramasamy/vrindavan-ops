import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeeLoanRepaymentModel {
  static get db() {
    return opsDb;
  }

  static async listRepaymentsByLoanId(loanId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_loan_repayments WHERE loan_id = ? ORDER BY repayment_date DESC, id DESC",
        [loanId],
      );
      return { success: true, repayments: rows || [] };
    } catch (error) {
      console.error("EmployeeLoanRepaymentModel.listRepaymentsByLoanId error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getRepaymentById(repaymentId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        "SELECT * FROM employee_loan_repayments WHERE id = ?",
        [repaymentId],
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Repayment not found" };
      }
      return { success: true, repayment: rows[0] };
    } catch (error) {
      console.error("EmployeeLoanRepaymentModel.getRepaymentById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createRepayment(repaymentData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { loan_id, amount, repayment_date, payment_method, notes } = repaymentData;

      const [result] = await db.query(
        `INSERT INTO employee_loan_repayments 
         (loan_id, amount, repayment_date, payment_method, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          loan_id,
          toNumber(amount),
          repayment_date || new Date().toISOString().slice(0, 10),
          payment_method || null,
          notes || null,
        ],
      );

      return this.getRepaymentById(result.insertId);
    } catch (error) {
      console.error("EmployeeLoanRepaymentModel.createRepayment error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateRepayment(repaymentId, repaymentData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { amount, repayment_date, payment_method, notes } = repaymentData;

      const updates = [];
      const params = [];

      if (amount !== undefined) {
        updates.push("amount = ?");
        params.push(toNumber(amount));
      }
      if (repayment_date !== undefined) {
        updates.push("repayment_date = ?");
        params.push(repayment_date);
      }
      if (payment_method !== undefined) {
        updates.push("payment_method = ?");
        params.push(payment_method || null);
      }
      if (notes !== undefined) {
        updates.push("notes = ?");
        params.push(notes || null);
      }

      if (updates.length === 0) {
        return this.getRepaymentById(repaymentId);
      }

      updates.push("updated_at = NOW()");
      params.push(repaymentId);

      await db.query(
        `UPDATE employee_loan_repayments SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getRepaymentById(repaymentId);
    } catch (error) {
      console.error("EmployeeLoanRepaymentModel.updateRepayment error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteRepayment(repaymentId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [result] = await db.query(
        "DELETE FROM employee_loan_repayments WHERE id = ?",
        [repaymentId],
      );
      if (result.affectedRows === 0) {
        return { success: false, error: "Repayment not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("EmployeeLoanRepaymentModel.deleteRepayment error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeeLoanRepaymentModel;

