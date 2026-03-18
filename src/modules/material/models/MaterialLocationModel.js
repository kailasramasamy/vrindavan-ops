import pool from "../../../db/pool.js";

export class MaterialLocationModel {
  // Get all locations
  static async getAll() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT 
        ml.*,
        COUNT(ms.id) as stock_items_count,
        SUM(ms.on_hand_qty) as total_quantity
      FROM material_locations ml
      LEFT JOIN material_stock ms ON ml.id = ms.location_id
      WHERE ml.is_active = true
      GROUP BY ml.id
      ORDER BY ml.name ASC
    `);

    return { rows };
  }

  // Get location by ID
  static async getById(id) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT * FROM material_locations 
      WHERE id = ? AND is_active = true
    `,
      [id],
    );

    return rows[0] || null;
  }

  // Create new location
  static async create(locationData) {
    if (!pool) return null;

    const { name, description, location_type } = locationData;
    const [result] = await pool.query(
      `
      INSERT INTO material_locations (name, description, location_type) 
      VALUES (?, ?, ?)
    `,
      [name, description, location_type],
    );

    return { id: result.insertId };
  }

  // Update location
  static async update(id, locationData) {
    if (!pool) return false;

    const { name, description, location_type } = locationData;
    const [result] = await pool.query(
      `
      UPDATE material_locations 
      SET name = ?, description = ?, location_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = true
    `,
      [name, description, location_type, id],
    );

    return result.affectedRows > 0;
  }

  // Deactivate location
  static async deactivate(id) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      UPDATE material_locations 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [id],
    );

    return result.affectedRows > 0;
  }
}
