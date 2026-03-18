import express from "express";
import { requireAuth } from "../../../middleware/rbac.js";
import ProductDataModel from "../../../models/ProductDataModel.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get all products
router.get("/products", async (req, res) => {
  try {
    const { ids } = req.query;

    if (ids) {
      // Get products by IDs
      const productIds = ids
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
      if (productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid product IDs provided",
        });
      }

      const products = await ProductDataModel.getProductsByIds(productIds);
      res.json({
        success: true,
        data: products,
      });
    } else {
      // Get all products
      const products = await ProductDataModel.getAllProducts();
      res.json({
        success: true,
        data: products,
      });
    }
  } catch (error) {
    console.error("Error getting products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
    });
  }
});

// Search products
router.get("/products/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const products = await ProductDataModel.searchProducts(q);
    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search products",
    });
  }
});

// Get all categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await ProductDataModel.getAllCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Error getting categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});

// Get subcategories for a category
router.get("/categories/:id/subcategories", async (req, res) => {
  try {
    const { id } = req.params;
    const subcategories = await ProductDataModel.getSubcategories(id);
    res.json({
      success: true,
      data: subcategories,
    });
  } catch (error) {
    console.error("Error getting subcategories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch subcategories",
    });
  }
});

// Get products by category
router.get("/categories/:id/products", async (req, res) => {
  try {
    const { id } = req.params;
    const products = await ProductDataModel.getProductsByCategory(id);
    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Error getting products by category:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products by category",
    });
  }
});

// Get products by subcategory
router.get("/subcategories/:id/products", async (req, res) => {
  try {
    const { id } = req.params;
    const products = await ProductDataModel.getProductsBySubcategory(id);
    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Error getting products by subcategory:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products by subcategory",
    });
  }
});

export default router;
