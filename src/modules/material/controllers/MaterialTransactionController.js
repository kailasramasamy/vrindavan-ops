import pool from "../../../db/pool.js";
import emailService from "../../../services/emailService.js";
import { MaterialStockModel } from "../models/MaterialStockModel.js";
import { MaterialTransactionModel } from "../models/MaterialTransactionModel.js";

export class MaterialTransactionController {
  // Get all transactions
  static async getAll(req, res) {
    try {
      const filters = {
        material_id: req.query.material_id,
        location_id: req.query.location_id,
        transaction_type_id: req.query.transaction_type_id,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        reference_number: req.query.reference_number,
      };

      const result = await MaterialTransactionModel.getAll(filters);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ success: false, error: "Failed to fetch transactions" });
    }
  }

  // Get transaction by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const transaction = await MaterialTransactionModel.getById(id);

      if (!transaction) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      res.json({ success: true, data: transaction });
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ success: false, error: "Failed to fetch transaction" });
    }
  }

  // Create transaction
  static async create(req, res) {
    if (!pool) {
      return res.status(500).json({
        success: false,
        error: "Database connection not available",
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { transaction_type_id, material_id, location_id, quantity, unit_price = 0, reference_number, lot_number, department, job_order, machine_id, reason, notes } = req.body;

      // Validate required fields
      if (!transaction_type_id || !material_id || !location_id || !quantity) {
        return res.status(400).json({
          success: false,
          error: "Transaction type, material, location, and quantity are required",
        });
      }

      // Get transaction type to determine stock impact
      const [transactionTypes] = await connection.query(
        `
        SELECT stock_impact FROM material_transaction_types WHERE id = ?
      `,
        [transaction_type_id],
      );

      if (transactionTypes.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid transaction type",
        });
      }

      const stockImpact = transactionTypes[0].stock_impact;
      const quantityChange = stockImpact === "negative" ? -Math.abs(quantity) : Math.abs(quantity);

      // Check if negative stock is allowed for negative transactions
      if (stockImpact === "negative") {
        const [settings] = await connection.query(`
          SELECT setting_value FROM material_settings WHERE setting_key = 'allow_negative_stock'
        `);

        const allowNegative = settings.length > 0 && settings[0].setting_value === "true";

        if (!allowNegative) {
          // Check current stock
          const currentStock = await MaterialStockModel.getStock(material_id, location_id);
          const availableStock = currentStock ? currentStock.on_hand_qty - currentStock.reserved_qty : 0;

          if (availableStock < Math.abs(quantityChange)) {
            return res.status(400).json({
              success: false,
              error: `Insufficient stock. Available: ${availableStock}`,
            });
          }
        }
      }

      // Create transaction
      const result = await MaterialTransactionModel.createTransaction({
        transaction_type_id,
        material_id,
        location_id,
        quantity: Math.abs(quantity),
        unit_price,
        reference_number,
        lot_number,
        department,
        job_order,
        machine_id,
        reason,
        notes,
        user_id: req.user?.id || 1, // Default to user ID 1 if no authenticated user
      });

      // Update stock
      await MaterialStockModel.updateStock(material_id, location_id, quantityChange);

      await connection.commit();

      // Send email alert for material transaction
      try {
        // Get material and transaction type details for email
        const [materialDetails] = await connection.query(
          `SELECT m.name as material_name, m.sku_code as material_sku, 
                  mtt.name as transaction_type_name, ml.name as location_name,
                  u.name as user_name
           FROM materials m
           LEFT JOIN material_transaction_types mtt ON mtt.id = ?
           LEFT JOIN material_locations ml ON ml.id = ?
           LEFT JOIN users u ON u.id = ?
           WHERE m.id = ?`,
          [transaction_type_id, location_id, req.user?.id || 1, material_id],
        );

        if (materialDetails.length > 0) {
          const material = materialDetails[0];
          const transactionData = {
            material_name: material.material_name,
            material_sku: material.material_sku,
            transaction_type: material.transaction_type_name,
            transaction_quantity: Math.abs(quantity),
            location: material.location_name,
            transaction_date: new Date().toISOString(),
            user_name: material.user_name || "System",
          };

          // Send email alert (don't wait for it to complete)
          emailService.sendMaterialTransactionAlert(transactionData).catch((error) => {
            console.error("Failed to send material transaction alert:", error);
          });
        }
      } catch (emailError) {
        console.error("Error preparing material transaction email alert:", emailError);
        // Don't fail the transaction if email fails
      }

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          transaction_number: result.transaction_number,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error creating transaction:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create transaction",
      });
    } finally {
      connection.release();
    }
  }

  // Get transaction types
  static async getTransactionTypes(req, res) {
    try {
      const result = await MaterialTransactionModel.getTransactionTypes();
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching transaction types:", error);
      res.status(500).json({ success: false, error: "Failed to fetch transaction types" });
    }
  }

  // Get recent transactions
  static async getRecent(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const result = await MaterialTransactionModel.getRecentTransactions(limit);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching recent transactions:", error);
      res.status(500).json({ success: false, error: "Failed to fetch recent transactions" });
    }
  }

  // Get transaction summary
  static async getSummary(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      const result = await MaterialTransactionModel.getTransactionSummary(filters);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching transaction summary:", error);
      res.status(500).json({ success: false, error: "Failed to fetch transaction summary" });
    }
  }

  // Get daily trends
  static async getDailyTrends(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const result = await MaterialTransactionModel.getDailyTrends(days);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching daily trends:", error);
      res.status(500).json({ success: false, error: "Failed to fetch daily trends" });
    }
  }

  // Get department usage
  static async getDepartmentUsage(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      const result = await MaterialTransactionModel.getDepartmentUsage(filters);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching department usage:", error);
      res.status(500).json({ success: false, error: "Failed to fetch department usage" });
    }
  }

  // Get machine usage
  static async getMachineUsage(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      const result = await MaterialTransactionModel.getMachineUsage(filters);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching machine usage:", error);
      res.status(500).json({ success: false, error: "Failed to fetch machine usage" });
    }
  }

  // Export Stock Ledger
  static async exportStockLedger(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        category_id: req.query.category_id,
      };

      const result = await MaterialTransactionModel.getAll(filters);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No data found for export" });
      }

      // Generate CSV content
      const csvHeader = "Transaction Number,Date,Material,Category,Location,Transaction Type,Quantity,Unit Price,Total Value,Reference Number,Department,User\n";
      const csvRows = result.rows.map((row) => `${row.transaction_number},${row.transaction_date},${row.material_name},${row.category_name},${row.location_name},${row.transaction_type_name},${row.quantity},${row.unit_price},${row.total_value},${row.reference_number || ""},${row.department || ""},${row.user_name || ""}`).join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="stock-ledger.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting stock ledger:", error);
      res.status(500).json({ success: false, error: "Failed to export stock ledger" });
    }
  }

  // Export Transactions
  static async exportTransactions(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        category_id: req.query.category_id,
      };

      const result = await MaterialTransactionModel.getAll(filters);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No data found for export" });
      }

      // Generate CSV content
      const csvHeader = "Transaction Number,Date,Material,Category,Location,Transaction Type,Quantity,Unit Price,Total Value,Reference Number,Department,User\n";
      const csvRows = result.rows.map((row) => `${row.transaction_number},${row.transaction_date},${row.material_name},${row.category_name},${row.location_name},${row.transaction_type_name},${row.quantity},${row.unit_price},${row.total_value},${row.reference_number || ""},${row.department || ""},${row.user_name || ""}`).join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ success: false, error: "Failed to export transactions" });
    }
  }

  // Export Department Usage
  static async exportDepartmentUsage(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      };

      const result = await MaterialTransactionModel.getDepartmentUsage(filters);

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No data found for export" });
      }

      // Generate CSV content
      const csvHeader = "Department,Unique Materials,Total Quantity,Transaction Count\n";
      const csvRows = result.rows.map((row) => `${row.department},${row.unique_materials},${row.total_quantity},${row.transaction_count}`).join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="department-usage.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting department usage:", error);
      res.status(500).json({ success: false, error: "Failed to export department usage" });
    }
  }
}
