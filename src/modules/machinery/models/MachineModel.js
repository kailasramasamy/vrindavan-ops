import pool from "../../../db/pool.js";

export class MachineModel {
  // Get all machines with category information
  static async getAllMachines(filters = {}) {
    const { category_id, status, location } = filters;

    let sql = `
      SELECT 
        m.*,
        mc.name as category_name,
        mc.color as category_color,
        mc.icon as category_icon,
        COUNT(sh.id) as service_count,
        MAX(sh.service_date) as last_service_date,
        COUNT(CASE WHEN ss.next_service_date <= CURDATE() THEN 1 END) as overdue_services
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_history sh ON m.id = sh.machine_id
      LEFT JOIN service_schedules ss ON m.id = ss.machine_id AND ss.is_active = true
      WHERE m.is_active = true
    `;

    const params = [];

    if (category_id) {
      sql += ` AND m.category_id = ?`;
      params.push(category_id);
    }

    if (status) {
      sql += ` AND m.status = ?`;
      params.push(status);
    }

    if (location) {
      sql += ` AND m.location LIKE ?`;
      params.push(`%${location}%`);
    }

    sql += ` GROUP BY m.id ORDER BY m.name`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching machines:", error);
      return { success: false, error: error.message };
    }
  }

  // Get machine by ID with detailed information
  static async getMachineById(id) {
    const sql = `
      SELECT 
        m.*,
        mc.name as category_name,
        mc.color as category_color,
        mc.icon as category_icon,
        COUNT(sh.id) as service_count,
        MAX(sh.service_date) as last_service_date,
        COUNT(CASE WHEN ss.next_service_date <= CURDATE() THEN 1 END) as overdue_services
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_history sh ON m.id = sh.machine_id
      LEFT JOIN service_schedules ss ON m.id = ss.machine_id AND ss.is_active = true
      WHERE m.id = ? AND m.is_active = true
      GROUP BY m.id
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching machine:", error);
      return { success: false, error: error.message };
    }
  }

  // Create new machine
  static async createMachine(machineData) {
    const { category_id, name, model, serial_number, manufacturer, purchase_date, purchase_cost, current_value, location, status, description, specifications, images, warranty_expiry, insurance_expiry, year_of_manufacturing, capacity, power_kw, voltage_v, phase, manufacturer_address, manufacturer_phone, manufacturer_email, manufacturer_website, manufacturer_contact_person, service_technician_name, service_technician_phone, service_technician_email, service_technician_company, backup_technician_name, backup_technician_phone } = machineData;

    const sql = `
      INSERT INTO machines (
        category_id, name, model, serial_number, manufacturer, purchase_date,
        purchase_cost, current_value, location, status, description,
        specifications, images, warranty_expiry, insurance_expiry,
        year_of_manufacturing, capacity, power_kw, voltage_v, phase,
        manufacturer_address, manufacturer_phone, manufacturer_email, manufacturer_website, manufacturer_contact_person,
        service_technician_name, service_technician_phone, service_technician_email, service_technician_company,
        backup_technician_name, backup_technician_phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      // Convert undefined values to null for SQL
      const params = [category_id || null, name || null, model || null, serial_number || null, manufacturer || null, purchase_date || null, purchase_cost || null, current_value || null, location || null, status || null, description || null, specifications ? JSON.stringify(specifications) : null, images ? JSON.stringify(images) : null, warranty_expiry || null, insurance_expiry || null, year_of_manufacturing || null, capacity || null, power_kw || null, voltage_v || null, phase || null, manufacturer_address || null, manufacturer_phone || null, manufacturer_email || null, manufacturer_website || null, manufacturer_contact_person || null, service_technician_name || null, service_technician_phone || null, service_technician_email || null, service_technician_company || null, backup_technician_name || null, backup_technician_phone || null];

      const [result] = await pool.execute(sql, params);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating machine:", error);
      return { success: false, error: error.message };
    }
  }

  // Update machine
  static async updateMachine(id, machineData) {
    const { category_id, name, model, serial_number, manufacturer, purchase_date, purchase_cost, current_value, location, status, description, specifications, images, warranty_expiry, insurance_expiry, year_of_manufacturing, capacity, power_kw, voltage_v, phase, manufacturer_address, manufacturer_phone, manufacturer_email, manufacturer_website, manufacturer_contact_person, service_technician_name, service_technician_phone, service_technician_email, service_technician_company, backup_technician_name, backup_technician_phone } = machineData;

    const sql = `
      UPDATE machines 
      SET category_id = ?, name = ?, model = ?, serial_number = ?, manufacturer = ?,
          purchase_date = ?, purchase_cost = ?, current_value = ?, location = ?,
          status = ?, description = ?, specifications = ?, images = ?,
          warranty_expiry = ?, insurance_expiry = ?, year_of_manufacturing = ?,
          capacity = ?, power_kw = ?, voltage_v = ?, phase = ?,
          manufacturer_address = ?, manufacturer_phone = ?, manufacturer_email = ?, manufacturer_website = ?, manufacturer_contact_person = ?,
          service_technician_name = ?, service_technician_phone = ?, service_technician_email = ?, service_technician_company = ?,
          backup_technician_name = ?, backup_technician_phone = ?
      WHERE id = ?
    `;

    try {
      // Convert undefined values to null for SQL
      const params = [category_id || null, name || null, model || null, serial_number || null, manufacturer || null, purchase_date || null, purchase_cost || null, current_value || null, location || null, status || null, description || null, specifications ? JSON.stringify(specifications) : null, images ? JSON.stringify(images) : null, warranty_expiry || null, insurance_expiry || null, year_of_manufacturing || null, capacity || null, power_kw || null, voltage_v || null, phase || null, manufacturer_address || null, manufacturer_phone || null, manufacturer_email || null, manufacturer_website || null, manufacturer_contact_person || null, service_technician_name || null, service_technician_phone || null, service_technician_email || null, service_technician_company || null, backup_technician_name || null, backup_technician_phone || null, id];

      const [result] = await pool.execute(sql, params);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating machine:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete machine (soft delete)
  static async deleteMachine(id) {
    const sql = `UPDATE machines SET is_active = false WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting machine:", error);
      return { success: false, error: error.message };
    }
  }

  // Get machine dashboard statistics
  static async getMachineStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_machines,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_machines,
        COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_machines,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_machines,
        COUNT(CASE WHEN status = 'retired' THEN 1 END) as retired_machines,
        COUNT(CASE WHEN warranty_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as warranty_expiring_soon,
        COUNT(CASE WHEN insurance_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as insurance_expiring_soon
      FROM machines 
      WHERE is_active = true
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows: rows[0] || {} };
    } catch (error) {
      console.error("Error fetching machine statistics:", error);
      return { success: false, error: error.message };
    }
  }

  // Get upcoming services for a machine
  static async getUpcomingServices(machineId, limit = 5) {
    const limitInt = Number(limit) || 5;
    const sql = `
      SELECT 
        ss.*,
        st.name as service_type_name,
        st.description as service_type_description,
        st.estimated_cost,
        DATEDIFF(ss.next_service_date, CURDATE()) as days_until_due
      FROM service_schedules ss
      LEFT JOIN service_types st ON ss.service_type_id = st.id
      WHERE ss.machine_id = ? AND ss.is_active = true
      ORDER BY ss.next_service_date ASC
      LIMIT ${limitInt}
    `;

    try {
      const machineIdInt = Number(machineId);
      const [rows] = await pool.execute(sql, [machineIdInt]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching upcoming services:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service history for a machine
  static async getServiceHistory(machineId, limit = 10) {
    const limitInt = Number(limit) || 10;
    const sql = `
      SELECT 
        sh.*,
        st.name as service_type_name,
        si.invoice_number,
        si.total_amount,
        si.payment_status
      FROM service_history sh
      LEFT JOIN service_types st ON sh.service_type_id = st.id
      LEFT JOIN service_invoices si ON sh.id = si.service_history_id
      WHERE sh.machine_id = ?
      ORDER BY sh.service_date DESC
      LIMIT ${limitInt}
    `;

    try {
      const machineIdInt = Number(machineId);
      const [rows] = await pool.execute(sql, [machineIdInt]);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching service history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get top machines for dashboard
  static async getTopMachines(limit = 5) {
    const limitInt = Number(limit) || 5;
    const sql = `
      SELECT 
        m.id,
        m.name,
        m.model,
        m.serial_number,
        m.manufacturer,
        m.status,
        m.location,
        m.purchase_date,
        m.current_value,
        m.images,
        mc.name as category_name,
        mc.color as category_color,
        mc.icon as category_icon,
        (SELECT COUNT(*) FROM service_history sh WHERE sh.machine_id = m.id) as service_count,
        (SELECT MAX(sh.service_date) FROM service_history sh WHERE sh.machine_id = m.id) as last_service_date,
        (SELECT COUNT(*) FROM service_schedules ss WHERE ss.machine_id = m.id AND ss.is_active = true AND ss.next_service_date <= CURDATE()) as overdue_services,
        (SELECT COUNT(*) FROM machine_issues mi WHERE mi.machine_id = m.id AND mi.status IN ('open', 'in_progress')) as active_issues,
        (SELECT COUNT(*) FROM machine_issues mi WHERE mi.machine_id = m.id AND mi.status = 'pending') as pending_issues
      FROM machines m
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      WHERE m.is_active = true
      ORDER BY m.name ASC
      LIMIT ${limitInt}
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching top machines:", error);
      return { success: false, error: error.message };
    }
  }
}
