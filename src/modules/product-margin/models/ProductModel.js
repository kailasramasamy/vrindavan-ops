import pool from "../../../db/pool.js";
import { stageCopyPool } from "../../../db/pool.js";

export class ProductModel {
  // Create new product with all fields
  static async createProduct(productData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        name,
        name_alias,
        brand_name,
        product_type,
        category_id,
        subcategory_id,
        grammage,
        unit_size,
        packing_type,
        description,
        ean_code,
        hsn_code,
        margin_percentage,
        cost_price,
        basic_price,
        gst_percentage,
        gst_value,
        landing_price,
        mrp,
        seller_commission,
        shelf_life_days,
        rtv_status,
        vendor_pack_size,
        packaging_dimensions,
        temperature,
        cutoff_time,
        milk_type,
        storage_type,
        is_active,
      } = productData;

      const [result] = await pool.execute(
        `INSERT INTO products (
          name, name_alias, brand_name, product_type, category_id, subcategory_id,
          grammage, unit_size, packing_type, description, ean_code, hsn_code,
          margin_percentage, cost_price, basic_price, gst_percentage, gst_value,
          landing_price, mrp, seller_commission, shelf_life_days, rtv_status,
          vendor_pack_size, packaging_dimensions, temperature, cutoff_time,
          milk_type, storage_type, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          name,
          name_alias || null,
          brand_name || null,
          product_type || null,
          category_id ? parseInt(category_id) : null,
          subcategory_id ? parseInt(subcategory_id) : null,
          grammage || null,
          unit_size || null,
          packing_type || null,
          description || null,
          ean_code || null,
          hsn_code || null,
          margin_percentage ? parseFloat(margin_percentage) : null,
          cost_price ? parseFloat(cost_price) : null,
          basic_price ? parseFloat(basic_price) : null,
          gst_percentage ? parseFloat(gst_percentage) : null,
          gst_value ? parseFloat(gst_value) : null,
          landing_price ? parseFloat(landing_price) : null,
          mrp ? parseFloat(mrp) : null,
          seller_commission ? parseFloat(seller_commission) : null,
          shelf_life_days ? parseInt(shelf_life_days) : null,
          rtv_status || null,
          vendor_pack_size || null,
          packaging_dimensions || null,
          temperature || null,
          cutoff_time || null,
          milk_type || null,
          storage_type || null,
          is_active === true || is_active === "true" || is_active === 1 ? 1 : 0,
        ]
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error creating product:", error);
      return { success: false, error: error.message };
    }
  }

  // Get product by ID with all fields
  static async getProductById(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT 
          p.*,
          c.name as category_name,
          sc.name as subcategory_name
        FROM products p
        LEFT JOIN product_categories c ON p.category_id = c.id
        LEFT JOIN product_subcategories sc ON p.subcategory_id = sc.id
        WHERE p.id = ?`,
        [id]
      );

      if (rows.length === 0) {
        return { success: false, error: "Product not found" };
      }

      return { success: true, product: rows[0] };
    } catch (error) {
      console.error("Error getting product by ID:", error);
      return { success: false, error: error.message };
    }
  }

  // Update product with all fields (including new margin management fields)
  static async updateProduct(id, productData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const {
        name,
        name_alias,
        brand_name,
        product_type,
        category_id,
        subcategory_id,
        grammage,
        unit_size,
        packing_type,
        description,
        ean_code,
        hsn_code,
        margin_percentage,
        cost_price,
        basic_price,
        gst_percentage,
        gst_value,
        landing_price,
        mrp,
        seller_commission,
        shelf_life_days,
        rtv_status,
        vendor_pack_size,
        packaging_dimensions,
        temperature,
        cutoff_time,
        milk_type,
        storage_type,
        is_active,
      } = productData;

      // Build dynamic UPDATE query for all provided fields
      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push("name = ?");
        values.push(name);
      }
      if (name_alias !== undefined) {
        updates.push("name_alias = ?");
        values.push(name_alias);
      }
      if (brand_name !== undefined) {
        updates.push("brand_name = ?");
        values.push(brand_name);
      }
      if (product_type !== undefined) {
        updates.push("product_type = ?");
        values.push(product_type);
      }
      if (category_id !== undefined) {
        updates.push("category_id = ?");
        values.push(category_id ? parseInt(category_id) : null);
      }
      if (subcategory_id !== undefined) {
        updates.push("subcategory_id = ?");
        values.push(subcategory_id ? parseInt(subcategory_id) : null);
      }
      if (grammage !== undefined) {
        updates.push("grammage = ?");
        values.push(grammage);
      }
      if (unit_size !== undefined) {
        updates.push("unit_size = ?");
        values.push(unit_size);
      }
      if (packing_type !== undefined) {
        updates.push("packing_type = ?");
        values.push(packing_type);
      }
      if (description !== undefined) {
        updates.push("description = ?");
        values.push(description);
      }
      if (ean_code !== undefined) {
        updates.push("ean_code = ?");
        values.push(ean_code);
      }
      if (hsn_code !== undefined) {
        updates.push("hsn_code = ?");
        values.push(hsn_code);
      }
      if (margin_percentage !== undefined) {
        updates.push("margin_percentage = ?");
        values.push(margin_percentage ? parseFloat(margin_percentage) : null);
      }
      if (cost_price !== undefined) {
        updates.push("cost_price = ?");
        values.push(cost_price ? parseFloat(cost_price) : null);
      }
      if (basic_price !== undefined) {
        updates.push("basic_price = ?");
        values.push(basic_price ? parseFloat(basic_price) : null);
      }
      if (gst_percentage !== undefined) {
        updates.push("gst_percentage = ?");
        values.push(gst_percentage ? parseFloat(gst_percentage) : null);
      }
      if (gst_value !== undefined) {
        updates.push("gst_value = ?");
        values.push(gst_value ? parseFloat(gst_value) : null);
      }
      if (landing_price !== undefined) {
        updates.push("landing_price = ?");
        values.push(landing_price ? parseFloat(landing_price) : null);
      }
      if (mrp !== undefined) {
        updates.push("mrp = ?");
        values.push(mrp ? parseFloat(mrp) : null);
      }
      if (seller_commission !== undefined) {
        updates.push("seller_commission = ?");
        values.push(seller_commission ? parseFloat(seller_commission) : null);
      }
      if (shelf_life_days !== undefined) {
        updates.push("shelf_life_days = ?");
        values.push(shelf_life_days ? parseInt(shelf_life_days) : null);
      }
      if (rtv_status !== undefined) {
        updates.push("rtv_status = ?");
        values.push(rtv_status);
      }
      if (vendor_pack_size !== undefined) {
        updates.push("vendor_pack_size = ?");
        values.push(vendor_pack_size);
      }
      if (packaging_dimensions !== undefined) {
        updates.push("packaging_dimensions = ?");
        values.push(packaging_dimensions);
      }
      if (temperature !== undefined) {
        updates.push("temperature = ?");
        values.push(temperature);
      }
      if (cutoff_time !== undefined) {
        updates.push("cutoff_time = ?");
        values.push(cutoff_time);
      }
      if (milk_type !== undefined) {
        updates.push("milk_type = ?");
        values.push(milk_type);
      }
      if (storage_type !== undefined) {
        updates.push("storage_type = ?");
        values.push(storage_type);
      }
      if (is_active !== undefined) {
        updates.push("is_active = ?");
        values.push(is_active === true || is_active === "true" || is_active === 1 ? 1 : 0);
      }

      if (updates.length === 0) {
        return { success: false, error: "No fields to update" };
      }

      // Add updated_at
      updates.push("updated_at = NOW()");
      values.push(id);

      const sql = `UPDATE products SET ${updates.join(", ")} WHERE id = ?`;
      const [result] = await pool.execute(sql, values);

      if (result.affectedRows === 0) {
        return { success: false, error: "Product not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating product:", error);
      return { success: false, error: error.message };
    }
  }

  // Sync products from APP_DB.foods
  static async syncProducts() {
    try {
      if (!pool) {
        return { success: false, error: "Operations database connection not available" };
      }
      if (!stageCopyPool) {
        return { success: false, error: "Stage copy database connection not available" };
      }

      // Fetch only the relevant columns from foods table
      const [sourceFoods] = await stageCopyPool.execute(`
        SELECT 
          id, name, description, unit, category_id, subcategory_id
        FROM foods 
        ORDER BY id
      `);

      if (!sourceFoods || sourceFoods.length === 0) {
        return { success: true, summary: { total: 0, created: 0, skipped: 0, errors: 0 } };
      }

      // Get existing products from ops database
      const [existingProducts] = await pool.execute("SELECT id FROM products");
      const existingIds = new Set(existingProducts.map(p => p.id));

      // Get all categories and subcategories for mapping validation
      const [categories] = await pool.execute("SELECT id FROM product_categories");
      const categoryIds = new Set(categories.map(c => c.id));
      
      const [subcategories] = await pool.execute("SELECT id, category_id FROM product_subcategories");
      const subcategoryMap = new Map(subcategories.map(sc => [sc.id, sc.category_id]));

      let created = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails = [];

      // Process each product
      for (const sourceFood of sourceFoods) {
        try {
          // Validate category_id exists
          let validCategoryId = sourceFood.category_id;
          if (validCategoryId && !categoryIds.has(validCategoryId)) {
            validCategoryId = null;
            errorDetails.push(`Product ID ${sourceFood.id}: Category ${sourceFood.category_id} not found, set to null`);
          }

          // Validate subcategory_id exists and belongs to the category
          let validSubcategoryId = sourceFood.subcategory_id;
          if (validSubcategoryId) {
            const subcategoryCategoryId = subcategoryMap.get(validSubcategoryId);
            if (!subcategoryCategoryId) {
              validSubcategoryId = null;
              errorDetails.push(`Product ID ${sourceFood.id}: Subcategory ${sourceFood.subcategory_id} not found, set to null`);
            } else if (validCategoryId && subcategoryCategoryId !== validCategoryId) {
              // Subcategory doesn't belong to the category - set to null
              validSubcategoryId = null;
              errorDetails.push(`Product ID ${sourceFood.id}: Subcategory ${sourceFood.subcategory_id} doesn't belong to category ${validCategoryId}, set to null`);
            }
          }

          const productName = sourceFood.name || 'Unknown Product';
          const productDescription = sourceFood.description || null;
          const productGrammage = sourceFood.unit || null; // Map unit to grammage
          
          if (existingIds.has(sourceFood.id)) {
            // Skip existing products - don't overwrite
            skipped++;
          } else {
            // Insert new product - only set the mapped fields, others will be null/default
            // Note: unit_size is required, so we'll set it to the same value as grammage (from foods.unit)
            await pool.execute(
              `INSERT INTO products (
                id, name, description, grammage, unit_size, category_id, subcategory_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                sourceFood.id,
                productName,
                productDescription,
                productGrammage,
                productGrammage, // Set unit_size to same as grammage (from foods.unit)
                validCategoryId,
                validSubcategoryId
              ]
            );
            created++;
          }
        } catch (error) {
          errors++;
          errorDetails.push(`Product ID ${sourceFood.id}: ${error.message}`);
          console.error(`Error processing product ${sourceFood.id}:`, error);
        }
      }

      return {
        success: true,
        summary: {
          total: sourceFoods.length,
          created,
          skipped,
          errors,
          errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : [] // Limit to first 10 errors
        }
      };
    } catch (error) {
      console.error("Error syncing products:", error);
      return { success: false, error: error.message };
    }
  }

  // Preview sync - count how many new products would be synced
  static async previewSyncProducts() {
    try {
      if (!pool) {
        return { success: false, error: "Operations database connection not available" };
      }
      if (!stageCopyPool) {
        return { success: false, error: "Stage copy database connection not available" };
      }

      // Fetch only the relevant columns from foods table
      const [sourceFoods] = await stageCopyPool.execute(`
        SELECT 
          id, name, description, unit, category_id, subcategory_id
        FROM foods 
        ORDER BY id
      `);

      if (!sourceFoods || sourceFoods.length === 0) {
        return { success: true, newProductsCount: 0, totalProducts: 0 };
      }

      // Get existing products from ops database
      const [existingProducts] = await pool.execute("SELECT id FROM products");
      const existingIds = new Set(existingProducts.map(p => p.id));

      // Count new products (products that don't exist yet)
      const newProductsCount = sourceFoods.filter(food => !existingIds.has(food.id)).length;

      return {
        success: true,
        newProductsCount,
        totalProducts: sourceFoods.length,
        existingProducts: existingIds.size
      };
    } catch (error) {
      console.error("Error previewing sync:", error);
      return { success: false, error: error.message };
    }
  }
}

