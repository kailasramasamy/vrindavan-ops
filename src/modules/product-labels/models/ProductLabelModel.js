import { opsPool } from "../../../db/pool.js";

export class ProductLabelModel {
  static async listLabels({ limit = 100, offset = 0, search = "", productId = null, active = null } = {}) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      let query = `
        SELECT 
          pl.id,
          pl.product_id,
          pl.name,
          pl.unit_size,
          pl.label_type,
          pl.label_material,
          pl.cutting,
          pl.design_file_path,
          pl.design_file_name,
          pl.notes,
          pl.active,
          pl.created_by,
          pl.created_at,
          pl.updated_at,
          p.name as product_name,
          p.unit_size as product_unit
        FROM product_labels pl
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE 1=1
      `;
      const params = [];

      if (search) {
        query += " AND (pl.name LIKE ? OR p.name LIKE ?)";
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      if (productId) {
        query += " AND pl.product_id = ?";
        params.push(productId);
      }

      if (active !== null) {
        query += " AND pl.active = ?";
        params.push(active ? 1 : 0);
      }

      query += " ORDER BY pl.name ASC LIMIT ? OFFSET ?";
      params.push(Number(limit), Number(offset));

      const [labels] = await opsPool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM product_labels pl
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE 1=1
      `;
      const countParams = [];

      if (search) {
        countQuery += " AND (pl.name LIKE ? OR p.name LIKE ?)";
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm);
      }

      if (productId) {
        countQuery += " AND pl.product_id = ?";
        countParams.push(productId);
      }

      if (active !== null) {
        countQuery += " AND pl.active = ?";
        countParams.push(active ? 1 : 0);
      }

      const [countResult] = await opsPool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      return { success: true, labels, total };
    } catch (error) {
      console.error("ProductLabelModel.listLabels error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getLabelById(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await opsPool.query(
        `SELECT 
          pl.*,
          p.name as product_name,
          p.unit_size as product_unit
        FROM product_labels pl
        LEFT JOIN products p ON p.id = pl.product_id
        WHERE pl.id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return { success: false, error: "Label not found" };
      }

      return { success: true, label: rows[0] };
    } catch (error) {
      console.error("ProductLabelModel.getLabelById error:", error);
      return { success: false, error: error.message };
    }
  }

  static async createLabel(labelData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        product_id,
        name,
        unit_size,
        label_type = "sticker",
        label_material = "white pvc",
        cutting = "Full",
        design_file_path,
        design_file_name,
        notes,
        active = 1,
        created_by,
      } = labelData;

      const [result] = await opsPool.query(
        `INSERT INTO product_labels 
        (product_id, name, unit_size, label_type, label_material, cutting, design_file_path, design_file_name, notes, active, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, name, unit_size || null, label_type, label_material, cutting, design_file_path || null, design_file_name || null, notes || null, active, created_by || null]
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("ProductLabelModel.createLabel error:", error);
      return { success: false, error: error.message };
    }
  }

  static async updateLabel(id, labelData) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        product_id,
        name,
        unit_size,
        label_type,
        label_material,
        cutting,
        design_file_path,
        design_file_name,
        notes,
        active,
      } = labelData;

      const fields = [];
      const values = [];

      if (product_id !== undefined) {
        fields.push("product_id = ?");
        values.push(product_id);
      }
      if (name !== undefined) {
        fields.push("name = ?");
        values.push(name);
      }
      if (unit_size !== undefined) {
        fields.push("unit_size = ?");
        values.push(unit_size);
      }
      if (label_type !== undefined) {
        fields.push("label_type = ?");
        values.push(label_type);
      }
      if (label_material !== undefined) {
        fields.push("label_material = ?");
        values.push(label_material);
      }
      if (cutting !== undefined) {
        fields.push("cutting = ?");
        values.push(cutting);
      }
      if (design_file_path !== undefined) {
        fields.push("design_file_path = ?");
        values.push(design_file_path);
      }
      if (design_file_name !== undefined) {
        fields.push("design_file_name = ?");
        values.push(design_file_name);
      }
      if (notes !== undefined) {
        fields.push("notes = ?");
        values.push(notes);
      }
      if (active !== undefined) {
        fields.push("active = ?");
        values.push(active ? 1 : 0);
      }

      if (fields.length === 0) {
        return { success: false, error: "No fields to update" };
      }

      values.push(id);

      const [result] = await opsPool.query(
        `UPDATE product_labels SET ${fields.join(", ")} WHERE id = ?`,
        values
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Label not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("ProductLabelModel.updateLabel error:", error);
      return { success: false, error: error.message };
    }
  }

  static async deleteLabel(id) {
    try {
      if (!opsPool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await opsPool.query("DELETE FROM product_labels WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Label not found" };
      }

      return { success: true };
    } catch (error) {
      console.error("ProductLabelModel.deleteLabel error:", error);
      return { success: false, error: error.message };
    }
  }
}


