import { ProductMarginModel } from "../models/ProductMarginModel.js";

export class ProductMarginController {
  // Get all margins
  static async getAllMargins(req, res) {
    try {
      const productId = req.query.product_id || null;
      const result = await ProductMarginModel.getAllMargins(productId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Margins fetched successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getAllMargins:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get active margin for a product
  static async getActiveMargin(req, res) {
    try {
      const { productId } = req.params;
      const result = await ProductMarginModel.getActiveMarginForProduct(productId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Active margin fetched successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getActiveMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get margin by ID
  static async getMarginById(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductMarginModel.getMarginById(id);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Margin fetched successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getMarginById:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Create new margin
  static async createMargin(req, res) {
    try {
      const marginData = {
        product_id: req.body.product_id,
        margin_percentage: parseFloat(req.body.margin_percentage),
        effective_from: req.body.effective_from || new Date().toISOString().split("T")[0],
        effective_to: req.body.effective_to || null,
        is_active: req.body.is_active !== undefined ? (req.body.is_active === true || req.body.is_active === 1 ? 1 : 0) : 1,
        notes: req.body.notes || null,
        created_by: req.user?.id || null,
      };

      // Validate required fields
      if (!marginData.product_id) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required",
        });
      }

      if (marginData.margin_percentage === undefined || marginData.margin_percentage === null) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage is required",
        });
      }

      if (marginData.margin_percentage < 0 || marginData.margin_percentage > 100) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage must be between 0 and 100",
        });
      }

      const result = await ProductMarginModel.createMargin(marginData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
          message: "Margin created successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in createMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Update margin
  static async updateMargin(req, res) {
    try {
      const { id } = req.params;
      const marginData = {
        product_id: req.body.product_id,
        margin_percentage: parseFloat(req.body.margin_percentage),
        effective_from: req.body.effective_from,
        effective_to: req.body.effective_to || null,
        is_active: req.body.is_active !== undefined ? (req.body.is_active === true || req.body.is_active === 1 ? 1 : 0) : 1,
        notes: req.body.notes || null,
      };

      // Validate required fields
      if (!marginData.product_id) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required",
        });
      }

      if (marginData.margin_percentage === undefined || marginData.margin_percentage === null) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage is required",
        });
      }

      if (marginData.margin_percentage < 0 || marginData.margin_percentage > 100) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage must be between 0 and 100",
        });
      }

      const result = await ProductMarginModel.updateMargin(id, marginData);

      if (result.success) {
        res.json({
          success: true,
          data: { id: parseInt(id), ...marginData },
          message: "Margin updated successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in updateMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Delete margin
  static async deleteMargin(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductMarginModel.deleteMargin(id);

      if (result.success) {
        res.json({
          success: true,
          message: "Margin deleted successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in deleteMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get margin history for a product
  static async getMarginHistory(req, res) {
    try {
      const { productId } = req.params;
      const result = await ProductMarginModel.getMarginHistory(productId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Margin history fetched successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getMarginHistory:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}


