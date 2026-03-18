import { ProductCategoryModel } from "../models/ProductCategoryModel.js";

export class ProductCategoryController {
  // Get all categories
  static async getAllCategories(req, res) {
    try {
      const result = await ProductCategoryModel.getAllCategories();

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Categories fetched successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getAllCategories:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get category by ID
  static async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductCategoryModel.getCategoryById(id);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Category fetched successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getCategoryById:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Create new category
  static async createCategory(req, res) {
    try {
      const categoryData = {
        name: req.body.name,
        description: req.body.description || null,
      };

      // Validate required fields
      if (!categoryData.name || categoryData.name.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Category name is required",
        });
      }

      const result = await ProductCategoryModel.createCategory(categoryData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
          message: "Category created successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in createCategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Update category
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const categoryData = {
        name: req.body.name,
        description: req.body.description || null,
      };

      // Validate required fields
      if (!categoryData.name || categoryData.name.trim() === "") {
        return res.status(400).json({
          success: false,
          error: "Category name is required",
        });
      }

      const result = await ProductCategoryModel.updateCategory(id, categoryData);

      if (result.success) {
        res.json({
          success: true,
          data: { id: parseInt(id), ...categoryData },
          message: "Category updated successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in updateCategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Delete category
  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductCategoryModel.deleteCategory(id);

      if (result.success) {
        res.json({
          success: true,
          message: "Category deleted successfully",
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in deleteCategory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Sync categories from APP_DB.categories
  static async syncCategories(req, res) {
    try {
      const result = await ProductCategoryModel.syncCategories();

      if (result.success) {
        res.json({
          success: true,
          summary: result.summary,
          message: "Categories synced successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in syncCategories:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}


