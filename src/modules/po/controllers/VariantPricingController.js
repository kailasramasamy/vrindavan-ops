import { VariantPricingModel } from "../models/VariantPricingModel.js";

export const calculateMRP = async (req, res) => {
  try {
    const { poId } = req.params;
    const userId = req.user?.id || 1; // Default to user ID 1 if not authenticated

    if (!poId) {
      return res.status(400).json({
        success: false,
        error: "PO ID is required",
      });
    }

    const result = await VariantPricingModel.calculateAndSaveMRP(poId, userId);

    if (result.success) {
      res.json({
        success: true,
        message: "MRP calculated successfully",
        data: result.data,
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in calculateMRP:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getVariantPricingData = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { procurementItemId } = req.query;

    const result = await VariantPricingModel.getVariantPricingData(variantId, procurementItemId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in getVariantPricingData:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getPOPricingData = async (req, res) => {
  try {
    const { poId } = req.params;

    const result = await VariantPricingModel.getPOPricingData(poId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in getPOPricingData:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const updateExpenseSettings = async (req, res) => {
  try {
    const { expenseType, amount } = req.body;
    const userId = req.user?.id || 1;

    if (!expenseType || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: "Expense type and amount are required",
      });
    }

    const validExpenseTypes = ["packaging", "delivery", "software"];
    if (!validExpenseTypes.includes(expenseType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid expense type",
      });
    }

    const result = await VariantPricingModel.updateExpenseSettings(expenseType, amount, userId);

    if (result.success) {
      res.json({
        success: true,
        message: "Expense settings updated successfully",
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in updateExpenseSettings:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getExpenseSettings = async (req, res) => {
  try {
    const result = await VariantPricingModel.getExpenseSettings();

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in getExpenseSettings:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getAllPricingData = async (req, res) => {
  try {
    const result = await VariantPricingModel.getAllPricingData();

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error in getAllPricingData controller:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Set custom expenses for a specific variant
export async function setVariantExpenses(req, res) {
  try {
    const { variantId, procurementItemId } = req.params;
    const { packaging, delivery, software } = req.body;
    const userId = req.user?.id || 1; // Default to user 1 if no auth

    if (!packaging && !delivery && !software) {
      return res.status(400).json({
        success: false,
        error: "At least one expense value is required",
      });
    }

    const result = await VariantPricingModel.setVariantExpenses(variantId, procurementItemId, { packaging, delivery, software }, userId);

    if (result.success) {
      res.json({
        success: true,
        message: "Variant expenses updated successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in setVariantExpenses:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

// Set custom profit margin for a specific variant
export async function setVariantProfitMargin(req, res) {
  try {
    const { variantId, procurementItemId } = req.params;
    const { profitMargin, useGlobal = false } = req.body;
    const userId = req.user?.id || 1; // Default to user 1 if no auth

    if (!profitMargin || profitMargin < 0 || profitMargin > 100) {
      return res.status(400).json({
        success: false,
        error: "Profit margin must be between 0 and 100",
      });
    }

    const result = await VariantPricingModel.setVariantProfitMargin(variantId, procurementItemId, profitMargin, userId, useGlobal);

    if (result.success) {
      const message = useGlobal ? "Variant profit margin set to use global margin" : "Variant profit margin updated successfully";
      res.json({
        success: true,
        message: message,
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in setVariantProfitMargin:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export async function setVariantFixedMRP(req, res) {
  try {
    const { variantId, procurementItemId } = req.params;
    const { fixedMRP } = req.body;
    const userId = req.user?.id || 1;

    if (!fixedMRP || parseFloat(fixedMRP) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid fixed MRP value",
      });
    }

    const result = await VariantPricingModel.setVariantFixedMRP(variantId, procurementItemId, parseFloat(fixedMRP), userId);

    if (result.success) {
      res.json({
        success: true,
        message: "Fixed MRP set successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in setVariantFixedMRP:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
