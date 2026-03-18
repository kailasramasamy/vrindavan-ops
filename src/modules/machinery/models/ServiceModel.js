import pool from "../../../db/pool.js";

export class ServiceModel {
  // Get all service types
  static async getAllServiceTypes() {
    const sql = `
      SELECT 
        st.*,
        mc.name as category_name
      FROM service_types st
      LEFT JOIN machine_categories mc ON st.category_id = mc.id
      WHERE st.is_active = true
      ORDER BY st.name
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching service types:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service type by ID
  static async getServiceTypeById(id) {
    const sql = `
      SELECT 
        st.*,
        mc.name as category_name
      FROM service_types st
      LEFT JOIN machine_categories mc ON st.category_id = mc.id
      WHERE st.id = ? AND st.is_active = true
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, rows: rows[0] || null };
    } catch (error) {
      console.error("Error fetching service type:", error);
      return { success: false, error: error.message };
    }
  }

  // Create service type
  static async createServiceType(serviceTypeData) {
    const { name, description, category_id, estimated_duration_hours, estimated_cost } = serviceTypeData;

    const sql = `
      INSERT INTO service_types (name, description, category_id, estimated_duration_hours, estimated_cost)
      VALUES (?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [name, description, category_id, estimated_duration_hours, estimated_cost]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating service type:", error);
      return { success: false, error: error.message };
    }
  }

  // Update service type
  static async updateServiceType(id, serviceTypeData) {
    const { name, description, category_id, estimated_duration_hours, estimated_cost } = serviceTypeData;

    // Convert empty string to null for category_id
    const processedCategoryId = category_id === "" ? null : category_id;

    const sql = `
      UPDATE service_types 
      SET name = ?, description = ?, category_id = ?, estimated_duration_hours = ?, estimated_cost = ?
      WHERE id = ?
    `;

    const params = [name, description, processedCategoryId, estimated_duration_hours, estimated_cost, id];

    try {
      const [result] = await pool.execute(sql, params);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating service type:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete service type (soft delete)
  static async deleteServiceType(id) {
    const sql = `UPDATE service_types SET is_active = false WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting service type:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service schedules
  static async getServiceSchedules(filters = {}) {
    const { machine_id, overdue_only = false } = filters;

    let sql = `
      SELECT 
        ss.*,
        m.name as machine_name,
        m.serial_number,
        m.images as machine_images,
        mc.name as category_name,
        mc.color as category_color,
        st.name as service_type_name,
        st.estimated_cost,
        DATEDIFF(ss.next_service_date, CURDATE()) as days_until_due
      FROM service_schedules ss
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON ss.service_type_id = st.id
      WHERE ss.is_active = true
    `;

    const params = [];

    if (machine_id) {
      sql += ` AND ss.machine_id = ?`;
      params.push(machine_id);
    }

    if (overdue_only) {
      sql += ` AND ss.next_service_date <= CURDATE()`;
    }

    sql += ` ORDER BY ss.next_service_date ASC`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching service schedules:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service schedule by ID
  static async getServiceScheduleById(id) {
    const sql = `
      SELECT 
        ss.*,
        m.name as machine_name,
        m.serial_number,
        m.location,
        m.images as machine_images,
        mc.name as category_name,
        mc.color as category_color,
        st.name as service_type_name,
        st.description as service_type_description,
        st.estimated_cost,
        st.estimated_duration_hours,
        DATEDIFF(ss.next_service_date, CURDATE()) as days_until_due
      FROM service_schedules ss
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON ss.service_type_id = st.id
      WHERE ss.id = ? AND ss.is_active = true
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(id)]);
      if (rows.length > 0) {
        return { success: true, schedule: rows[0] };
      } else {
        return { success: false, error: "Service schedule not found" };
      }
    } catch (error) {
      console.error("Error fetching service schedule by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Create service schedule
  static async createServiceSchedule(scheduleData) {
    const { machine_id, service_type_id, frequency_type, frequency_value, frequency_unit, next_service_date, last_service_date, notes } = scheduleData;

    const sql = `
      INSERT INTO service_schedules (
        machine_id, service_type_id, frequency_type, frequency_value, frequency_unit,
        next_service_date, last_service_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id, service_type_id, frequency_type, frequency_value, frequency_unit, next_service_date, last_service_date, notes]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating service schedule:", error);
      return { success: false, error: error.message };
    }
  }

  // Update service schedule
  static async updateServiceSchedule(id, scheduleData) {
    const { machine_id, service_type_id, frequency_type, frequency_value, frequency_unit, next_service_date, last_service_date, notes } = scheduleData;

    const sql = `
      UPDATE service_schedules 
      SET machine_id = ?, service_type_id = ?, frequency_type = ?, frequency_value = ?,
          frequency_unit = ?, next_service_date = ?, last_service_date = ?, notes = ?
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id, service_type_id, frequency_type, frequency_value, frequency_unit, next_service_date, last_service_date, notes, parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating service schedule:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete service schedule
  static async deleteServiceSchedule(id) {
    const sql = `UPDATE service_schedules SET is_active = false WHERE id = ?`;

    try {
      const [result] = await pool.execute(sql, [parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting service schedule:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service history
  static async getServiceHistory(filters = {}) {
    const { machine_id, service_type_id, start_date, end_date, limit = 50 } = filters;

    let sql = `
      SELECT 
        sh.*,
        m.name as machine_name,
        m.serial_number,
        m.images as machine_images,
        mc.name as category_name,
        mc.color as category_color,
        st.name as service_type_name
      FROM service_history sh
      LEFT JOIN machines m ON sh.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON sh.service_type_id = st.id
      WHERE 1=1
    `;

    const params = [];

    if (machine_id) {
      sql += ` AND sh.machine_id = ?`;
      params.push(machine_id);
    }

    if (service_type_id) {
      sql += ` AND sh.service_type_id = ?`;
      params.push(service_type_id);
    }

    if (start_date) {
      sql += ` AND sh.service_date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      sql += ` AND sh.service_date <= ?`;
      params.push(end_date);
    }

    sql += ` ORDER BY sh.service_date DESC LIMIT ${parseInt(limit)}`;

    try {
      const [rows] = await pool.execute(sql, params);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching service history:", error);
      return { success: false, error: error.message };
    }
  }

  // Create service history record
  static async createServiceHistory(serviceData) {
    const { machine_id, service_type_id, service_date, service_provider, technician_name, description, parts_used, labor_hours, total_cost, status, next_service_due, notes, images, invoice_file } = serviceData;

    const sql = `
      INSERT INTO service_history (
        machine_id, service_type_id, service_date, service_provider, technician_name,
        description, parts_used, labor_hours, total_cost, status, next_service_due, notes, images, invoice_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id, service_type_id, service_date, service_provider, technician_name, description, JSON.stringify(parts_used), labor_hours, total_cost, status, next_service_due, notes, JSON.stringify(images), invoice_file]);
      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating service history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get service record by ID
  static async getServiceRecordById(id) {
    const sql = `
      SELECT 
        sh.*,
        m.name as machine_name,
        m.serial_number,
        mc.name as category_name,
        st.name as service_type_name,
        si.invoice_number,
        si.total_amount,
        si.payment_status
      FROM service_history sh
      LEFT JOIN machines m ON sh.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON sh.service_type_id = st.id
      LEFT JOIN service_invoices si ON sh.id = si.service_history_id
      WHERE sh.id = ?
    `;

    try {
      const [rows] = await pool.execute(sql, [parseInt(id)]);
      if (rows.length > 0) {
        return { success: true, record: rows[0] };
      } else {
        return { success: false, error: "Service record not found" };
      }
    } catch (error) {
      console.error("Error fetching service record by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Update service history
  static async updateServiceHistory(id, serviceData) {
    const { machine_id, service_type_id, service_date, service_provider, technician_name, description, parts_used, labor_hours, total_cost, status, next_service_due, notes, images, invoice_file } = serviceData;

    const sql = `
      UPDATE service_history 
      SET machine_id = ?, service_type_id = ?, service_date = ?, service_provider = ?, technician_name = ?,
          description = ?, parts_used = ?, labor_hours = ?, total_cost = ?, status = ?, 
          next_service_due = ?, notes = ?, images = ?, invoice_file = ?
      WHERE id = ?
    `;

    try {
      const [result] = await pool.execute(sql, [machine_id, service_type_id, service_date, service_provider, technician_name, description, JSON.stringify(parts_used), labor_hours, total_cost, status, next_service_due, notes, JSON.stringify(images), invoice_file, parseInt(id)]);
      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating service history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get upcoming services dashboard
  static async getUpcomingServicesDashboard(limit = 10) {
    const sql = `
      SELECT 
        ss.*,
        m.name as machine_name,
        m.serial_number,
        m.location,
        m.images as machine_images,
        mc.name as category_name,
        mc.color as category_color,
        st.name as service_type_name,
        st.estimated_cost,
        DATEDIFF(ss.next_service_date, CURDATE()) as days_until_due
      FROM service_schedules ss
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON ss.service_type_id = st.id
      WHERE ss.is_active = true AND ss.next_service_date >= CURDATE()
      ORDER BY ss.next_service_date ASC
      LIMIT ${parseInt(limit)}
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching upcoming services:", error);
      return { success: false, error: error.message };
    }
  }

  // Get overdue services
  static async getOverdueServices(limit = 10) {
    const sql = `
      SELECT 
        ss.*,
        m.name as machine_name,
        m.serial_number,
        m.location,
        mc.name as category_name,
        mc.color as category_color,
        st.name as service_type_name,
        st.estimated_cost,
        DATEDIFF(CURDATE(), ss.next_service_date) as days_overdue
      FROM service_schedules ss
      LEFT JOIN machines m ON ss.machine_id = m.id
      LEFT JOIN machine_categories mc ON m.category_id = mc.id
      LEFT JOIN service_types st ON ss.service_type_id = st.id
      WHERE ss.is_active = true AND ss.next_service_date < CURDATE()
      ORDER BY ss.next_service_date ASC
      LIMIT ${parseInt(limit)}
    `;

    try {
      const [rows] = await pool.execute(sql);
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching overdue services:", error);
      return { success: false, error: error.message };
    }
  }
}
