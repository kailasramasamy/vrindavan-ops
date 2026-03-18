import { ProductSubcategoryModel } from "../models/ProductSubcategoryModel.js";

export class ProductSubcategoryController {
  // Get all subcategories
  static async getAllSubcategories(req, res) {
    try {
      const categoryId = req.query.category_id || null;
      const result = await ProductSubcategoryModel.getAllSubcategories(categoryId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Subcategories fetched successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getAllSubcategories:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get subcategory by ID
  static async getSubcategoryById(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductSubcategoryModel.getSubcategoryById(id);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Subcategory fetched successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getSubcategoryById:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Create new subcategory
  static async createSubcategory(req, res) {
    try {
      const subcategoryData = {
        category_id: req.body.category_id,
        name: req.body.name,
        description: req.body.description || null,
      };

      // Validate required fields
      if (!subcategoryData.name || subcategoryData.name.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Subcategory name is required",
        });
      }

      if (!subcategoryData.category_id) {
        return res.status(400).json({
          success: false,
          error: "Category ID is required",
        });
      }

      const result = await ProductSubcategoryModel.createSubcategory(subcategoryData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
          message: "Subcategory created successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in createSubcategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Update subcategory
  static async updateSubcategory(req, res) {
    try {
      const { id } = req.params;
      const subcategoryData = {
        category_id: req.body.category_id,
        name: req.body.name,
        description: req.body.description || null,
      };

      // Validate required fields
      if (!subcategoryData.name || subcategoryData.name.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Subcategory name is required",
        });
      }

      if (!subcategoryData.category_id) {
        return res.status(400).json({
          success: false,
          error: "Category ID is required",
        });
      }

      const result = await ProductSubcategoryModel.updateSubcategory(id, subcategoryData);

      if (result.success) {
        res.json({
          success: true,
          data: { id: parseInt(id), ...subcategoryData },
          message: "Subcategory updated successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in updateSubcategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Delete subcategory
  static async deleteSubcategory(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductSubcategoryModel.deleteSubcategory(id);

      if (result.success) {
        res.json({
          success: true,
          message: "Subcategory deleted successfully",
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in deleteSubcategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Sync subcategories from APP_DB.sub_categories
  static async syncSubcategories(req, res) {
    try {
      const result = await ProductSubcategoryModel.syncSubcategories();

      if (result.success) {
        res.json({
          success: true,
          summary: result.summary,
          message: "Subcategories synced successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in syncSubcategories:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}


