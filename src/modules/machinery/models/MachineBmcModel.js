import pool from "../../../db/pool.js";

export class MachineBmcModel {
  // Get BMC details for a machine (from main machines table)
  static async getBmcDetails(machineId) {
    const sql = `
      SELECT 
        m.*,
        mc.name as category_name
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      WHERE m.id = ? AND mc.name = 'BMC'
    `;

    try {
      const [rows] = await pool.execute(sql, [machineId]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching BMC details:", error);
      return { success: false, error: error.message };
    }
  }

  // Create BMC details for a machine (update main machines table)
  static async createBmcDetails(machineId, bmcData) {
    const { capacity, power, voltage, cooling_temperature, compressor_type, refrigerant_type, insulation_thickness } = bmcData;

    const sql = `
      UPDATE machines 
      SET capacity = ?, power_kw = ?, voltage_v = ?, 
          specifications = JSON_SET(COALESCE(specifications, '{}'), 
            '$.cooling_temperature', ?,
            '$.compressor_type', ?,
            '$.refrigerant_type', ?,
            '$.insulation_thickness', ?
          )
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [capacity, power, voltage, cooling_temperature, compressor_type, refrigerant_type, insulation_thickness, machineId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error creating BMC details:", error);
      return { success: false, error: error.message };
    }
  }

  // Update BMC details for a machine (update main machines table)
  static async updateBmcDetails(machineId, bmcData) {
    const { capacity, power, voltage, cooling_temperature, compressor_type, refrigerant_type, insulation_thickness } = bmcData;

    const sql = `
      UPDATE machines 
      SET capacity = ?, power_kw = ?, voltage_v = ?, 
          specifications = JSON_SET(COALESCE(specifications, '{}'), 
            '$.cooling_temperature', ?,
            '$.compressor_type', ?,
            '$.refrigerant_type', ?,
            '$.insulation_thickness', ?
          )
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [capacity, power, voltage, cooling_temperature, compressor_type, refrigerant_type, insulation_thickness, machineId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating BMC details:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete BMC details for a machine (reset BMC-specific fields in main table)
  static async deleteBmcDetails(machineId) {
    const sql = `
      UPDATE machines 
      SET capacity = NULL, power_kw = NULL, voltage_v = NULL,
          specifications = JSON_REMOVE(COALESCE(specifications, '{}'), 
            '$.cooling_temperature', '$.compressor_type', 
            '$.refrigerant_type', '$.insulation_thickness'
          )
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [machineId]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting BMC details:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all BMC machines with their details
  static async getAllBmcMachines() {
    const sql = `
      SELECT 
        m.*,
        mc.name as category_name,
        mc.color as category_color,
        COUNT(sh.id) as service_count,
        MAX(sh.service_date) as last_service_date
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_history sh ON m.id = sh.machine_id
      WHERE mc.name = 'BMC' AND m.is_active = true
      GROUP BY m.id
      ORDER BY m.name
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching BMC machines:", error);
      return { success: false, error: error.message };
    }
  }

  // Get BMC statistics
  static async getBmcStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_bmc_machines,
        SUM(m.capacity) as total_capacity,
        AVG(m.capacity) as avg_capacity,
        SUM(m.power_kw) as total_power_consumption,
        AVG(m.power_kw) as avg_power_consumption,
        COUNT(CASE WHEN m.status = 'active' THEN 1 END) as active_bmc_machines,
        COUNT(CASE WHEN m.status = 'maintenance' THEN 1 END) as maintenance_bmc_machines
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      WHERE mc.name = 'BMC' AND m.is_active = true
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows: rows[0] || {} };
    } catch (error) {
      console.error("Error fetching BMC statistics:", error);
      return { success: false, error: error.message };
    }
  }

  // Check if machine is BMC type
  static async isBmcMachine(machineId) {
    const sql = `
      SELECT mc.name as category_name
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      WHERE m.id = ? AND mc.name = 'BMC'
    `;

    try {
      const [rows] = await pool.execute(sql, [machineId]);
      return { success: true, isBmc: rows.length > 0 };
    } catch (error) {
      console.error("Error checking BMC machine:", error);
      return { success: false, error: error.message };
    }
  }
}
