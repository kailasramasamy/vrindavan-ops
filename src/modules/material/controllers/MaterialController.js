import emailService from "../../../services/emailService.js";
import { MaterialModel } from "../models/MaterialModel.js";
import { MaterialStockModel } from "../models/MaterialStockModel.js";

export class MaterialController {
  // Get all materials
  static async getAll(req, res) {
    try {
      const filters = {
        category_id: req.query.category_id,
        location_id: req.query.location_id,
        search: req.query.search,
        low_stock: req.query.low_stock === "true",
      };

      const result = await MaterialModel.getAll(filters);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching materials:", error);
      res.status(500).json({ success: false, error: "Failed to fetch materials" });
    }
  }

  // Get material by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const material = await MaterialModel.getById(id);

      if (!material) {
        return res.status(404).json({ success: false, error: "Material not found" });
      }

      // Get stock by location
      const stockResult = await MaterialStockModel.getStockByLocation(id);

      res.json({
        success: true,
        data: { ...material, stock: stockResult.rows },
      });
    } catch (error) {
      console.error("Error fetching material:", error);
      res.status(500).json({ success: false, error: "Failed to fetch material" });
    }
  }

  // Create new material
  static async create(req, res) {
    try {
      const { sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes, notes } = req.body;

      // Validate required fields
      if (!sku_code || !name || !category_id || !default_uom_id) {
        return res.status(400).json({
          success: false,
          error: "SKU code, name, category, and default UOM are required",
        });
      }

      // Check if SKU already exists
      const existingMaterial = await MaterialModel.getBySku(sku_code);
      if (existingMaterial) {
        return res.status(400).json({
          success: false,
          error: "SKU code already exists",
        });
      }

      const result = await MaterialModel.create({
        sku_code: sku_code.trim(),
        name: name.trim(),
        category_id,
        description,
        image_url,
        default_uom_id,
        alt_uom_id,
        alt_uom_conversion,
        pack_size: pack_size || 1,
        supplier_reference,
        lead_time_days: lead_time_days || 0,
        min_stock: min_stock || 0,
        max_stock: max_stock || 0,
        reorder_qty: reorder_qty || 0,
        reorder_point: reorder_point || 0,
        stock_policy: stock_policy || "min_max",
        custom_attributes,
        notes,
      });

      res.status(201).json({
        success: true,
        data: { id: result.id, sku_code: sku_code.trim(), name: name.trim() },
      });
    } catch (error) {
      console.error("Error creating material:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "SKU code already exists" });
      } else {
        res.status(500).json({ success: false, error: "Failed to create material" });
      }
    }
  }

  // Update material
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { sku_code, name, category_id, description, image_url, default_uom_id, alt_uom_id, alt_uom_conversion, pack_size, supplier_reference, lead_time_days, min_stock, max_stock, reorder_qty, reorder_point, stock_policy, custom_attributes, notes } = req.body;

      // Validate required fields
      if (!sku_code || !name || !category_id || !default_uom_id) {
        return res.status(400).json({
          success: false,
          error: "SKU code, name, category, and default UOM are required",
        });
      }

      // Check if SKU already exists for different material
      const existingMaterial = await MaterialModel.getBySku(sku_code);
      if (existingMaterial && existingMaterial.id != id) {
        return res.status(400).json({
          success: false,
          error: "SKU code already exists for another material",
        });
      }

      const success = await MaterialModel.update(id, {
        sku_code: sku_code.trim(),
        name: name.trim(),
        category_id,
        description,
        image_url,
        default_uom_id,
        alt_uom_id,
        alt_uom_conversion,
        pack_size: pack_size || 1,
        supplier_reference,
        lead_time_days: lead_time_days || 0,
        min_stock: min_stock || 0,
        max_stock: max_stock || 0,
        reorder_qty: reorder_qty || 0,
        reorder_point: reorder_point || 0,
        stock_policy: stock_policy || "min_max",
        custom_attributes,
        notes,
      });

      if (!success) {
        return res.status(404).json({ success: false, error: "Material not found" });
      }

      res.json({ success: true, message: "Material updated successfully" });
    } catch (error) {
      console.error("Error updating material:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "SKU code already exists" });
      } else {
        res.status(500).json({ success: false, error: "Failed to update material" });
      }
    }
  }

  // Deactivate material
  static async deactivate(req, res) {
    try {
      const { id } = req.params;
      const success = await MaterialModel.deactivate(id);

      if (!success) {
        return res.status(404).json({ success: false, error: "Material not found" });
      }

      res.json({ success: true, message: "Material deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating material:", error);
      res.status(500).json({ success: false, error: "Failed to deactivate material" });
    }
  }

  // Get low stock materials
  static async getLowStock(req, res) {
    try {
      const result = await MaterialModel.getLowStockMaterials();
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching low stock materials:", error);
      res.status(500).json({ success: false, error: "Failed to fetch low stock materials" });
    }
  }

  // Get usage trends
  static async getUsageTrends(req, res) {
    try {
      const { id } = req.params;
      const days = parseInt(req.query.days) || 30;

      const result = await MaterialModel.getUsageTrends(id, days);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching usage trends:", error);
      res.status(500).json({ success: false, error: "Failed to fetch usage trends" });
    }
  }

  // Calculate days of cover
  static async getDaysOfCover(req, res) {
    try {
      const { id } = req.params;
      const windowDays = parseInt(req.query.window_days) || 30;

      const daysOfCover = await MaterialModel.calculateDaysOfCover(id, windowDays);
      res.json({ success: true, data: { daysOfCover } });
    } catch (error) {
      console.error("Error calculating days of cover:", error);
      res.status(500).json({ success: false, error: "Failed to calculate days of cover" });
    }
  }

  // Export Low Stock Report
  static async exportLowStock(req, res) {
    try {
      const result = await MaterialModel.getLowStockMaterials();

      if (!result.rows || result.rows.length === 0) {
        // Return a CSV with just headers when no data is found
        const csvHeader = "SKU Code,Material Name,Category,Current Stock,Min Stock,Max Stock,Reorder Point,Reorder Qty,Location,Status\n";
        const csvContent = csvHeader + "No low stock items found at this time";

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="low-stock-report.csv"');
        res.send(csvContent);
        return;
      }

      // Generate CSV content
      const csvHeader = "SKU Code,Material Name,Category,Current Stock,Min Stock,Max Stock,Reorder Point,Reorder Qty,Location,Status\n";
      const csvRows = result.rows.map((row) => `${row.sku_code},${row.name},${row.category_name},${row.total_stock},${row.min_stock},${row.max_stock},${row.reorder_point},${row.reorder_qty},${row.location_name || "All Locations"},Low Stock`).join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="low-stock-report.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting low stock report:", error);
      res.status(500).json({ success: false, error: "Failed to export low stock report" });
    }
  }

  // Export Stock Aging Report
  static async exportStockAging(req, res) {
    try {
      // This is a placeholder implementation
      // In a real system, you would calculate FSN (Fast/Slow/Non-moving) analysis
      const result = await MaterialModel.getAll();

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No materials found" });
      }

      // Generate CSV content with basic aging analysis
      const csvHeader = "SKU Code,Material Name,Category,Current Stock,Last Movement,Stock Value,Aging Category\n";
      const csvRows = result.rows
        .map((row) => {
          const lastMovement = row.last_movement_date ? new Date(row.last_movement_date) : null;
          const daysSinceMovement = lastMovement ? Math.floor((new Date() - lastMovement) / (1000 * 60 * 60 * 24)) : 999;

          let agingCategory = "Non-moving";
          if (daysSinceMovement <= 30) agingCategory = "Fast Moving";
          else if (daysSinceMovement <= 90) agingCategory = "Slow Moving";

          return `${row.sku_code},${row.name},${row.category_name},${row.total_stock || 0},${lastMovement ? lastMovement.toISOString().split("T")[0] : "Never"},${(row.total_stock || 0) * (row.unit_price || 0)},${agingCategory}`;
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="stock-aging-analysis.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting stock aging report:", error);
      res.status(500).json({ success: false, error: "Failed to export stock aging report" });
    }
  }

  // Export Consumption Report
  static async exportConsumption(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        category_id: req.query.category_id,
      };

      // Get materials with consumption data
      const result = await MaterialModel.getAll();

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No materials found" });
      }

      // Generate CSV content with consumption data
      const csvHeader = "SKU Code,Material Name,Category,Current Stock,Avg Daily Consumption,Days of Cover,Reorder Status\n";
      const csvRows = result.rows
        .map((row) => {
          const currentStock = parseFloat(row.total_stock || 0);
          const avgDailyConsumption = parseFloat(row.avg_daily_consumption || 0);
          const daysOfCover = avgDailyConsumption > 0 ? Math.floor(currentStock / avgDailyConsumption) : 999;

          let reorderStatus = "Normal";
          if (currentStock <= parseFloat(row.min_stock || 0)) reorderStatus = "Reorder Now";
          else if (daysOfCover <= 7) reorderStatus = "Reorder Soon";

          return `${row.sku_code},${row.name},${row.category_name},${currentStock},${avgDailyConsumption},${daysOfCover},${reorderStatus}`;
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="consumption-report.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting consumption report:", error);
      res.status(500).json({ success: false, error: "Failed to export consumption report" });
    }
  }

  // Export ABC Analysis
  static async exportABCAnalysis(req, res) {
    try {
      const result = await MaterialModel.getAll();

      if (!result.rows || result.rows.length === 0) {
        return res.status(404).json({ success: false, error: "No materials found" });
      }

      // Calculate total stock value
      const materialsWithValue = result.rows.map((row) => ({
        ...row,
        stockValue: parseFloat(row.total_stock || 0) * parseFloat(row.unit_price || 0),
      }));

      const totalValue = materialsWithValue.reduce((sum, row) => sum + row.stockValue, 0);

      // Sort by stock value and categorize
      materialsWithValue.sort((a, b) => b.stockValue - a.stockValue);

      let cumulativeValue = 0;
      const abcMaterials = materialsWithValue.map((row) => {
        cumulativeValue += row.stockValue;
        const percentage = (cumulativeValue / totalValue) * 100;

        let category = "C";
        if (percentage <= 80) category = "A";
        else if (percentage <= 95) category = "B";

        return {
          ...row,
          category,
          percentage: ((row.stockValue / totalValue) * 100).toFixed(2),
          cumulativePercentage: percentage.toFixed(2),
        };
      });

      // Generate CSV content
      const csvHeader = "SKU Code,Material Name,Category,Stock Value,Percentage of Total,Cumulative %,ABC Category\n";
      const csvRows = abcMaterials.map((row) => `${row.sku_code},${row.name},${row.category_name},${row.stockValue.toFixed(2)},${row.percentage}%,${row.cumulativePercentage}%,${row.category}`).join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="abc-analysis.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting ABC analysis:", error);
      res.status(500).json({ success: false, error: "Failed to export ABC analysis" });
    }
  }

  // Upload material image
  static async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No image file provided" });
      }

      const imageUrl = `/uploads/materials/${req.file.filename}`;

      res.json({
        success: true,
        data: {
          imageUrl: imageUrl,
          filename: req.file.filename,
        },
      });
    } catch (error) {
      console.error("Error uploading material image:", error);
      res.status(500).json({ success: false, error: "Failed to upload image" });
    }
  }

  // Export Reorder Suggestions
  static async exportReorderSuggestions(req, res) {
    try {
      const result = await MaterialModel.getLowStockMaterials();

      if (!result.rows || result.rows.length === 0) {
        // Return a CSV with just headers when no data is found
        const csvHeader = "SKU Code,Material Name,Category,Current Stock,Min Stock,Reorder Point,Reorder Qty,Suggested Order Qty,Priority,Lead Time\n";
        const csvContent = csvHeader + "No reorder suggestions found at this time";

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="reorder-suggestions.csv"');
        res.send(csvContent);
        return;
      }

      // Generate CSV content
      const csvHeader = "SKU Code,Material Name,Category,Current Stock,Min Stock,Reorder Point,Reorder Qty,Suggested Order Qty,Priority,Lead Time\n";
      const csvRows = result.rows
        .map((row) => {
          const currentStock = parseFloat(row.total_stock || 0);
          const minStock = parseFloat(row.min_stock || 0);
          const reorderQty = parseFloat(row.reorder_qty || 0);
          const leadTime = row.lead_time_days || 0;

          let suggestedOrderQty = reorderQty;
          let priority = "Medium";

          if (currentStock <= 0) {
            suggestedOrderQty = reorderQty * 2;
            priority = "High";
          } else if (currentStock <= minStock * 0.5) {
            suggestedOrderQty = reorderQty * 1.5;
            priority = "High";
          } else if (currentStock <= minStock) {
            priority = "Medium";
          }

          return `${row.sku_code},${row.name},${row.category_name},${currentStock},${minStock},${row.reorder_point},${reorderQty},${suggestedOrderQty},${priority},${leadTime} days`;
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="reorder-suggestions.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting reorder suggestions:", error);
      res.status(500).json({ success: false, error: "Failed to export reorder suggestions" });
    }
  }

  // Export Materials CSV
  static async exportMaterials(req, res) {
    try {
      const filters = {
        category_id: req.query.category_id,
        location_id: req.query.location_id,
        search: req.query.search,
        low_stock: req.query.low_stock === "true",
      };

      const result = await MaterialModel.getAll(filters);

      if (!result.rows || result.rows.length === 0) {
        // Return a CSV with just headers when no data is found
        const csvHeader = "SKU Code,Material Name,Category,Description,Supplier Reference,Default UOM,Alt UOM,Alt UOM Conversion,Pack Size,Lead Time (Days),Min Stock,Max Stock,Reorder Point,Reorder Qty,Stock Policy,Current Stock,Status,Created Date,Updated Date\n";
        const csvContent = csvHeader + "No materials found matching the criteria";

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="materials-export.csv"');
        res.send(csvContent);
        return;
      }

      // Generate CSV content
      const csvHeader = "SKU Code,Material Name,Category,Description,Supplier Reference,Default UOM,Alt UOM,Alt UOM Conversion,Pack Size,Lead Time (Days),Min Stock,Max Stock,Reorder Point,Reorder Qty,Stock Policy,Current Stock,Status,Created Date,Updated Date\n";

      const csvRows = result.rows
        .map((row) => {
          // Escape CSV values that contain commas or quotes
          const escapeCsvValue = (value) => {
            if (value === null || value === undefined) return "";
            const stringValue = String(value);
            if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          };

          return [escapeCsvValue(row.sku_code), escapeCsvValue(row.name), escapeCsvValue(row.category_name), escapeCsvValue(row.description), escapeCsvValue(row.supplier_reference), escapeCsvValue(row.default_uom_name), escapeCsvValue(row.alt_uom_name), escapeCsvValue(row.alt_uom_conversion), escapeCsvValue(row.pack_size), escapeCsvValue(row.lead_time_days), escapeCsvValue(row.min_stock), escapeCsvValue(row.max_stock), escapeCsvValue(row.reorder_point), escapeCsvValue(row.reorder_qty), escapeCsvValue(row.stock_policy), escapeCsvValue(row.total_stock || 0), escapeCsvValue(row.is_active ? "Active" : "Inactive"), escapeCsvValue(row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : ""), escapeCsvValue(row.updated_at ? new Date(row.updated_at).toISOString().split("T")[0] : "")].join(",");
        })
        .join("\n");

      const csvContent = csvHeader + csvRows;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="materials-export.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting materials:", error);
      res.status(500).json({ success: false, error: "Failed to export materials" });
    }
  }

  // Check for low stock and send alerts
  static async checkLowStockAndSendAlerts() {
    try {
      const result = await MaterialModel.getLowStockMaterials();

      if (result.rows && result.rows.length > 0) {
        for (const material of result.rows) {
          const stockData = {
            material_name: material.name,
            material_sku: material.sku_code,
            current_stock: parseFloat(material.total_stock || 0),
            min_stock: parseFloat(material.min_stock || 0),
            location: "All Locations", // You might want to get specific location details
            alert_date: new Date().toISOString(),
          };

          // Send low stock alert (don't wait for it to complete)
          emailService.sendLowStockAlert(stockData).catch((error) => {
            console.error("Failed to send low stock alert for material:", material.name, error);
          });
        }
      }
    } catch (error) {
      console.error("Error checking low stock and sending alerts:", error);
    }
  }
}
