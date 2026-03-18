import dotenv from "dotenv";
import pool from "../../../db/pool.js";
import { stageCopyPool } from "../../../db/pool.js";

// Ensure environment variables are loaded
dotenv.config();

export class ProductModel {
  // Get all products grouped by category
  static async getProductsGroupedByCategory() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(`
        SELECT 
          p.*,
          c.name as category_name,
          mp.name as pool_name
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN milk_pools mp ON p.pool_id = mp.id
        WHERE p.is_active = true
        ORDER BY c.name, p.name
      `);

      // Group products by category
      const categories = {};
      rows.forEach((product) => {
        const categoryName = product.category_name || "Uncategorized";
        if (!categories[categoryName]) {
          categories[categoryName] = {
            id: product.category_id,
            name: categoryName,
            color: "#6B7280", // Default color since color column doesn't exist
            products: [],
          };
        }
        categories[categoryName].products.push(product);
      });

      return {
        success: true,
        categories: Object.values(categories),
      };
    } catch (error) {
      console.error("Error getting products grouped by category:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all products
  static async getAllProducts() {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // First get products from main database
      const [rows] = await pool.execute(`
        SELECT 
          p.*,
          c.name as category_name,
          mp.name as pool_name
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN milk_pools mp ON p.pool_id = mp.id
        WHERE p.is_active = true
        ORDER BY p.name
      `);

      // If stage copy pool is available, enrich with discount_price from foods table
      if (stageCopyPool && rows.length > 0) {
        const productIds = rows.map(p => p.id);
        const placeholders = productIds.map(() => '?').join(',');
        
        try {
          const [foodsRows] = await stageCopyPool.execute(`
            SELECT id, discount_price
            FROM foods
            WHERE id IN (${placeholders})
          `, productIds);

          // Create a map of food_id -> discount_price
          const discountPriceMap = new Map();
          foodsRows.forEach(food => {
            discountPriceMap.set(food.id, food.discount_price);
          });

          // Add discount_price to each product
          rows.forEach(product => {
            product.discount_price = discountPriceMap.get(product.id) || null;
          });
        } catch (error) {
          console.error("Error fetching discount prices from foods table:", error);
          // Continue without discount_price if there's an error
        }
      }

      return { success: true, rows };
    } catch (error) {
      console.error("Error getting all products:", error);
      return { success: false, error: error.message };
    }
  }

  // Get product by ID
  static async getProductById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `
        SELECT 
          p.*,
          c.name as category_name,
          mp.name as pool_name
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN milk_pools mp ON p.pool_id = mp.id
        WHERE p.id = ?
      `,
        [id],
      );

      // If stage copy pool is available, enrich with discount_price from foods table
      if (stageCopyPool && rows.length > 0) {
        try {
          const [foodsRows] = await stageCopyPool.execute(`
            SELECT id, discount_price
            FROM foods
            WHERE id = ?
          `, [id]);

          if (foodsRows.length > 0) {
            rows[0].discount_price = foodsRows[0].discount_price || null;
          }
        } catch (error) {
          console.error("Error fetching discount price from foods table:", error);
          // Continue without discount_price if there's an error
        }
      }

      return { success: true, rows };
    } catch (error) {
      console.error("Error getting product by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Create product
  static async createProduct(productData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { name, description, category_id, milk_type, milk_source, pool_id, milk_per_unit, auto_calculate_milk, is_active, image_url, created_by = 1 } = productData;

      const [result] = await pool.execute(
        `
        INSERT INTO products (
          name, description, category_id, milk_type, milk_source, 
          pool_id, milk_per_unit, auto_calculate_milk, is_active, 
          image_url, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
        [name, description, category_id, milk_type, milk_source, pool_id, milk_per_unit, auto_calculate_milk, is_active, image_url, created_by],
      );

      return { success: true, id: result.insertId };
    } catch (error) {
      console.error("Error creating product:", error);
      return { success: false, error: error.message };
    }
  }

  // Update product
  static async updateProduct(id, productData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { name, category_id, milk_type, milk_source, pool_id, milk_per_unit, auto_calculate_milk, is_active, image_url } = productData;

      const [result] = await pool.execute(
        `
        UPDATE products SET
          name = ?, category_id = ?, milk_type = ?, 
          milk_source = ?, pool_id = ?, milk_per_unit = ?, 
          auto_calculate_milk = ?, is_active = ?, image_url = ?, 
          updated_at = NOW()
        WHERE id = ?
      `,
        [name, category_id, milk_type, milk_source, pool_id, milk_per_unit, auto_calculate_milk, is_active, image_url, id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating product:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete product
  static async deleteProduct(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [result] = await pool.execute(
        `
        UPDATE products SET is_active = false, updated_at = NOW() WHERE id = ?
      `,
        [id],
      );

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting product:", error);
      return { success: false, error: error.message };
    }
  }

  // Get total products count
  static async getTotalProductsCount() {
    try {
      if (!pool) {
        return 0;
      }

      const [rows] = await pool.execute(`
        SELECT COUNT(*) as count FROM products WHERE is_active = true
      `);

      return rows[0].count;
    } catch (error) {
      console.error("Error getting total products count:", error);
      return 0;
    }
  }
}
