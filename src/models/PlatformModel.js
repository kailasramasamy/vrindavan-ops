import { marketingPool } from "../db/marketingPool.js";

class PlatformModel {
  // Get all platforms
  static async getAll(filters = {}) {
    let query = `
      SELECT * FROM ad_platforms
    `;

    const conditions = [];
    const values = [];

    if (filters.is_active !== undefined) {
      conditions.push("is_active = ?");
      values.push(filters.is_active ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY name ASC";

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting platforms:", error);
      throw error;
    }
  }

  // Get platform by ID
  static async getById(id) {
    const query = `SELECT * FROM ad_platforms WHERE id = ?`;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting platform by ID:", error);
      throw error;
    }
  }

  // Get platform by code
  static async getByCode(code) {
    const query = `SELECT * FROM ad_platforms WHERE code = ?`;

    try {
      const [rows] = await marketingPool.execute(query, [code]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting platform by code:", error);
      throw error;
    }
  }
}

export default PlatformModel;

