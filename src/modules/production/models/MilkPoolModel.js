import pool from "../../../db/pool.js";

export class MilkPoolModel {
  // Get all milk pools
  static async getAllMilkPools(filters = {}) {
    const { milk_type, is_active = true } = filters;

    let sql = `
      SELECT mp.*, COUNT(p.id) as product_count
      FROM milk_pools mp
      LEFT JOIN products p ON mp.id = p.pool_id
      WHERE 1=1
    `;

    const params = [];

    if (milk_type) {
      sql += ` AND mp.milk_type = ?`;
      params.push(milk_type);
    }

    if (is_active !== null) {
      sql += ` AND mp.is_active = ?`;
      params.push(is_active);
    }

    sql += ` GROUP BY mp.id ORDER BY mp.milk_type, mp.name`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching milk pools:", error);
      return { success: false, error: error.message };
    }
  }

  // Get milk pool by ID
  static async getMilkPoolById(id) {
    const sql = `
      SELECT mp.*, COUNT(p.id) as product_count
      FROM milk_pools mp
      LEFT JOIN products p ON mp.id = p.pool_id
      WHERE mp.id = ?
      GROUP BY mp.id
    `;

    try {
      const [rows] = await pool.execute(sql, [id]);
      return { success: true, rows: rows };
    } catch (error) {
      console.error("Error fetching milk pool:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new milk pool
  static async createMilkPool(poolData) {
    const { name, description, milk_type, is_active = true } = poolData;

    const sql = `
      INSERT INTO milk_pools (name, description, milk_type, is_active)
      VALUES (?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [name, description, milk_type, is_active]);
      return { success: true, insertId: result.insertId };
    } catch (error) {
      console.error("Error creating milk pool:", error);
      return { success: false, error: error.message };
    }
  }

  // Update milk pool
  static async updateMilkPool(id, poolData) {
    const { name, description, milk_type, is_active } = poolData;

    const sql = `
      UPDATE milk_pools 
      SET name = ?, description = ?, milk_type = ?, is_active = ?
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [name, description, milk_type, is_active, id]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating milk pool:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete milk pool
  static async deleteMilkPool(id) {
    const sql = `DELETE FROM milk_pools WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [id]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting milk pool:", error);
      return { success: false, error: error.message };
    }
  }

  // Get daily pool allocation
  static async getDailyPoolAllocation(allocation_date, pool_id) {
    const sql = `
      SELECT dpa.*, mp.name as pool_name, mp.milk_type
      FROM daily_pool_allocations dpa
      JOIN milk_pools mp ON dpa.pool_id = mp.id
      WHERE dpa.allocation_date = ? AND dpa.pool_id = ?
    `;

    try {
      const [rows] = await pool.execute(sql, [allocation_date, pool_id]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching daily pool allocation:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all daily pool allocations for a date
  static async getDailyPoolAllocations(allocation_date) {
    const sql = `
      SELECT dpa.*, mp.name as pool_name, mp.milk_type
      FROM daily_pool_allocations dpa
      JOIN milk_pools mp ON dpa.pool_id = mp.id
      WHERE dpa.allocation_date = ?
      ORDER BY mp.milk_type, mp.name
    `;

    try {
      const [rows] = await pool.execute(sql, [allocation_date]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching daily pool allocations:", error);
      return { success: false, error: error.message };
    }
  }

  // Upsert daily pool allocation
  static async upsertDailyPoolAllocation(allocationData) {
    const { allocation_date, pool_id, milk_allocated, notes, created_by } = allocationData;

    try {
      // Get the previous allocation amount to calculate the difference
      const [existingAllocations] = await pool.execute(`SELECT milk_allocated FROM daily_pool_allocations WHERE allocation_date = ? AND pool_id = ?`, [allocation_date, pool_id]);

      const previousAmount = existingAllocations.length > 0 ? parseFloat(existingAllocations[0].milk_allocated) : 0;
      const newAmount = parseFloat(milk_allocated);
      const difference = newAmount - previousAmount;

      // Get pool milk type for inventory update
      const [poolData] = await pool.execute(`SELECT milk_type FROM milk_pools WHERE id = ?`, [pool_id]);

      if (poolData.length === 0) {
        return { success: false, error: "Pool not found" };
      }

      const milkType = poolData[0].milk_type;

      // Update the pool allocation
      const sql = `
        INSERT INTO daily_pool_allocations (allocation_date, pool_id, milk_allocated, notes, created_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        milk_allocated = VALUES(milk_allocated),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP
      `;

      const [result] = await pool.execute(sql, [allocation_date, pool_id, milk_allocated, notes, created_by]);

      // Update inventory quantity_used if there's a difference
      if (difference !== 0) {
        await this.updateInventoryQuantityUsed(allocation_date, milkType, difference);
      }

      return { success: true, insertId: result.insertId };
    } catch (error) {
      console.error("Error upserting daily pool allocation:", error);
      return { success: false, error: error.message };
    }
  }

  // Update inventory quantity_used when allocations change
  static async updateInventoryQuantityUsed(date, milkType, amountChange) {
    try {
      // Get current inventory data
      const [inventoryRows] = await pool.execute(`SELECT quantity_available, quantity_used, quantity_wasted FROM daily_milk_inventory WHERE milk_type = ? AND DATE(inventory_date) = DATE(?)`, [milkType, date]);

      if (inventoryRows.length === 0) {
        console.error(`No inventory found for milk type: ${milkType} on ${date}`);
        return;
      }

      const currentUsed = parseFloat(inventoryRows[0].quantity_used) || 0;
      const newUsed = Math.max(0, currentUsed + amountChange);
      const available = parseFloat(inventoryRows[0].quantity_available) || 0;
      const wasted = parseFloat(inventoryRows[0].quantity_wasted) || 0;
      const newRemaining = Math.max(0, available - newUsed - wasted);

      // Update both quantity_used and quantity_remaining fields
      await pool.execute(
        `UPDATE daily_milk_inventory 
         SET quantity_used = ?, quantity_remaining = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE milk_type = ? AND DATE(inventory_date) = DATE(?)`,
        [newUsed, newRemaining, milkType, date],
      );

      console.log(`Updated ${milkType} quantity_used: ${currentUsed} -> ${newUsed} (change: ${amountChange}), quantity_remaining: ${newRemaining}`);
    } catch (error) {
      console.error("Error updating inventory quantity_used:", error);
    }
  }

  // Delete daily pool allocation
  static async deleteDailyPoolAllocation(allocation_date, pool_id) {
    try {
      // Get the allocation amount before deleting
      const [existingAllocations] = await pool.execute(`SELECT milk_allocated FROM daily_pool_allocations WHERE allocation_date = ? AND pool_id = ?`, [allocation_date, pool_id]);

      if (existingAllocations.length === 0) {
        return { success: false, error: "Allocation not found" };
      }

      const allocatedAmount = parseFloat(existingAllocations[0].milk_allocated);

      // Get pool milk type for inventory update
      const [poolData] = await pool.execute(`SELECT milk_type FROM milk_pools WHERE id = ?`, [pool_id]);

      if (poolData.length === 0) {
        return { success: false, error: "Pool not found" };
      }

      const milkType = poolData[0].milk_type;

      // Delete the allocation
      const [result] = await pool.execute(`DELETE FROM daily_pool_allocations WHERE allocation_date = ? AND pool_id = ?`, [allocation_date, pool_id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "No allocation found to delete" };
      }

      // Update inventory quantity_used (subtract the allocated amount)
      await this.updateInventoryQuantityUsed(allocation_date, milkType, -allocatedAmount);

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting daily pool allocation:", error);
      return { success: false, error: error.message };
    }
  }

  // Get products in a pool
  static async getProductsInPool(pool_id) {
    const sql = `
      SELECT p.*, pc.name as category_name
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.pool_id = ?
      ORDER BY p.name, p.unit_size
    `;

    try {
      const [rows] = await pool.execute(sql, [pool_id]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching products in pool:", error);
      return { success: false, error: error.message };
    }
  }
}
