import { stageCopyPool } from "../db/pool.js";

class ProductDataModel {
  // Get all products from foods table
  static async getAllProducts() {
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code
      FROM foods 
      WHERE status = '1'
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query);
      return rows;
    } catch (error) {
      console.error("Error getting products:", error);
      throw error;
    }
  }

  // Get all categories
  static async getAllCategories() {
    const query = `
      SELECT id, name, description, weightage
      FROM categories 
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query);
      return rows;
    } catch (error) {
      console.error("Error getting categories:", error);
      throw error;
    }
  }

  // Get subcategories for a specific category from sub_categories table
  static async getSubcategories(categoryId) {
    const query = `
      SELECT id, category_id, name, description, weightage
      FROM sub_categories 
      WHERE category_id = ? AND active = 1
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [categoryId]);
      return rows;
    } catch (error) {
      console.error("Error getting subcategories:", error);
      throw error;
    }
  }

  // Search products by name
  static async searchProducts(searchTerm) {
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code
      FROM foods 
      WHERE name LIKE ? AND status = '1'
      ORDER BY name ASC
      LIMIT 20
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [`%${searchTerm}%`]);
      return rows;
    } catch (error) {
      console.error("Error searching products:", error);
      throw error;
    }
  }

  // Get products by category (including all subcategories)
  static async getProductsByCategory(categoryId) {
    const query = `
      SELECT DISTINCT f.id, f.name, f.category_id, f.subcategory_id, f.price, f.discount_price, f.description, f.unit, f.sku_code, f.status
      FROM foods f
      LEFT JOIN sub_categories sc ON f.subcategory_id = sc.id
      WHERE (f.category_id = ? OR sc.category_id = ?) AND f.status = '1'
      ORDER BY f.name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [categoryId, categoryId]);
      return rows;
    } catch (error) {
      console.error("Error getting products by category:", error);
      throw error;
    }
  }

  // Get products by subcategory
  static async getProductsBySubcategory(subcategoryId) {
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code, status
      FROM foods 
      WHERE subcategory_id = ? AND status = '1'
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, [subcategoryId]);
      return rows;
    } catch (error) {
      console.error("Error getting products by subcategory:", error);
      throw error;
    }
  }

  // Get products by IDs
  static async getProductsByIds(productIds) {
    if (!productIds || productIds.length === 0) {
      return [];
    }

    const placeholders = productIds.map(() => "?").join(",");
    const query = `
      SELECT id, name, category_id, subcategory_id, price, discount_price, description, unit, sku_code, status
      FROM foods 
      WHERE id IN (${placeholders})
      ORDER BY name ASC
    `;

    try {
      const [rows] = await stageCopyPool.execute(query, productIds);
      return rows;
    } catch (error) {
      console.error("Error getting products by IDs:", error);
      throw error;
    }
  }
}

export default ProductDataModel;
