import pool from "../db/pool.js";

export class ProductMappingModel {
  // Get all mappings
  static async getAllMappings() {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          pm.*,
          COALESCE(p.name_alias, p.name) as product_name,
          p.unit_size as product_unit_size,
          p.milk_type,
          pc.name as category_name
        FROM product_mappings pm
        LEFT JOIN products p ON pm.product_id = p.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        ORDER BY pm.source, pm.external_name`,
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching product mappings:", error);
      return { success: false, error: error.message };
    }
  }

  // Get mappings by source
  static async getMappingsBySource(source) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          pm.*,
          COALESCE(p.name_alias, p.name) as product_name,
          p.unit_size as product_unit_size,
          p.milk_type
        FROM product_mappings pm
        LEFT JOIN products p ON pm.product_id = p.id
        WHERE pm.source = ? AND pm.is_active = 1
        ORDER BY pm.external_name`,
        [source],
      );
      return { success: true, rows };
    } catch (error) {
      console.error("Error fetching mappings by source:", error);
      return { success: false, error: error.message };
    }
  }

  // Find product by external name
  static async findProductByExternalName(source, externalName, externalUnitSize = null) {
    try {
      let query = `
        SELECT p.* 
        FROM product_mappings pm
        JOIN products p ON pm.product_id = p.id
        WHERE pm.source = ? 
          AND pm.external_name = ?
          AND pm.is_active = 1
      `;
      const params = [source, externalName];

      if (externalUnitSize) {
        query += ` AND pm.external_unit_size = ?`;
        params.push(externalUnitSize);
      }

      query += ` LIMIT 1`;

      const [rows] = await pool.execute(query, params);
      return { success: true, product: rows[0] || null };
    } catch (error) {
      console.error("Error finding product by external name:", error);
      return { success: false, error: error.message };
    }
  }

  // Create mapping
  static async createMapping(data) {
    try {
      const { product_id, source, external_name, external_unit_size, notes } = data;

      await pool.execute(
        `INSERT INTO product_mappings 
        (product_id, source, external_name, external_unit_size, notes)
        VALUES (?, ?, ?, ?, ?)`,
        [product_id, source, external_name, external_unit_size || null, notes || null],
      );

      return { success: true };
    } catch (error) {
      console.error("Error creating mapping:", error);
      return { success: false, error: error.message };
    }
  }

  // Update mapping
  static async updateMapping(id, data) {
    try {
      const { product_id, source, external_name, external_unit_size, is_active, notes } = data;

      await pool.execute(
        `UPDATE product_mappings 
        SET product_id = ?, source = ?, external_name = ?, 
            external_unit_size = ?, is_active = ?, notes = ?
        WHERE id = ?`,
        [product_id, source, external_name, external_unit_size || null, is_active, notes || null, id],
      );

      return { success: true };
    } catch (error) {
      console.error("Error updating mapping:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete mapping
  static async deleteMapping(id) {
    try {
      await pool.execute(`DELETE FROM product_mappings WHERE id = ?`, [id]);
      return { success: true };
    } catch (error) {
      console.error("Error deleting mapping:", error);
      return { success: false, error: error.message };
    }
  }

  // Bulk create mappings from array
  static async bulkCreateMappings(mappings) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const mapping of mappings) {
        await connection.execute(
          `INSERT INTO product_mappings 
          (product_id, source, external_name, external_unit_size, notes)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            product_id = VALUES(product_id),
            is_active = 1`,
          [mapping.product_id, mapping.source, mapping.external_name, mapping.external_unit_size || null, mapping.notes || null],
        );
      }

      await connection.commit();
      return { success: true, count: mappings.length };
    } catch (error) {
      await connection.rollback();
      console.error("Error bulk creating mappings:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }
}
