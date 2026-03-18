import { analyticsPool } from "../../../db/pool.js";

export class WalletRechargesModel {
  /**
   * Get wallet recharges with pagination and filters
   */
  static async getWalletRecharges({ startDate, endDate, status = null, page = 1, limit = 25 }) {
    try {
      const offset = (page - 1) * limit;
      
      // Build WHERE clause
      let whereConditions = ['DATE(wt.transaction_date) BETWEEN ? AND ?'];
      let queryParams = [startDate, endDate];
      
      if (status && status !== 'all') {
        whereConditions.push('wt.status = ?');
        queryParams.push(status);
      }
      
      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const [countResult] = await analyticsPool.query(
        `SELECT COUNT(*) as total 
        FROM wallet_transactions wt
        WHERE ${whereClause}`,
        queryParams
      );
      const totalRecords = countResult[0].total;

      // Get paginated results with user details
      const [transactions] = await analyticsPool.query(
        `SELECT 
          wt.id,
          wt.transaction_date,
          wt.rp_payment_id,
          wt.user_id,
          wt.status,
          wt.transaction_amount,
          wt.plan_amount,
          wt.extra_amount,
          u.name as user_name,
          u.phone as user_phone,
          u.email as user_email
        FROM wallet_transactions wt
        LEFT JOIN users u ON wt.user_id = u.id
        WHERE ${whereClause}
        ORDER BY wt.transaction_date DESC
        LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
      );

      return {
        success: true,
        transactions,
        pagination: {
          total: totalRecords,
          page,
          limit,
          totalPages: Math.ceil(totalRecords / limit),
        },
      };
    } catch (error) {
      console.error("Error fetching wallet recharges:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get summary statistics for wallet recharges
   */
  static async getRechargesSummary({ startDate, endDate, status = null }) {
    try {
      // Build WHERE clause
      let whereConditions = ['DATE(transaction_date) BETWEEN ? AND ?'];
      let queryParams = [startDate, endDate];
      
      if (status && status !== 'all') {
        whereConditions.push('status = ?');
        queryParams.push(status);
      }
      
      const whereClause = whereConditions.join(' AND ');

      const [summary] = await analyticsPool.query(
        `SELECT 
          COUNT(*) as total_transactions,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(transaction_amount) as total_amount,
          SUM(CASE WHEN status = 'success' THEN transaction_amount ELSE 0 END) as successful_amount,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_count,
          SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed_count,
          AVG(CASE WHEN status = 'success' THEN transaction_amount ELSE NULL END) as avg_transaction_amount
        FROM wallet_transactions
        WHERE ${whereClause}`,
        queryParams
      );

      return {
        success: true,
        summary: summary[0],
      };
    } catch (error) {
      console.error("Error fetching recharges summary:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get status-wise breakdown
   */
  static async getStatusBreakdown({ startDate, endDate }) {
    try {
      const [breakdown] = await analyticsPool.query(
        `SELECT 
          status,
          COUNT(*) as count,
          SUM(transaction_amount) as total_amount
        FROM wallet_transactions
        WHERE DATE(transaction_date) BETWEEN ? AND ?
        GROUP BY status
        ORDER BY count DESC`,
        [startDate, endDate]
      );

      return {
        success: true,
        breakdown,
      };
    } catch (error) {
      console.error("Error fetching status breakdown:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

