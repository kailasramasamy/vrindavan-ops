import { marketingPool } from "../../../db/marketingPool.js";
import CampaignExpenseModel from "../../../models/CampaignExpenseModel.js";
import CampaignModel from "../../../models/CampaignModel.js";

class ExpenseController {
  // Get all expenses with optional filters
  async getAll(req, res) {
    try {
      const filters = {
        campaign_id: req.query.campaign_id,
        category: req.query.category,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      let expenses;
      if (filters.campaign_id) {
        expenses = await CampaignExpenseModel.getByCampaignId(filters.campaign_id);
      } else if (filters.category) {
        expenses = await CampaignExpenseModel.getByCategory(filters.category, filters);
      } else {
        // Get all expenses with campaign info
        const query = `
          SELECT ce.*, u.name as created_by_name, c.name as campaign_name, c.type as campaign_type, c.channel
          FROM campaign_expenses ce
          LEFT JOIN users u ON ce.created_by = u.id
          LEFT JOIN campaigns c ON ce.campaign_id = c.id
          WHERE 1=1
          ${filters.date_from ? " AND ce.expense_date >= ?" : ""}
          ${filters.date_to ? " AND ce.expense_date <= ?" : ""}
          ORDER BY ce.expense_date DESC, ce.created_at DESC
        `;

        const values = [];
        if (filters.date_from) values.push(filters.date_from);
        if (filters.date_to) values.push(filters.date_to);

        const [rows] = await marketingPool.execute(query, values);
        expenses = rows;
      }

      res.json({
        success: true,
        data: expenses,
        count: expenses.length,
      });
    } catch (error) {
      console.error("Error getting expenses:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch expenses",
      });
    }
  }

  // Get expense by ID
  async getById(req, res) {
    try {
      const { id } = req.params;
      const expense = await CampaignExpenseModel.getById(id);

      if (!expense) {
        return res.status(404).json({
          success: false,
          error: "Expense not found",
        });
      }

      res.json({
        success: true,
        data: expense,
      });
    } catch (error) {
      console.error("Error getting expense:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch expense",
      });
    }
  }

  // Create new expense
  async create(req, res) {
    try {
      const expenseData = {
        ...req.body,
        created_by: req.user.id,
      };

      // Validate campaign exists
      const campaign = await CampaignModel.getById(expenseData.campaign_id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      const expenseId = await CampaignExpenseModel.create(expenseData);

      res.status(201).json({
        success: true,
        data: { id: expenseId },
        message: "Expense created successfully",
      });
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create expense",
      });
    }
  }

  // Update expense
  async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const success = await CampaignExpenseModel.update(id, updateData);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Expense not found",
        });
      }

      res.json({
        success: true,
        message: "Expense updated successfully",
      });
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update expense",
      });
    }
  }

  // Delete expense
  async delete(req, res) {
    try {
      const { id } = req.params;
      const success = await CampaignExpenseModel.delete(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Expense not found",
        });
      }

      res.json({
        success: true,
        message: "Expense deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete expense",
      });
    }
  }

  // Get expenses by campaign ID
  async getByCampaign(req, res) {
    try {
      const { id } = req.params;
      const expenses = await CampaignExpenseModel.getByCampaignId(id);

      res.json({
        success: true,
        data: expenses,
        count: expenses.length,
      });
    } catch (error) {
      console.error("Error getting expenses by campaign:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch campaign expenses",
      });
    }
  }

  // Get expense summary for a campaign
  async getExpenseSummary(req, res) {
    try {
      const { id } = req.params;
      const summary = await CampaignExpenseModel.getExpenseSummary(id);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error("Error getting expense summary:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch expense summary",
      });
    }
  }

  // Get monthly expense breakdown
  async getMonthlyBreakdown(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        campaign_type: req.query.campaign_type,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const breakdown = await CampaignExpenseModel.getMonthlyBreakdown(filters);

      res.json({
        success: true,
        data: breakdown,
      });
    } catch (error) {
      console.error("Error getting monthly breakdown:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch monthly expense breakdown",
      });
    }
  }

  // Get total expenses
  async getTotalExpenses(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        campaign_id: req.query.campaign_id,
        category: req.query.category,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const totals = await CampaignExpenseModel.getTotalExpenses(filters);

      res.json({
        success: true,
        data: totals,
      });
    } catch (error) {
      console.error("Error getting total expenses:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch total expenses",
      });
    }
  }

  // Get expense analytics
  async getAnalytics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      const analytics = await CampaignExpenseModel.getExpenseAnalytics(filters);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error("Error getting expense analytics:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch expense analytics",
      });
    }
  }
}

export default new ExpenseController();
