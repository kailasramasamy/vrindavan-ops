import pool from "../../../db/pool.js";

export class MilkInventoryModel {
  // Check if quantity_remaining column exists and add it if not
  static async ensureQuantityRemainingColumn() {
    try {
      // Check if column exists
      const [columns] = await pool.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'daily_milk_inventory' 
        AND COLUMN_NAME = 'quantity_remaining'
      `);

      if (columns.length === 0) {
        // Add the column
        await pool.execute(`
          ALTER TABLE daily_milk_inventory 
          ADD COLUMN quantity_remaining DECIMAL(10,1) NOT NULL DEFAULT 0 COMMENT 'Remaining milk after usage and waste (in liters)'
        `);

        // Update existing records
        await pool.execute(`
          UPDATE daily_milk_inventory 
          SET quantity_remaining = GREATEST(0, quantity_available - quantity_used - quantity_wasted)
          WHERE quantity_remaining = 0
        `);

        // Add index
        await pool.execute(`
          CREATE INDEX idx_quantity_remaining ON daily_milk_inventory(quantity_remaining)
        `);

        console.log("Added quantity_remaining column to daily_milk_inventory table");
      }
    } catch (error) {
      console.error("Error ensuring quantity_remaining column:", error);
    }
  }

  // Calculate remaining milk (available - used - wasted)
  static calculateRemainingMilk(available, used, wasted) {
    return Math.max(0, parseFloat(available || 0) - parseFloat(used || 0) - parseFloat(wasted || 0));
  }

  // Get milk usage breakdown for a specific date and milk type
  static async getMilkUsageBreakdown(date, milkType) {
    try {
      // Get pool allocations for this milk type
      const poolAllocationsSql = `
        SELECT 
          mp.name as pool_name,
          dpa.milk_allocated,
          dpa.notes
        FROM daily_pool_allocations dpa
        JOIN milk_pools mp ON dpa.pool_id = mp.id
        WHERE mp.milk_type = ? AND DATE(dpa.allocation_date) = DATE(?)
        ORDER BY dpa.milk_allocated DESC
      `;
      const [poolRows] = await pool.execute(poolAllocationsSql, [milkType, date]);

      // Get product production for this milk type
      const productProductionSql = `
        SELECT 
          CONCAT(p.name, ' (', dp.quantity_produced, ' units)') as product_name,
          dp.milk_used,
          dp.quantity_produced,
          p.unit_size,
          dp.notes
        FROM daily_production dp
        JOIN products p ON dp.product_id = p.id
        WHERE p.milk_type = ? AND DATE(dp.production_date) = DATE(?)
        ORDER BY dp.milk_used DESC
      `;
      const [productRows] = await pool.execute(productProductionSql, [milkType, date]);

      // Calculate totals
      const poolTotal = poolRows.reduce((sum, row) => sum + parseFloat(row.milk_allocated || 0), 0);
      const productTotal = productRows.reduce((sum, row) => sum + parseFloat(row.milk_used || 0), 0);

      return {
        success: true,
        breakdown: {
          pool_allocations: {
            total: poolTotal,
            items: poolRows.map((row) => ({
              name: row.pool_name,
              amount: parseFloat(row.milk_allocated || 0),
              notes: row.notes,
            })),
          },
          product_production: {
            total: productTotal,
            items: productRows.map((row) => ({
              name: row.product_name,
              amount: parseFloat(row.milk_used || 0),
              quantity_produced: row.quantity_produced,
              unit_size: row.unit_size,
              notes: row.notes,
            })),
          },
          grand_total: poolTotal + productTotal,
        },
      };
    } catch (error) {
      console.error("Error fetching milk usage breakdown:", error);
      return { success: false, error: error.message };
    }
  }

  // Get daily milk inventory for a specific date
  static async getDailyMilkInventory(date) {
    // Ensure quantity_remaining column exists
    await this.ensureQuantityRemainingColumn();
    // First, get all milk types that have either inventory entries or pools
    const milkTypesSql = `
      SELECT DISTINCT milk_type FROM (
        SELECT milk_type FROM daily_milk_inventory WHERE DATE(inventory_date) = DATE(?)
        UNION
        SELECT milk_type FROM milk_pools WHERE is_active = 1
      ) as all_types
      ORDER BY milk_type
    `;

    try {
      const [milkTypes] = await pool.execute(milkTypesSql, [date]);

      const results = [];

      for (const milkTypeRow of milkTypes) {
        const milkType = milkTypeRow.milk_type;

        // Get inventory data for this milk type
        const inventorySql = `
          SELECT *, 
                 COALESCE(quantity_remaining, GREATEST(0, quantity_available - quantity_used - quantity_wasted)) as quantity_remaining
          FROM daily_milk_inventory 
          WHERE milk_type = ? AND DATE(inventory_date) = DATE(?)
        `;
        const [inventoryRows] = await pool.execute(inventorySql, [milkType, date]);

        // Get pool allocations for this milk type
        const poolSql = `
          SELECT SUM(dpa.milk_allocated) as total_allocated
          FROM milk_pools mp
          LEFT JOIN daily_pool_allocations dpa ON mp.id = dpa.pool_id AND DATE(dpa.allocation_date) = DATE(?)
          WHERE mp.milk_type = ? AND mp.is_active = 1
        `;
        const [poolRows] = await pool.execute(poolSql, [date, milkType]);

        const inventory = inventoryRows[0] || {
          milk_type: milkType,
          quantity_available: 0,
          quantity_used: 0,
          quantity_wasted: 0,
          quantity_remaining: 0,
          notes: "",
          created_by: 1,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const poolAllocated = parseFloat(poolRows[0]?.total_allocated || 0);
        const available = parseFloat(inventory.quantity_available);
        const used = parseFloat(inventory.quantity_used); // This already includes pool allocations
        const wasted = parseFloat(inventory.quantity_wasted);
        const remaining = Math.max(0, available - used - wasted);

        // Get usage breakdown for this milk type
        const usageBreakdown = await this.getMilkUsageBreakdown(date, milkType);

        results.push({
          milk_type: milkType,
          quantity_available: available,
          quantity_used: used,
          quantity_wasted: wasted,
          quantity_remaining: remaining,
          notes: inventory.notes,
          created_by: inventory.created_by,
          created_at: inventory.created_at,
          updated_at: inventory.updated_at,
          pool_allocated: poolAllocated,
          usage_breakdown: usageBreakdown.success ? usageBreakdown.breakdown : null,
        });
      }

      return { success: true, rows: results };
    } catch (error) {
      console.error("Error fetching daily milk inventory:", error);
      return { success: false, error: error.message };
    }
  }

  // Get milk inventory for a date range
  static async getMilkInventoryRange(startDate, endDate) {
    const sql = `
      SELECT * FROM daily_milk_inventory 
      WHERE inventory_date BETWEEN ? AND ?
      ORDER BY inventory_date DESC, milk_type
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk inventory range:", error);
      return { success: false, error: error.message };
    }
  }

  // Create or update daily milk inventory entry
  static async upsertDailyMilkInventory(inventoryData) {
    const { inventory_date, milk_type, quantity_available, quantity_used, quantity_wasted, notes, created_by } = inventoryData;

    // Ensure quantity_remaining column exists
    await this.ensureQuantityRemainingColumn();

    // Ensure inventory_date is stored as date only (without time)
    const dateOnly = inventory_date.split("T")[0]; // Extract date part only

    // Calculate remaining milk
    const quantity_remaining = this.calculateRemainingMilk(quantity_available, quantity_used, quantity_wasted);

    const sql = `
      INSERT INTO daily_milk_inventory (inventory_date, milk_type, quantity_available, quantity_used, quantity_wasted, quantity_remaining, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      quantity_available = VALUES(quantity_available),
      quantity_used = VALUES(quantity_used),
      quantity_wasted = VALUES(quantity_wasted),
      quantity_remaining = VALUES(quantity_remaining),
      notes = VALUES(notes),
      created_by = VALUES(created_by),
      updated_at = CURRENT_TIMESTAMP
    `;

    const params = [dateOnly, milk_type, quantity_available, quantity_used, quantity_wasted, quantity_remaining, notes, created_by];

    try {
      const [result] = await pool.execute(sql, params);
      return { success: true, id: result.insertId || result.affectedRows };
    } catch (error) {
      console.error("Error upserting daily milk inventory:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete daily milk inventory entry
  static async deleteDailyMilkInventory(id) {
    const sql = `DELETE FROM daily_milk_inventory WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [id]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting daily milk inventory:", error);
      return { success: false, error: error.message };
    }
  }

  // Get milk inventory summary for a date
  static async getMilkInventorySummary(date) {
    try {
      // Get detailed inventory data
      const inventoryResult = await this.getDailyMilkInventory(date);

      if (!inventoryResult.success) {
        return inventoryResult;
      }

      const inventoryData = inventoryResult.rows;

      // Calculate summary totals
      const summary = {
        inventory_date: date,
        total_available: 0,
        total_used: 0,
        total_wasted: 0,
        a1_available: 0,
        a1_used: 0,
        a1_wasted: 0,
        a2_available: 0,
        a2_used: 0,
        a2_wasted: 0,
        buffalo_available: 0,
        buffalo_used: 0,
        buffalo_wasted: 0,
      };

      inventoryData.forEach((item) => {
        summary.total_available += item.quantity_available;
        summary.total_used += item.quantity_used;
        summary.total_wasted += item.quantity_wasted;

        if (item.milk_type === "A1") {
          summary.a1_available += item.quantity_available;
          summary.a1_used += item.quantity_used;
          summary.a1_wasted += item.quantity_wasted;
        } else if (item.milk_type === "A2") {
          summary.a2_available += item.quantity_available;
          summary.a2_used += item.quantity_used;
          summary.a2_wasted += item.quantity_wasted;
        } else if (item.milk_type === "Buffalo") {
          summary.buffalo_available += item.quantity_available;
          summary.buffalo_used += item.quantity_used;
          summary.buffalo_wasted += item.quantity_wasted;
        }
      });

      return { success: true, rows: summary };
    } catch (error) {
      console.error("Error fetching milk inventory summary:", error);
      return { success: false, error: error.message };
    }
  }

  // Get milk inventory analytics for a date range
  static async getMilkInventoryAnalytics(startDate, endDate, groupBy = "day") {
    let dateFormat = "%Y-%m-%d";
    if (groupBy === "week") {
      dateFormat = "%Y-%u";
    } else if (groupBy === "month") {
      dateFormat = "%Y-%m";
    }

    const sql = `
      SELECT 
        DATE_FORMAT(inventory_date, '${dateFormat}') as period,
        MIN(inventory_date) as inventory_date,
        SUM(quantity_available) as total_available,
        SUM(quantity_used) as total_used,
        SUM(quantity_wasted) as total_wasted,
        SUM(CASE WHEN milk_type = 'A1' THEN quantity_available ELSE 0 END) as a1_available,
        SUM(CASE WHEN milk_type = 'A1' THEN quantity_used ELSE 0 END) as a1_used,
        SUM(CASE WHEN milk_type = 'A2' THEN quantity_available ELSE 0 END) as a2_available,
        SUM(CASE WHEN milk_type = 'A2' THEN quantity_used ELSE 0 END) as a2_used,
        SUM(CASE WHEN milk_type = 'Buffalo' THEN quantity_available ELSE 0 END) as buffalo_available,
        SUM(CASE WHEN milk_type = 'Buffalo' THEN quantity_used ELSE 0 END) as buffalo_used
      FROM daily_milk_inventory 
      WHERE inventory_date BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(inventory_date, '${dateFormat}')
      ORDER BY inventory_date
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk inventory analytics:", error);
      return { success: false, error: error.message };
    }
  }

  // Calculate milk efficiency (used vs available)
  static async getMilkEfficiency(startDate, endDate) {
    const sql = `
      SELECT 
        milk_type,
        SUM(quantity_available) as total_available,
        SUM(quantity_used) as total_used,
        SUM(quantity_wasted) as total_wasted,
        CASE 
          WHEN SUM(quantity_available) > 0 
          THEN ROUND((SUM(quantity_used) / SUM(quantity_available)) * 100, 2)
          ELSE 0 
        END as efficiency_percentage,
        CASE 
          WHEN SUM(quantity_available) > 0 
          THEN ROUND((SUM(quantity_wasted) / SUM(quantity_available)) * 100, 2)
          ELSE 0 
        END as waste_percentage
      FROM daily_milk_inventory 
      WHERE inventory_date BETWEEN ? AND ?
      GROUP BY milk_type
      ORDER BY efficiency_percentage DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [startDate, endDate]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk efficiency:", error);
      return { success: false, error: error.message };
    }
  }
}
