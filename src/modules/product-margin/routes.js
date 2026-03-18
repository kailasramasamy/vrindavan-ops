import express from "express";
import { ProductCategoryController } from "./controllers/ProductCategoryController.js";
import { ProductSubcategoryController } from "./controllers/ProductSubcategoryController.js";
import { ProductMarginController } from "./controllers/ProductMarginController.js";
import { SellerProductMarginController } from "./controllers/SellerProductMarginController.js";
import CostOfGoodsManufacturedController from "./controllers/CostOfGoodsManufacturedController.js";
import { ProductModel as ProductionProductModel } from "../production/models/ProductModel.js";
import { ProductModel as MarginProductModel } from "./models/ProductModel.js";
import { SalesPartnerModel } from "../sales/models/SalesPartnerModel.js";
import { buildSEO } from "../../utils/seo.js";

const router = express.Router();

// Product View Page
router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const seo = buildSEO({ title: "Product Details — Product Margin Management", url: req.path });

    // Load user permissions if user is authenticated
    let userWithPermissions = req.user;
    if (req.user && req.user.id) {
      try {
        const { UserPermissionsModel } = await import("../../models/UserPermissionsModel.js");
        const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
        if (permissionsResult.success) {
          userWithPermissions = {
            ...req.user,
            permissions: permissionsResult.permissions,
          };
        }
      } catch (error) {
        console.error("Error loading user permissions:", error);
      }
    }

    res.render("pages/ops/product-margin/product-view", {
      seo,
      pageKey: "ops/product-margin/product-view",
      promo: false,
      user: userWithPermissions,
      productId: id,
    });
  } catch (error) {
    console.error("Error rendering product view page:", error);
    res.status(500).send("Error loading product view page");
  }
});

// Product Edit Page
router.get("/products/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const seo = buildSEO({ title: "Edit Product — Product Margin Management", url: req.path });

    // Load user permissions if user is authenticated
    let userWithPermissions = req.user;
    if (req.user && req.user.id) {
      try {
        const { UserPermissionsModel } = await import("../../models/UserPermissionsModel.js");
        const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
        if (permissionsResult.success) {
          userWithPermissions = {
            ...req.user,
            permissions: permissionsResult.permissions,
          };
        }
      } catch (error) {
        console.error("Error loading user permissions:", error);
      }
    }

    res.render("pages/ops/product-margin/product-edit", {
      seo,
      pageKey: "ops/product-margin/product-edit",
      promo: false,
      user: userWithPermissions,
      productId: id,
    });
  } catch (error) {
    console.error("Error rendering product edit page:", error);
    res.status(500).send("Error loading product edit page");
  }
});

// Add Seller Override Page
router.get("/seller-overrides/add", async (req, res) => {
  try {
    const seo = buildSEO({ title: "Add Seller Override — Product Margin Management", url: req.path });

    // Load user permissions if user is authenticated
    let userWithPermissions = req.user;
    if (req.user && req.user.id) {
      try {
        const { UserPermissionsModel } = await import("../../models/UserPermissionsModel.js");
        const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
        if (permissionsResult.success) {
          userWithPermissions = {
            ...req.user,
            permissions: permissionsResult.permissions,
          };
        }
      } catch (error) {
        console.error("Error loading user permissions:", error);
      }
    }

    res.render("pages/ops/product-margin/seller-override-add", {
      seo,
      pageKey: "ops/product-margin/seller-override-add",
      promo: false,
      user: userWithPermissions,
    });
  } catch (error) {
    console.error("Error rendering add seller override page:", error);
    res.status(500).send("Error loading add seller override page");
  }
});

// Edit Seller Override Page
router.get("/seller-overrides/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const seo = buildSEO({ title: "Edit Seller Override — Product Margin Management", url: req.path });

    // Load user permissions if user is authenticated
    let userWithPermissions = req.user;
    if (req.user && req.user.id) {
      try {
        const { UserPermissionsModel } = await import("../../models/UserPermissionsModel.js");
        const permissionsResult = await UserPermissionsModel.getUserPermissions(req.user.id);
        if (permissionsResult.success) {
          userWithPermissions = {
            ...req.user,
            permissions: permissionsResult.permissions,
          };
        }
      } catch (error) {
        console.error("Error loading user permissions:", error);
      }
    }

    res.render("pages/ops/product-margin/seller-override-edit", {
      seo,
      pageKey: "ops/product-margin/seller-override-edit",
      promo: false,
      user: userWithPermissions,
      overrideId: id,
    });
  } catch (error) {
    console.error("Error rendering edit seller override page:", error);
    res.status(500).send("Error loading edit seller override page");
  }
});

// Products API (for margin management)
router.get("/api/v1/products", async (req, res) => {
  try {
    const result = await ProductionProductModel.getAllProducts();
    if (result.success) {
      res.json({ success: true, data: result.rows });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// Get product by ID (with all fields)
router.get("/api/v1/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await MarginProductModel.getProductById(id);
    if (result.success) {
      res.json({ success: true, product: result.product });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, error: "Failed to fetch product" });
  }
});

// Update product (with all fields)
router.put("/api/v1/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await MarginProductModel.updateProduct(id, req.body);
    if (result.success) {
      res.json({ success: true, message: "Product updated successfully" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, error: "Failed to update product" });
  }
});

// Preview sync products - count new products available for sync
router.get("/api/v1/products/sync/preview", async (req, res) => {
  try {
    const result = await MarginProductModel.previewSyncProducts();
    if (result.success) {
      res.json({
        success: true,
        newProductsCount: result.newProductsCount,
        totalProducts: result.totalProducts,
        existingProducts: result.existingProducts,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in previewSyncProducts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Sync products from APP_DB.foods
router.post("/api/v1/products/sync", async (req, res) => {
  try {
    const result = await MarginProductModel.syncProducts();
    if (result.success) {
      res.json({
        success: true,
        summary: result.summary,
        message: "Products synced successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Error in syncProducts:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Sellers API (for margin management)
router.get("/api/v1/sellers", async (req, res) => {
  try {
    const result = await SalesPartnerModel.getAllPartners(true); // Include inactive
    if (result.success) {
      res.json({ success: true, data: result.rows });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error fetching sellers:", error);
    res.status(500).json({ success: false, error: "Failed to fetch sellers" });
  }
});

// Authentication is handled by the parent ops router

// ==================== Category Routes ====================

// Categories API
router.get("/api/v1/product-categories", ProductCategoryController.getAllCategories);
router.get("/api/v1/product-categories/:id", ProductCategoryController.getCategoryById);
router.post("/api/v1/product-categories", ProductCategoryController.createCategory);
router.put("/api/v1/product-categories/:id", ProductCategoryController.updateCategory);
router.delete("/api/v1/product-categories/:id", ProductCategoryController.deleteCategory);
router.post("/api/v1/product-categories/sync", ProductCategoryController.syncCategories);

// ==================== Subcategory Routes ====================

// Subcategories API
router.get("/api/v1/product-subcategories", ProductSubcategoryController.getAllSubcategories);
router.get("/api/v1/product-subcategories/:id", ProductSubcategoryController.getSubcategoryById);
router.post("/api/v1/product-subcategories", ProductSubcategoryController.createSubcategory);
router.put("/api/v1/product-subcategories/:id", ProductSubcategoryController.updateSubcategory);
router.delete("/api/v1/product-subcategories/:id", ProductSubcategoryController.deleteSubcategory);
router.post("/api/v1/product-subcategories/sync", ProductSubcategoryController.syncSubcategories);

// ==================== Product Margin Routes (Common Margins) ====================
// NOTE: These routes are DEPRECATED. Common margins are now stored in the products table.
// The product_margins table is no longer needed. These routes are kept for backward compatibility
// but should not be used for new development. Use products table directly for common margins.

// Product Margins API (DEPRECATED - use products table for common margins)
router.get("/api/v1/product-margins", ProductMarginController.getAllMargins);
router.get("/api/v1/product-margins/product/:productId", ProductMarginController.getActiveMargin);
router.get("/api/v1/product-margins/product/:productId/history", ProductMarginController.getMarginHistory);
router.get("/api/v1/product-margins/:id", ProductMarginController.getMarginById);
router.post("/api/v1/product-margins", ProductMarginController.createMargin);
router.put("/api/v1/product-margins/:id", ProductMarginController.updateMargin);
router.delete("/api/v1/product-margins/:id", ProductMarginController.deleteMargin);

// ==================== Seller Product Margin Routes (Overrides) ====================

// Seller Product Margins API
router.get("/api/v1/seller-product-margins", SellerProductMarginController.getAllSellerMargins);
router.get("/api/v1/seller-product-margins/:sellerId/:productId", SellerProductMarginController.getEffectiveMargin);
router.get("/api/v1/seller-product-margins/:sellerId/:productId/history", SellerProductMarginController.getMarginHistory);
router.get("/api/v1/seller-product-margins/:id", SellerProductMarginController.getMarginById);
router.post("/api/v1/seller-product-margins", SellerProductMarginController.createSellerMargin);
router.put("/api/v1/seller-product-margins/:id", SellerProductMarginController.updateSellerMargin);
router.patch("/api/v1/seller-product-margins/:id/toggle-product-active", SellerProductMarginController.toggleProductActive);
router.delete("/api/v1/seller-product-margins/:id", SellerProductMarginController.deleteSellerMargin);

// ==================== Cost of Goods Manufactured (COGM) Routes ====================

// COGM API
router.get("/api/v1/cost-of-goods-manufactured", CostOfGoodsManufacturedController.getAllCOGM);
router.get("/api/v1/cost-of-goods-manufactured/product/:productId", CostOfGoodsManufacturedController.getCOGMByProductId);
router.get("/api/v1/cost-of-goods-manufactured/:id", CostOfGoodsManufacturedController.getCOGMById);
router.post("/api/v1/cost-of-goods-manufactured/product/:productId", CostOfGoodsManufacturedController.upsertCOGM);
router.put("/api/v1/cost-of-goods-manufactured/product/:productId", CostOfGoodsManufacturedController.upsertCOGM);
router.delete("/api/v1/cost-of-goods-manufactured/:id", CostOfGoodsManufacturedController.deleteCOGM);

export default router;

