import ProcurementItemModel from "../models/ProcurementItemModel.js";

class ProcurementItemController {
  // Get all products
  static async getAllItems(req, res) {
    try {
      const filters = {
        search: req.query.search,
        category_id: req.query.category_id,
        status: req.query.status,
      };

      const result = await ProcurementItemModel.getAllItems(filters);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get product by ID
  static async getItemById(req, res) {
    try {
      const { id } = req.params;
      const result = await ProcurementItemModel.getItemById(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create product
  static async createItem(req, res) {
    try {
      const productData = {
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await ProcurementItemModel.createItem(productData);

      if (result.success) {
        res.json({ success: true, message: "Procurement item created successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update product
  static async updateItem(req, res) {
    try {
      const { id } = req.params;
      const productData = {
        ...req.body,
        updated_by: req.session?.user?.id || 1,
      };

      const result = await ProcurementItemModel.updateItem(id, productData);

      if (result.success) {
        res.json({ success: true, message: "Procurement item updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete product
  static async deleteItem(req, res) {
    try {
      const { id } = req.params;
      const result = await ProcurementItemModel.deleteItem(id);

      if (result.success) {
        res.json({ success: true, message: "Procurement item deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add cost history
  static async addCostHistory(req, res) {
    try {
      const { id } = req.params;
      const costData = {
        product_id: id,
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await ProcurementItemModel.addCostHistory(costData);

      if (result.success) {
        res.json({ success: true, message: "Cost history added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding cost history:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add pricing history
  static async addPricingHistory(req, res) {
    try {
      const { id } = req.params;
      const pricingData = {
        product_id: id,
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await ProcurementItemModel.addPricingHistory(pricingData);

      if (result.success) {
        res.json({ success: true, message: "Pricing history added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding pricing history:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Publish MRP
  static async publishMRP(req, res) {
    try {
      const { pricingId } = req.params;
      const publishedBy = req.session?.user?.id || 1;

      const result = await ProcurementItemModel.publishMRP(pricingId, publishedBy);

      if (result.success) {
        res.json({ success: true, message: "MRP published successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error publishing MRP:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add overhead
  static async addOverhead(req, res) {
    try {
      const { id } = req.params;
      const overheadData = {
        product_id: id,
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await ProcurementItemModel.addOverhead(overheadData);

      if (result.success) {
        res.json({ success: true, message: "Overhead added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding overhead:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get cost history
  static async getCostHistory(req, res) {
    try {
      const { id } = req.params;
      const { variant_id } = req.query;

      const result = await ProcurementItemModel.getCostHistory(id, variant_id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching cost history:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get pricing history
  static async getPricingHistory(req, res) {
    try {
      const { id } = req.params;
      const { variant_id } = req.query;

      const result = await ProcurementItemModel.getPricingHistory(id, variant_id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching pricing history:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get variants for a product
  static async getVariants(req, res) {
    try {
      const { id } = req.params;
      const result = await ProcurementItemModel.getVariants(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching variants:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create variant for a product
  static async createVariant(req, res) {
    try {
      const { id } = req.params;
      const variantData = {
        ...req.body,
        product_id: id,
      };

      const result = await ProcurementItemModel.createVariant(variantData);

      if (result.success) {
        res.status(201).json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating variant:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update variant
  static async updateVariant(req, res) {
    try {
      const { id } = req.params;
      const result = await ProcurementItemModel.updateVariant(id, req.body);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating variant:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete variant
  static async deleteVariant(req, res) {
    try {
      const { id } = req.params;
      const result = await ProcurementItemModel.deleteVariant(id);

      if (result.success) {
        res.json({ success: true, message: "Variant deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting variant:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update default profit margin for a procurement item
  static async updateDefaultProfitMargin(req, res) {
    try {
      const { id } = req.params;
      const { profitMargin } = req.body;
      const userId = req.user?.id || 1; // Default to user 1 if no auth

      if (!profitMargin || profitMargin < 0 || profitMargin > 100) {
        return res.status(400).json({
          success: false,
          error: "Profit margin must be between 0 and 100",
        });
      }

      const result = await ProcurementItemModel.updateDefaultProfitMargin(id, profitMargin, userId);

      if (result.success) {
        res.json({
          success: true,
          message: "Default profit margin updated successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Error updating default profit margin:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
}

export default ProcurementItemController;
