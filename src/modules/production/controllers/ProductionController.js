import { buildSEO } from "../../../utils/seo.js";
import { CategoryModel } from "../models/CategoryModel.js";
import { MilkInventoryModel } from "../models/MilkInventoryModel.js";
import { MilkPoolModel } from "../models/MilkPoolModel.js";
import { ProductionModel } from "../models/ProductionModel.js";
import { ProductModel } from "../models/ProductModel.js";

export class ProductionController {
  // Dashboard - Overview of production
  static async getDashboard(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0], time = "day" } = req.query;

      // Get production summary for the selected date
      const productionSummary = await ProductionModel.getProductionSummary(date);

      // Get milk inventory for the selected date
      const milkInventory = await MilkInventoryModel.getMilkInventorySummary(date);

      // Get recent production entries
      const recentProduction = await ProductionModel.getDailyProduction(date);

      // Get top products for the last 7 days (temporarily disabled due to SQL issue)
      const topProducts = { success: true, rows: [] };

      // Get products grouped by category for charts
      const productsDataResult = await ProductModel.getProductsGroupedByCategory();
      const productsData = productsDataResult.success ? productsDataResult.categories : [];

      const seo = buildSEO({ title: "Production Dashboard", url: req.path });
      res.render("pages/ops/production/dashboard", {
        seo,
        pageKey: "ops/production/dashboard",
        title: "Production Dashboard",
        date,
        time,
        productionSummary: productionSummary.rows || {},
        milkInventory: milkInventory.rows,
        recentProduction: recentProduction.rows,
        topProducts: topProducts.rows || [],
        productsData: productsData.rows || {},
        section: "Production",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in production dashboard:", error);
      const { date = new Date().toISOString().split("T")[0], time = "day" } = req.query;
      const seo = buildSEO({ title: "Production Dashboard", url: req.path });
      res.status(500).render("pages/ops/production/dashboard", {
        seo,
        pageKey: "ops/production/dashboard",
        title: "Production Dashboard",
        date,
        time,
        productionSummary: {},
        milkInventory: [],
        recentProduction: [],
        topProducts: [],
        productsData: {},
        error: "Failed to load production data",
        section: "Production",
        user: req.user,
      });
    }
  }

  // Daily Production Entry
  static async getDailyProduction(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0] } = req.query;

      // Get all products grouped by category
      const productsResult = await ProductModel.getProductsGroupedByCategory();

      // Get existing production entries for the date
      const existingProduction = await ProductionModel.getDailyProduction(date);

      // Get milk inventory for the date
      const milkInventory = await MilkInventoryModel.getDailyMilkInventory(date);

      const seo = buildSEO({ title: "Daily Production Entry", url: req.path });
      res.render("pages/ops/production/daily-production", {
        seo,
        pageKey: "ops/production/daily-production",
        title: "Daily Production Entry",
        date,
        categories: productsResult.categories,
        existingProduction: existingProduction.rows,
        milkInventory: milkInventory.rows,
      });
    } catch (error) {
      console.error("Error in daily production:", error);
      res.status(500).render("pages/ops/production/daily-production", {
        title: "Daily Production Entry",
        error: "Failed to load production data",
      });
    }
  }

  // Save daily production
  static async saveDailyProduction(req, res) {
    try {
      const { date, productions, milkInventory, product_id, quantity_produced, milk_used, notes, production_date } = req.body;

      // Handle both individual production data and array format
      let productionEntries = [];

      if (productions && productions.length > 0) {
        // Array format (from bulk save)
        productionEntries = productions;
      } else if (product_id && quantity_produced > 0) {
        // Individual format (from single product save)
        productionEntries = [
          {
            product_id: product_id,
            quantity_produced: quantity_produced,
            milk_used: milk_used || 0,
            notes: notes || "",
            production_date: production_date || date,
          },
        ];
      }

      // Save production entries and update milk inventory
      for (const production of productionEntries) {
        if (production.product_id && production.quantity_produced > 0) {
          await ProductionModel.upsertDailyProduction({
            production_date: production.production_date || date,
            product_id: production.product_id,
            quantity_produced: production.quantity_produced,
            milk_used: production.milk_used || 0,
            notes: production.notes || "",
            created_by: req.user?.id || 1, // Default to user ID 1 for now
          });

          // Update milk inventory automatically ONLY if milk source is direct
          if (production.milk_used > 0) {
            // Get product details to determine milk type and source
            const productResult = await ProductModel.getProductById(production.product_id);
            if (productResult.success && productResult.rows.length > 0) {
              const product = productResult.rows[0];

              // Only update milk inventory if the product's milk source is "direct"
              // If milk source is "pool", the inventory was already updated when the pool was allocated
              if (product.milk_source === "direct") {
                try {
                  // Get current milk inventory for this date and milk type
                  const currentInventory = await MilkInventoryModel.getDailyMilkInventory(production.production_date || date);
                  const existingInventory = currentInventory.rows.find((inv) => inv.milk_type === product.milk_type);

                  if (existingInventory) {
                    // For edit operations, we need to calculate the difference and update accordingly
                    // Get existing production data to calculate the difference
                    const existingProduction = await ProductionModel.getDailyProduction(production.production_date || date);
                    const currentProduction = existingProduction.rows.find((p) => p.product_id == production.product_id);

                    // Calculate total milk used from all production entries for this milk type
                    const allProduction = await ProductionModel.getDailyProduction(production.production_date || date);
                    let totalMilkUsed = 0;

                    for (const prod of allProduction.rows) {
                      const prodResult = await ProductModel.getProductById(prod.product_id);
                      if (prodResult.success && prodResult.rows.length > 0 && prodResult.rows[0].milk_type === product.milk_type) {
                        totalMilkUsed += parseFloat(prod.milk_used || 0);
                      }
                    }

                    const newUsed = totalMilkUsed;

                    const updateData = {
                      inventory_date: production.production_date || date,
                      milk_type: product.milk_type,
                      quantity_available: parseFloat(existingInventory.quantity_available) || 0,
                      quantity_used: newUsed,
                      quantity_wasted: parseFloat(existingInventory.quantity_wasted) || 0,
                      notes: existingInventory.notes,
                      created_by: req.user?.id || 1,
                    };
                    const result = await MilkInventoryModel.upsertDailyMilkInventory(updateData);
                    console.log(`✅ INVENTORY UPDATE COMPLETE: ${product.milk_type} milk inventory updated to ${newUsed}L used`);
                  } else {
                    // Create new inventory entry
                    await MilkInventoryModel.upsertDailyMilkInventory({
                      inventory_date: production.production_date || date,
                      milk_type: product.milk_type,
                      quantity_available: 0,
                      quantity_used: production.milk_used,
                      quantity_wasted: 0,
                      notes: "",
                      created_by: req.user?.id || 1,
                    });
                  }
                } catch (milkError) {
                  console.error("Milk inventory update error:", milkError);
                }
              }
              // If milk_source is "pool", we don't update inventory as it was already updated during pool allocation
            }
          }
        }
      }

      // Save milk inventory entries
      if (milkInventory && milkInventory.length > 0) {
        for (const inventory of milkInventory) {
          if (inventory.milk_type) {
            // Get current milk inventory to preserve existing quantity_used if not provided
            const currentInventory = await MilkInventoryModel.getDailyMilkInventory(date);
            const existingInventory = currentInventory.rows.find((inv) => inv.milk_type === inventory.milk_type);

            // Use provided quantity_used or keep existing value
            const quantity_used = inventory.quantity_used !== undefined ? inventory.quantity_used : existingInventory?.quantity_used || 0;

            await MilkInventoryModel.upsertDailyMilkInventory({
              inventory_date: date,
              milk_type: inventory.milk_type,
              quantity_available: inventory.quantity_available || 0,
              quantity_used: quantity_used,
              quantity_wasted: inventory.quantity_wasted || 0,
              notes: inventory.notes || "",
              created_by: req.user?.id || 1,
            });
          }
        }
      }

      res.json({ success: true, message: "Production data saved successfully" });
    } catch (error) {
      console.error("Error saving daily production:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete daily production
  static async deleteDailyProduction(req, res) {
    try {
      const { product_id, production_date } = req.body;

      if (!product_id || !production_date) {
        return res.status(400).json({ success: false, error: "Product ID and production date are required" });
      }

      // Get the production data before deletion to update milk inventory
      const productionData = await ProductionModel.getDailyProduction(production_date);
      const existingProduction = productionData.rows.find((p) => p.product_id == product_id);

      // Delete the production entry
      const result = await ProductionModel.deleteDailyProduction(product_id, production_date);

      if (result.success) {
        // Update milk inventory by subtracting the deleted milk usage ONLY if milk source is direct
        if (existingProduction && existingProduction.milk_used > 0) {
          const productResult = await ProductModel.getProductById(product_id);
          if (productResult.success && productResult.rows.length > 0) {
            const product = productResult.rows[0];

            // Only update milk inventory if the product's milk source is "direct"
            // If milk source is "pool", the inventory should not be updated as it was already updated during pool allocation
            if (product.milk_source === "direct") {
              // Get current milk inventory for this date and milk type
              const currentInventory = await MilkInventoryModel.getDailyMilkInventory(production_date);
              const existingInventory = currentInventory.rows.find((inv) => inv.milk_type === product.milk_type);

              if (existingInventory) {
                // Update existing inventory by subtracting the deleted milk usage
                const newUsed = Math.max(0, existingInventory.quantity_used - existingProduction.milk_used);
                await MilkInventoryModel.upsertDailyMilkInventory({
                  inventory_date: production_date,
                  milk_type: product.milk_type,
                  quantity_available: existingInventory.quantity_available,
                  quantity_used: newUsed,
                  quantity_wasted: existingInventory.quantity_wasted,
                  notes: existingInventory.notes,
                  created_by: req.user?.id || 1,
                });
              }
            }
            // If milk_source is "pool", we don't update inventory as it should remain unchanged
          }
        }

        res.json({ success: true, message: "Production data deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting daily production:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Analytics Dashboard
  static async getAnalytics(req, res) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { start_date = today, end_date = today, group_by = "day" } = req.query;

      // Get production analytics
      const productionAnalytics = await ProductionModel.getProductionAnalytics(start_date, end_date, group_by);

      // Get comprehensive analytics summary
      const analyticsSummary = await ProductionModel.getAnalyticsSummary(start_date, end_date);

      // Get milk usage by type
      const milkUsageByType = await ProductionModel.getMilkUsageByType(start_date, end_date);

      // Get top products
      const topProducts = await ProductionModel.getTopProducts(start_date, end_date, 10);

      // Get milk efficiency
      const milkEfficiency = await MilkInventoryModel.getMilkEfficiency(start_date, end_date);

      const seo = buildSEO({ title: "Production Analytics", url: req.path });
      res.render("pages/ops/production/analytics", {
        seo,
        pageKey: "ops/production/analytics",
        title: "Production Analytics",
        start_date,
        end_date,
        group_by,
        productionAnalytics: productionAnalytics.rows,
        analyticsSummary: analyticsSummary.rows,
        milkUsageByType: milkUsageByType.rows,
        topProducts: topProducts.rows,
        milkEfficiency: milkEfficiency.rows,
      });
    } catch (error) {
      console.error("Error in production analytics:", error);
      res.status(500).render("pages/ops/production/analytics", {
        title: "Production Analytics",
        error: "Failed to load analytics data",
        seo: buildSEO({ title: "Production Analytics", url: req.path }),
        pageKey: "ops/production/analytics",
        start_date,
        end_date,
        group_by,
        productionAnalytics: [],
        analyticsSummary: {},
        milkUsageByType: [],
        topProducts: [],
        milkEfficiency: [],
      });
    }
  }

  // Product Management
  static async getProducts(req, res) {
    try {
      const { category_id, milk_type } = req.query;

      const groupedProductsResult = await ProductModel.getProductsGroupedByCategory();

      const categoriesResult = await CategoryModel.getAllCategories();
      const poolsResult = await MilkPoolModel.getAllMilkPools();

      const categories = groupedProductsResult.success ? groupedProductsResult.categories : [];

      const seo = buildSEO({ title: "Product Management", url: req.path });
      res.render("pages/ops/production/products", {
        seo,
        pageKey: "ops/production/products",
        title: "Product Management",
        categories,
        allCategories: categoriesResult.success ? categoriesResult.rows : [],
        allPools: poolsResult.success ? poolsResult.rows : [],
        selectedCategory: category_id,
        selectedMilkType: milk_type,
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    } catch (error) {
      console.error("🔥 ERROR in product management:", error);
      console.error("🔥 ERROR stack:", error.stack);
      res.status(500).render("pages/ops/production/products", {
        seo: buildSEO({ title: "Product Management", url: req.path }),
        pageKey: "ops/production/products",
        title: "Product Management",
        categories: [],
        allCategories: [],
        allPools: [],
        selectedCategory: null,
        selectedMilkType: null,
        error: "Failed to load products",
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    }
  }

  // Create Product
  static async createProduct(req, res) {
    try {
      // Handle file upload
      let imageUrl = null;
      if (req.file) {
        imageUrl = `/uploads/products/${req.file.filename}`;
      }

      // Prepare product data
      const productData = {
        ...req.body,
        image_url: imageUrl,
        // Convert string boolean values to actual booleans
        auto_calculate_milk: req.body.auto_calculate_milk === "true",
        is_active: req.body.is_active === "true",
        // Convert string numbers to actual numbers
        category_id: req.body.category_id ? parseInt(req.body.category_id) : null,
        pool_id: req.body.pool_id ? parseInt(req.body.pool_id) : null,
        milk_per_unit: req.body.milk_per_unit ? parseFloat(req.body.milk_per_unit) : null,
      };

      // Handle pool_id based on milk_source
      if (productData.milk_source === "direct") {
        productData.pool_id = null;
      } else if (productData.milk_source === "pool") {
        // Keep the pool_id as is (it should be set from the form)
      }

      const result = await ProductModel.createProduct(productData);

      if (result.success) {
        res.json({ success: true, message: "Product created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Product by ID
  static async getProductById(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductModel.getProductById(id);

      if (result.rows && result.rows.length > 0) {
        res.json({ success: true, product: result.rows[0] });
      } else {
        res.status(404).json({ success: false, error: "Product not found" });
      }
    } catch (error) {
      console.error("Error fetching product by ID:", error);
      res.status(500).json({ success: false, error: "Failed to fetch product" });
    }
  }

  // Update Product
  static async updateProduct(req, res) {
    try {
      const { id } = req.params;

      // Handle file upload
      let imageUrl = null;
      if (req.file) {
        imageUrl = `/uploads/products/${req.file.filename}`;
      } else if (req.body.remove_image === "true") {
        // User wants to remove the image
        imageUrl = null;
      } else {
        // If no new file uploaded and not removing, preserve existing image_url
        const existingProduct = await ProductModel.getProductById(id);
        if (existingProduct.success && existingProduct.rows.length > 0) {
          imageUrl = existingProduct.rows[0].image_url;
        }
      }

      // Prepare product data - explicitly handle all fields to avoid undefined values
      const productData = {
        name: req.body.name || null,
        category_id: req.body.category_id ? parseInt(req.body.category_id) : null,
        milk_type: req.body.milk_type || null,
        milk_source: req.body.milk_source || null,
        pool_id: req.body.pool_id ? parseInt(req.body.pool_id) : null,
        milk_per_unit: req.body.milk_per_unit ? parseFloat(req.body.milk_per_unit) : null,
        auto_calculate_milk: req.body.auto_calculate_milk === "true",
        is_active: req.body.is_active === "true",
        image_url: imageUrl, // Always include image_url (either new or existing)
      };

      // Handle pool_id based on milk_source
      if (productData.milk_source === "direct") {
        productData.pool_id = null;
      } else if (productData.milk_source === "pool") {
        // Keep the pool_id as is (it should be set from the form)
      }
      const result = await ProductModel.updateProduct(id, productData);

      if (result.success) {
        res.json({ success: true, message: "Product updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete Product
  static async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const result = await ProductModel.deleteProduct(id);

      if (result.success) {
        res.json({ success: true, message: "Product deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get Products API
  static async getProductsApi(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0] } = req.query;

      // Get production data with product details
      const productionData = await ProductionModel.getProductionDataForDashboard(date);

      if (productionData.success) {
        res.json({ success: true, products: productionData.rows });
      } else {
        res.status(400).json({ success: false, error: productionData.error });
      }
    } catch (error) {
      console.error("Error fetching products API:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Category Management
  static async getCategories(req, res) {
    try {
      const categoriesResult = await CategoryModel.getAllCategories();

      const seo = buildSEO({ title: "Category Management", url: req.path });
      res.render("pages/ops/production/categories", {
        seo,
        pageKey: "ops/production/categories",
        title: "Category Management",
        categories: categoriesResult.rows,
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    } catch (error) {
      console.error("Error in category management:", error);
      res.status(500).render("pages/ops/production/categories", {
        title: "Category Management",
        error: "Failed to load categories",
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    }
  }

  // Get single category by ID
  static async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      const result = await CategoryModel.getCategoryById(id);

      if (result.success && result.rows) {
        res.json({ success: true, category: result.rows });
      } else {
        res.status(404).json({ success: false, error: "Category not found" });
      }
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create Category
  static async createCategory(req, res) {
    try {
      const result = await CategoryModel.createCategory(req.body);

      if (result.success) {
        res.json({ success: true, message: "Category created successfully", id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update Category
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await CategoryModel.updateCategory(id, req.body);

      if (result.success) {
        res.json({ success: true, message: "Category updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete Category
  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await CategoryModel.deleteCategory(id);

      if (result.success) {
        res.json({ success: true, message: "Category deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get milk inventory data for API
  static async getMilkInventoryApi(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0] } = req.query;

      // Get milk inventory for the date
      const milkInventory = await MilkInventoryModel.getDailyMilkInventory(date);

      if (milkInventory.success) {
        res.json({ success: true, milkInventory: milkInventory.rows });
      } else {
        res.status(400).json({ success: false, error: milkInventory.error });
      }
    } catch (error) {
      console.error("Error fetching milk inventory:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getDailyProductionApi(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0] } = req.query;

      // Get existing production entries for the date
      const existingProduction = await ProductionModel.getDailyProduction(date);

      if (existingProduction.success) {
        res.json({ success: true, production: existingProduction.rows });
      } else {
        res.status(400).json({ success: false, error: existingProduction.error });
      }
    } catch (error) {
      console.error("Error fetching daily production:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get production data for dashboard cards
  static async getProductionDataApi(req, res) {
    try {
      const { date = new Date().toISOString().split("T")[0] } = req.query;

      // Get production data with product details
      const productionData = await ProductionModel.getProductionDataForDashboard(date);

      if (productionData.success) {
        res.json({ success: true, products: productionData.rows });
      } else {
        res.status(400).json({ success: false, error: productionData.error });
      }
    } catch (error) {
      console.error("Error fetching production data:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get milk volume trends for chart
  static async getMilkVolumeTrendsApi(req, res) {
    try {
      const { days = 7 } = req.query;
      const daysInt = parseInt(days);

      // Validate days parameter
      if (isNaN(daysInt) || daysInt < 1 || daysInt > 365) {
        return res.status(400).json({ success: false, error: "Invalid days parameter. Must be between 1 and 365." });
      }

      // Get milk volume trends
      const trendsData = await ProductionModel.getMilkVolumeTrends(daysInt);

      if (trendsData.success) {
        res.json({ success: true, trends: trendsData.rows });
      } else {
        res.status(400).json({ success: false, error: trendsData.error });
      }
    } catch (error) {
      console.error("Error fetching milk volume trends:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Debug endpoint to check raw database data
  static async getDebugMilkInventoryApi(req, res) {
    try {
      const pool = require("../../db/pool.js");
      const [rows] = await pool.execute(`
        SELECT inventory_date, milk_type, quantity_used, quantity_available
        FROM daily_milk_inventory 
        WHERE milk_type IS NOT NULL 
        ORDER BY inventory_date DESC 
        LIMIT 10
      `);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error("Error fetching debug milk inventory:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
