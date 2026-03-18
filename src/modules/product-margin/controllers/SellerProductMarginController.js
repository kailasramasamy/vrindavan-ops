import { SellerProductMarginModel } from "../models/SellerProductMarginModel.js";
import CostOfGoodsManufacturedModel from "../models/CostOfGoodsManufacturedModel.js";

// Use products.cost_price as the source of truth (updated by both manual edits and COGM saves).
// Still require a COGM entry to exist so seller overrides are only created for costed products.
async function computeCostPriceFromCOGM(productId) {
  if (!productId) return 0;

  try {
    const cogmResult = await CostOfGoodsManufacturedModel.getCOGMByProductId(productId);
    if (cogmResult.success && cogmResult.data) {
      const costPrice = parseFloat(cogmResult.data.cost_price) || 0;
      return Math.round(costPrice * 100) / 100;
    }
  } catch (error) {
    console.error("Error computing cost price from COGM:", error);
  }

  return 0;
}

export class SellerProductMarginController {
  // Get all seller margins
  static async getAllSellerMargins(req, res) {
    try {
      const sellerId = req.query.seller_id || null;
      const productId = req.query.product_id || null;
      const productActiveOnly = req.query.product_active_only === "true" || req.query.product_active_only === "1";
      const result = await SellerProductMarginModel.getAllSellerMargins(sellerId, productId, productActiveOnly);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Seller margins fetched successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getAllSellerMargins:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get effective margin (seller override or common)
  static async getEffectiveMargin(req, res) {
    try {
      const { sellerId, productId } = req.params;
      const result = await SellerProductMarginModel.getEffectiveMargin(sellerId, productId);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          source: result.source,
          message: "Effective margin fetched successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in getEffectiveMargin:", error);
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
      const result = await SellerProductMarginModel.getMarginById(id);

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

  // Create new seller margin
  static async createSellerMargin(req, res) {
    try {
      const marginData = {
        seller_id: req.body.seller_id,
        product_id: req.body.product_id,
        margin_percentage: req.body.margin_percentage !== undefined ? parseFloat(req.body.margin_percentage) : null,
        mrp: req.body.mrp !== undefined ? parseFloat(req.body.mrp) : null,
        seller_margin_value: req.body.seller_margin_value !== undefined ? parseFloat(req.body.seller_margin_value) : null,
        landing_price: req.body.landing_price !== undefined ? parseFloat(req.body.landing_price) : null,
        basic_price: req.body.basic_price !== undefined ? parseFloat(req.body.basic_price) : null,
        gst_value: req.body.gst_value !== undefined ? parseFloat(req.body.gst_value) : null,
        gst_percentage: req.body.gst_percentage !== undefined ? parseFloat(req.body.gst_percentage) : null,
        effective_from: req.body.effective_from || new Date().toISOString().split("T")[0],
        effective_to: req.body.effective_to || null,
        is_active: req.body.is_active !== undefined ? (req.body.is_active === true || req.body.is_active === 1 ? 1 : 0) : 1,
        product_active: req.body.product_active !== undefined ? (req.body.product_active === true || req.body.product_active === 1 ? 1 : 0) : 1,
        notes: req.body.notes || null,
        created_by: req.user?.id || null,
      };

      // Validate required fields
      if (!marginData.seller_id) {
        return res.status(400).json({
          success: false,
          error: "Seller ID is required",
        });
      }

      if (!marginData.product_id) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required",
        });
      }

      // At least one pricing field should be provided
      if (
        marginData.margin_percentage === null &&
        marginData.mrp === null &&
        marginData.seller_margin_value === null &&
        marginData.landing_price === null &&
        marginData.basic_price === null &&
        marginData.gst_value === null &&
        marginData.gst_percentage === null
      ) {
        return res.status(400).json({
          success: false,
          error: "At least one pricing field must be provided",
        });
      }

      // Validate margin percentage if provided
      if (marginData.margin_percentage !== null && (marginData.margin_percentage < 0 || marginData.margin_percentage > 100)) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage must be between 0 and 100",
        });
      }

      // Validate GST percentage if provided
      if (marginData.gst_percentage !== null && (marginData.gst_percentage < 0 || marginData.gst_percentage > 100)) {
        return res.status(400).json({
          success: false,
          error: "GST percentage must be between 0 and 100",
        });
      }

      const computedCostPrice = await computeCostPriceFromCOGM(marginData.product_id);
      if (!computedCostPrice || computedCostPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: "Cost price could not be computed from Cost of Goods Manufactured data. Please update the sourcing, transport, and packing costs for this product.",
        });
      }

      marginData.cost_price = computedCostPrice;

      const result = await SellerProductMarginModel.createSellerMargin(marginData);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: result.data,
          message: "Seller margin override created successfully",
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in createSellerMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Update seller margin
  static async updateSellerMargin(req, res) {
    try {
      const { id } = req.params;
      const marginData = {
        seller_id: req.body.seller_id,
        product_id: req.body.product_id,
        margin_percentage: req.body.margin_percentage !== undefined ? parseFloat(req.body.margin_percentage) : null,
        mrp: req.body.mrp !== undefined ? parseFloat(req.body.mrp) : null,
        seller_margin_value: req.body.seller_margin_value !== undefined ? parseFloat(req.body.seller_margin_value) : null,
        landing_price: req.body.landing_price !== undefined ? parseFloat(req.body.landing_price) : null,
        basic_price: req.body.basic_price !== undefined ? parseFloat(req.body.basic_price) : null,
        gst_value: req.body.gst_value !== undefined ? parseFloat(req.body.gst_value) : null,
        gst_percentage: req.body.gst_percentage !== undefined ? parseFloat(req.body.gst_percentage) : null,
        effective_from: req.body.effective_from,
        effective_to: req.body.effective_to || null,
        is_active: req.body.is_active !== undefined ? (req.body.is_active === true || req.body.is_active === 1 ? 1 : 0) : 1,
        product_active: req.body.product_active !== undefined ? (req.body.product_active === true || req.body.product_active === 1 ? 1 : 0) : undefined,
        notes: req.body.notes || null,
      };

      // Validate required fields
      if (!marginData.seller_id) {
        return res.status(400).json({
          success: false,
          error: "Seller ID is required",
        });
      }

      if (!marginData.product_id) {
        return res.status(400).json({
          success: false,
          error: "Product ID is required",
        });
      }

      // Validate margin percentage if provided
      if (marginData.margin_percentage !== null && (marginData.margin_percentage < 0 || marginData.margin_percentage > 100)) {
        return res.status(400).json({
          success: false,
          error: "Margin percentage must be between 0 and 100",
        });
      }

      // Validate GST percentage if provided
      if (marginData.gst_percentage !== null && (marginData.gst_percentage < 0 || marginData.gst_percentage > 100)) {
        return res.status(400).json({
          success: false,
          error: "GST percentage must be between 0 and 100",
        });
      }

      const computedCostPrice = await computeCostPriceFromCOGM(marginData.product_id);
      if (!computedCostPrice || computedCostPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: "Cost price could not be computed from Cost of Goods Manufactured data. Please update the sourcing, transport, and packing costs for this product.",
        });
      }

      marginData.cost_price = computedCostPrice;

      const result = await SellerProductMarginModel.updateSellerMargin(id, marginData);

      if (result.success) {
        res.json({
          success: true,
          data: { id: parseInt(id), ...marginData },
          message: "Seller margin override updated successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in updateSellerMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Delete seller margin
  static async deleteSellerMargin(req, res) {
    try {
      const { id } = req.params;
      const result = await SellerProductMarginModel.deleteSellerMargin(id);

      if (result.success) {
        res.json({
          success: true,
          message: "Seller margin deleted successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in deleteSellerMargin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }

  // Get margin history for a seller-product combination
  static async getMarginHistory(req, res) {
    try {
      const { sellerId, productId } = req.params;
      const result = await SellerProductMarginModel.getMarginHistory(sellerId, productId);

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

  // Toggle product_active status
  static async toggleProductActive(req, res) {
    try {
      const { id } = req.params;
      const result = await SellerProductMarginModel.toggleProductActive(id);

      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          message: "Product active status toggled successfully",
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error in toggleProductActive:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}

