import pool from "../../../db/pool.js";

export class MaterialCategoryModel {
  // Get all categories
  static async getAll() {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(`
      SELECT mc.*, 
             COUNT(m.id) as material_count
      FROM material_categories mc
      LEFT JOIN materials m ON mc.id = m.category_id AND m.is_active = true
      WHERE mc.is_active = true
      GROUP BY mc.id
      ORDER BY mc.id ASC
    `);

    return { rows };
  }

  // Get category by ID
  static async getById(id) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT * FROM material_categories 
      WHERE id = ? AND is_active = true
    `,
      [id],
    );

    return rows[0] || null;
  }

  // Create new category
  static async create(categoryData) {
    if (!pool) return null;

    const { name, description } = categoryData;
    const [result] = await pool.query(
      `
      INSERT INTO material_categories (name, description) 
      VALUES (?, ?)
    `,
      [name, description],
    );

    return { id: result.insertId };
  }

  // Update category
  static async update(id, categoryData) {
    if (!pool) return false;

    const { name, description } = categoryData;
    const [result] = await pool.query(
      `
      UPDATE material_categories 
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_active = true
    `,
      [name, description, id],
    );

    return result.affectedRows > 0;
  }

  // Deactivate category
  static async deactivate(id) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      UPDATE material_categories 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [id],
    );

    return result.affectedRows > 0;
  }

  // Get attribute templates for category
  static async getAttributeTemplates(categoryId) {
    if (!pool) return { rows: [] };

    const [rows] = await pool.query(
      `
      SELECT * FROM category_attribute_templates 
      WHERE category_id = ?
      ORDER BY display_order ASC, id ASC
    `,
      [categoryId],
    );

    return { rows };
  }

  // Get attribute template by ID
  static async getAttributeTemplateById(id) {
    if (!pool) return null;

    const [rows] = await pool.query(
      `
      SELECT * FROM category_attribute_templates 
      WHERE id = ?
    `,
      [id],
    );

    return rows[0] || null;
  }

  // Create attribute template
  static async createAttributeTemplate(templateData) {
    if (!pool) return null;

    const { category_id, field_key, field_label, data_type, is_required = false, enum_options = null, default_value = null, display_order = 0 } = templateData;

    const [result] = await pool.query(
      `
      INSERT INTO category_attribute_templates 
      (category_id, field_key, field_label, data_type, is_required, enum_options, default_value, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [category_id, field_key, field_label, data_type, is_required, enum_options, default_value, display_order],
    );

    return { id: result.insertId };
  }

  // Update attribute template
  static async updateAttributeTemplate(id, templateData) {
    if (!pool) return false;

    const { field_key, field_label, data_type, is_required, enum_options, default_value, display_order } = templateData;

    const [result] = await pool.query(
      `
      UPDATE category_attribute_templates 
      SET field_key = ?, field_label = ?, data_type = ?, is_required = ?, 
          enum_options = ?, default_value = ?, display_order = ?
      WHERE id = ?
    `,
      [field_key, field_label, data_type, is_required, enum_options, default_value, display_order, id],
    );

    return result.affectedRows > 0;
  }

  // Delete attribute template
  static async deleteAttributeTemplate(id) {
    if (!pool) return false;

    const [result] = await pool.query(
      `
      DELETE FROM category_attribute_templates WHERE id = ?
    `,
      [id],
    );

    return result.affectedRows > 0;
  }
}
