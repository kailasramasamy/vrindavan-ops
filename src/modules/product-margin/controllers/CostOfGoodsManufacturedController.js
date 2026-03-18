import CostOfGoodsManufacturedModel from "../models/CostOfGoodsManufacturedModel.js";

class CostOfGoodsManufacturedController {
  /**
   * Get all COGM records
   */
  static async getAllCOGM(req, res) {
    try {
      const result = await CostOfGoodsManufacturedModel.getAllCOGM();
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getAllCOGM controller:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get COGM by product ID
   */
  static async getCOGMByProductId(req, res) {
    try {
      const { productId } = req.params;
      const result = await CostOfGoodsManufacturedModel.getCOGMByProductId(productId);
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in getCOGMByProductId controller:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Get COGM by ID
   */
  static async getCOGMById(req, res) {
    try {
      const { id } = req.params;
      const result = await CostOfGoodsManufacturedModel.getCOGMById(id);
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: "COGM record not found" });
      }
    } catch (error) {
      console.error("Error in getCOGMById controller:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Create or update COGM record
   */
  static async upsertCOGM(req, res) {
    try {
      const { productId } = req.params;
      const costData = req.body;

      // Validate product ID
      if (!productId) {
        return res.status(400).json({ success: false, error: "Product ID is required" });
      }

      // Validate cost data
      const costFields = [
        'sourcing_cost',
        'transport_cost',
        'packing_cost',
        'delivery_cost',
        'software_cost',
        'payment_gateway_cost'
      ];

      for (const field of costFields) {
        if (costData[field] !== undefined && costData[field] !== null) {
          const value = parseFloat(costData[field]);
          if (isNaN(value) || value < 0) {
            return res.status(400).json({ 
              success: false, 
              error: `${field} must be a valid non-negative number` 
            });
          }
        }
      }

      const result = await CostOfGoodsManufacturedModel.upsertCOGM(productId, costData);
      if (result.success) {
        res.json({ 
          success: true, 
          data: result.data,
          message: result.data.updated ? "COGM updated successfully" : "COGM created successfully"
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in upsertCOGM controller:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Delete COGM record
   */
  static async deleteCOGM(req, res) {
    try {
      const { id } = req.params;
      const result = await CostOfGoodsManufacturedModel.deleteCOGM(id);
      if (result.success) {
        res.json({ success: true, message: "COGM deleted successfully" });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error in deleteCOGM controller:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default CostOfGoodsManufacturedController;

