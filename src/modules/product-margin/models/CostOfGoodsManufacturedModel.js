import pool from "../../../db/pool.js";

class CostOfGoodsManufacturedModel {
  /**
   * Get all COGM records with product details (including products without COGM)
   */
  static async getAllCOGM() {
    try {
      const query = `
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.name_alias as product_name_alias,
          p.grammage,
          p.unit_size,
          p.category_id,
          p.subcategory_id,
          pc.name as category_name,
          psc.name as subcategory_name,
          COALESCE(cogm.id, NULL) as cogm_id,
          COALESCE(cogm.sourcing_cost, 0) as sourcing_cost,
          COALESCE(cogm.transport_cost, 0) as transport_cost,
          COALESCE(cogm.packing_cost, 0) as packing_cost,
          COALESCE(cogm.delivery_cost, 0) as delivery_cost,
          COALESCE(cogm.software_cost, 0) as software_cost,
          COALESCE(cogm.payment_gateway_cost, 0) as payment_gateway_cost,
          cogm.details as details,
          COALESCE(cogm.total_cost, 0) as total_cost
        FROM products p
        LEFT JOIN cost_of_goods_manufactured cogm ON p.id = cogm.product_id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_subcategories psc ON p.subcategory_id = psc.id
        ORDER BY p.name, p.unit_size
      `;
      const [rows] = await pool.execute(query);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching COGM records:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get COGM by product ID
   */
  static async getCOGMByProductId(productId) {
    try {
      const query = `
        SELECT 
          cogm.*,
          p.id as product_id,
          p.name as product_name,
          p.name_alias as product_name_alias,
          p.grammage,
          p.unit_size,
          p.cost_price,
          cogm.details
        FROM cost_of_goods_manufactured cogm
        INNER JOIN products p ON cogm.product_id = p.id
        WHERE cogm.product_id = ?
      `;
      const [rows] = await pool.execute(query, [productId]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      console.error("Error fetching COGM by product ID:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get COGM by ID
   */
  static async getCOGMById(id) {
    try {
      const query = `
        SELECT 
          cogm.*,
          p.id as product_id,
          p.name as product_name,
          p.name_alias as product_name_alias,
          p.grammage,
          p.unit_size,
          p.cost_price,
          cogm.details
        FROM cost_of_goods_manufactured cogm
        INNER JOIN products p ON cogm.product_id = p.id
        WHERE cogm.id = ?
      `;
      const [rows] = await pool.execute(query, [id]);
      return { success: true, data: rows[0] || null };
    } catch (error) {
      console.error("Error fetching COGM by ID:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create or update COGM record
   */
  static async upsertCOGM(productId, costData) {
    try {
      const {
        sourcing_cost = 0,
        transport_cost = 0,
        packing_cost = 0,
        delivery_cost = 0,
        software_cost = 0,
        payment_gateway_cost = 0,
        details = null,
      } = costData;

      // Calculate total cost
      const total_cost = 
        parseFloat(sourcing_cost || 0) +
        parseFloat(transport_cost || 0) +
        parseFloat(packing_cost || 0) +
        parseFloat(delivery_cost || 0) +
        parseFloat(software_cost || 0) +
        parseFloat(payment_gateway_cost || 0);

      // Check if record exists
      const checkQuery = `SELECT id FROM cost_of_goods_manufactured WHERE product_id = ?`;
      const [existing] = await pool.execute(checkQuery, [productId]);

      if (existing.length > 0) {
        // Update existing record
        const updateQuery = `
          UPDATE cost_of_goods_manufactured SET
            sourcing_cost = ?,
            transport_cost = ?,
            packing_cost = ?,
            delivery_cost = ?,
            software_cost = ?,
            payment_gateway_cost = ?,
            details = ?,
            total_cost = ?,
            updated_at = NOW()
          WHERE product_id = ?
        `;
        const [result] = await pool.execute(updateQuery, [
          sourcing_cost,
          transport_cost,
          packing_cost,
          delivery_cost,
          software_cost,
          payment_gateway_cost,
          details,
          total_cost,
          productId,
        ]);

        // Update products.cost_price (trigger should handle this, but doing it explicitly for safety)
        await pool.execute(
          `UPDATE products SET cost_price = ?, updated_at = NOW() WHERE id = ?`,
          [total_cost, productId]
        );

        return { success: true, data: { id: existing[0].id, updated: true } };
      } else {
        // Insert new record
        const insertQuery = `
          INSERT INTO cost_of_goods_manufactured (
            product_id,
            sourcing_cost,
            transport_cost,
            packing_cost,
            delivery_cost,
            software_cost,
            payment_gateway_cost,
            details,
            total_cost,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        const [result] = await pool.execute(insertQuery, [
          productId,
          sourcing_cost,
          transport_cost,
          packing_cost,
          delivery_cost,
          software_cost,
          payment_gateway_cost,
          details,
          total_cost,
        ]);

        // Update products.cost_price (trigger should handle this, but doing it explicitly for safety)
        await pool.execute(
          `UPDATE products SET cost_price = ?, updated_at = NOW() WHERE id = ?`,
          [total_cost, productId]
        );

        return { success: true, data: { id: result.insertId, updated: false } };
      }
    } catch (error) {
      console.error("Error upserting COGM:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete COGM record
   */
  static async deleteCOGM(id) {
    try {
      const query = `DELETE FROM cost_of_goods_manufactured WHERE id = ?`;
      const [result] = await pool.execute(query, [id]);
      return { success: true, data: { deleted: result.affectedRows > 0 } };
    } catch (error) {
      console.error("Error deleting COGM:", error);
      return { success: false, error: error.message };
    }
  }
}

export default CostOfGoodsManufacturedModel;

