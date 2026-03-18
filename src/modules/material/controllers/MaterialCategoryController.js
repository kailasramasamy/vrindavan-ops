import { MaterialCategoryModel } from "../models/MaterialCategoryModel.js";

export class MaterialCategoryController {
  // Get all categories
  static async getAll(req, res) {
    try {
      const result = await MaterialCategoryModel.getAll();
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ success: false, error: "Failed to fetch categories" });
    }
  }

  // Get category by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const category = await MaterialCategoryModel.getById(id);

      if (!category) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }

      // Get attribute templates
      const templates = await MaterialCategoryModel.getAttributeTemplates(id);

      res.json({
        success: true,
        data: { ...category, templates: templates.rows },
      });
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ success: false, error: "Failed to fetch category" });
    }
  }

  // Create new category
  static async create(req, res) {
    try {
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, error: "Category name is required" });
      }

      const result = await MaterialCategoryModel.create({ name: name.trim(), description });

      res.status(201).json({
        success: true,
        data: { id: result.id, name: name.trim(), description },
      });
    } catch (error) {
      console.error("Error creating category:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "Category name already exists" });
      } else {
        res.status(500).json({ success: false, error: "Failed to create category" });
      }
    }
  }

  // Update category
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, error: "Category name is required" });
      }

      const success = await MaterialCategoryModel.update(id, {
        name: name.trim(),
        description,
      });

      if (!success) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }

      res.json({ success: true, data: { id, name: name.trim(), description } });
    } catch (error) {
      console.error("Error updating category:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "Category name already exists" });
      } else {
        res.status(500).json({ success: false, error: "Failed to update category" });
      }
    }
  }

  // Deactivate category
  static async deactivate(req, res) {
    try {
      const { id } = req.params;
      const success = await MaterialCategoryModel.deactivate(id);

      if (!success) {
        return res.status(404).json({ success: false, error: "Category not found" });
      }

      res.json({ success: true, message: "Category deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating category:", error);
      res.status(500).json({ success: false, error: "Failed to deactivate category" });
    }
  }

  // Create attribute template
  static async createAttributeTemplate(req, res) {
    try {
      const { category_id } = req.params;
      const { field_key, field_label, data_type, is_required = false, enum_options = null, default_value = null, display_order = 0 } = req.body;

      if (!field_key || !field_label || !data_type) {
        return res.status(400).json({
          success: false,
          error: "Field key, label, and data type are required",
        });
      }

      const result = await MaterialCategoryModel.createAttributeTemplate({
        category_id,
        field_key,
        field_label,
        data_type,
        is_required,
        enum_options: enum_options ? JSON.stringify(enum_options) : null,
        default_value,
        display_order,
      });

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          category_id,
          field_key,
          field_label,
          data_type,
          is_required,
          enum_options,
          default_value,
          display_order,
        },
      });
    } catch (error) {
      console.error("Error creating attribute template:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "Field key already exists for this category" });
      } else {
        res.status(500).json({ success: false, error: "Failed to create attribute template" });
      }
    }
  }

  // Update attribute template
  static async updateAttributeTemplate(req, res) {
    try {
      const { id } = req.params;
      const { field_key, field_label, data_type, is_required, enum_options, default_value, display_order } = req.body;

      const success = await MaterialCategoryModel.updateAttributeTemplate(id, {
        field_key,
        field_label,
        data_type,
        is_required,
        enum_options: enum_options ? JSON.stringify(enum_options) : null,
        default_value,
        display_order,
      });

      if (!success) {
        return res.status(404).json({ success: false, error: "Attribute template not found" });
      }

      res.json({ success: true, message: "Attribute template updated successfully" });
    } catch (error) {
      console.error("Error updating attribute template:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({ success: false, error: "Field key already exists for this category" });
      } else {
        res.status(500).json({ success: false, error: "Failed to update attribute template" });
      }
    }
  }

  // Get attribute template by ID
  static async getAttributeTemplateById(req, res) {
    try {
      const { id } = req.params;
      const template = await MaterialCategoryModel.getAttributeTemplateById(id);

      if (!template) {
        return res.status(404).json({ success: false, error: "Attribute template not found" });
      }

      // Parse enum_options if it exists
      if (template.enum_options) {
        try {
          template.enum_options = JSON.parse(template.enum_options);
        } catch (e) {
          // If parsing fails, keep as string
        }
      }

      res.json({ success: true, data: template });
    } catch (error) {
      console.error("Error fetching attribute template:", error);
      res.status(500).json({ success: false, error: "Failed to fetch attribute template" });
    }
  }

  // Delete attribute template
  static async deleteAttributeTemplate(req, res) {
    try {
      const { id } = req.params;
      const success = await MaterialCategoryModel.deleteAttributeTemplate(id);

      if (!success) {
        return res.status(404).json({ success: false, error: "Attribute template not found" });
      }

      res.json({ success: true, message: "Attribute template deleted successfully" });
    } catch (error) {
      console.error("Error deleting attribute template:", error);
      res.status(500).json({ success: false, error: "Failed to delete attribute template" });
    }
  }
}
