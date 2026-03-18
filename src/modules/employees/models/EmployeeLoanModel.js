import pool, { opsPool } from "../../../db/pool.js";

const opsDb = opsPool || pool;

function toNumber(value, precision = 2) {
  if (value == null) return 0;
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

export class EmployeeLoanModel {
  static get db() {
    return opsDb;
  }

  static async listLoansByEmployeeId(employeeId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT l.*,
                COALESCE(SUM(r.amount), 0) AS total_repaid,
                (l.loan_amount - COALESCE(SUM(r.amount), 0)) AS remaining_balance
         FROM employee_loans l
         LEFT JOIN employee_loan_repayments r ON l.id = r.loan_id
         WHERE l.employee_id = ?
         GROUP BY l.id
         ORDER BY l.loan_date DESC`,
        [employeeId],
      );
      return { success: true, loans: rows || [] };
    } catch (error) {
      console.error("EmployeeLoanModel.listLoansByEmployeeId error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getLoanById(loanId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const [rows] = await db.query(
        `SELECT l.*,
                COALESCE(SUM(r.amount), 0) AS total_repaid,
                (l.loan_amount - COALESCE(SUM(r.amount), 0)) AS remaining_balance
         FROM employee_loans l
         LEFT JOIN employee_loan_repayments r ON l.id = r.loan_id
         WHERE l.id = ?
         GROUP BY l.id`,
        [loanId],
      );
      if (!rows || rows.length === 0) {
        return { success: false, error: "Loan not found" };
      }
      return { success: true, loan: rows[0] };
    } catch (error) {
      console.error("EmployeeLoanModel.getLoanById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createLoan(loanData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { employee_id, loan_amount, interest_rate, loan_date, due_date, purpose, notes } = loanData;

      const [result] = await db.query(
        `INSERT INTO employee_loans 
         (employee_id, loan_amount, interest_rate, loan_date, due_date, purpose, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          employee_id,
          toNumber(loan_amount),
          toNumber(interest_rate),
          loan_date || new Date().toISOString().slice(0, 10),
          due_date || null,
          purpose || null,
          notes || null,
        ],
      );

      return this.getLoanById(result.insertId);
    } catch (error) {
      console.error("EmployeeLoanModel.createLoan error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateLoan(loanId, loanData) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      const { loan_amount, interest_rate, loan_date, due_date, purpose, notes, status } = loanData;

      const updates = [];
      const params = [];

      if (loan_amount !== undefined) {
        updates.push("loan_amount = ?");
        params.push(toNumber(loan_amount));
      }
      if (interest_rate !== undefined) {
        updates.push("interest_rate = ?");
        params.push(toNumber(interest_rate));
      }
      if (loan_date !== undefined) {
        updates.push("loan_date = ?");
        params.push(loan_date);
      }
      if (due_date !== undefined) {
        updates.push("due_date = ?");
        params.push(due_date || null);
      }
      if (purpose !== undefined) {
        updates.push("purpose = ?");
        params.push(purpose || null);
      }
      if (notes !== undefined) {
        updates.push("notes = ?");
        params.push(notes || null);
      }
      if (status !== undefined) {
        updates.push("status = ?");
        params.push(status);
      }

      if (updates.length === 0) {
        return this.getLoanById(loanId);
      }

      updates.push("updated_at = NOW()");
      params.push(loanId);

      await db.query(
        `UPDATE employee_loans SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return this.getLoanById(loanId);
    } catch (error) {
      console.error("EmployeeLoanModel.updateLoan error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteLoan(loanId) {
    const db = this.db;
    if (!db) {
      return { success: false, error: "Database connection not available" };
    }
    try {
      // Check if loan has repayments
      const [repayments] = await db.query(
        "SELECT COUNT(*) as count FROM employee_loan_repayments WHERE loan_id = ?",
        [loanId],
      );
      if (repayments[0]?.count > 0) {
        return { success: false, error: "Cannot delete loan with existing repayments" };
      }

      const [result] = await db.query("DELETE FROM employee_loans WHERE id = ?", [loanId]);
      if (result.affectedRows === 0) {
        return { success: false, error: "Loan not found" };
      }
      return { success: true };
    } catch (error) {
      console.error("EmployeeLoanModel.deleteLoan error:", error);
      return { success: false, error: error.message };
    }
  }
}

export default EmployeeLoanModel;

