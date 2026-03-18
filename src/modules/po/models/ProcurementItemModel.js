import pool from "../../../db/pool.js";

class ProcurementItemModel {
  // Get all procurement items with filters
  static async getAllItems(filters = {}) {
    try {
      let query = `
        SELECT 
          p.*,
          pc.name as category_name,
          pc.parent_id as category_parent_id,
          (SELECT GROUP_CONCAT(pv.id) 
           FROM po_product_variants pv 
           JOIN po_procurement_item_variant_mappings pvm ON pv.id = pvm.variant_id
           WHERE pvm.procurement_item_id = p.id AND pvm.is_active = 1 AND pv.is_active = 1) as variant_ids,
          (SELECT GROUP_CONCAT(pv.name) 
           FROM po_product_variants pv 
           JOIN po_procurement_item_variant_mappings pvm ON pv.id = pvm.variant_id
           WHERE pvm.procurement_item_id = p.id AND pvm.is_active = 1 AND pv.is_active = 1 
           ORDER BY pv.sort_order) as variants,
          (SELECT image_url FROM po_procurement_item_images WHERE procurement_item_id = p.id AND is_primary = 1 LIMIT 1) as primary_image
        FROM po_procurement_items p
        LEFT JOIN po_product_categories pc ON p.category_id = pc.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.search) {
        query += ` AND (p.name LIKE ? OR p.sku_code LIKE ? OR p.hsn_code LIKE ?)`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (filters.category_id) {
        query += ` AND p.category_id = ?`;
        params.push(filters.category_id);
      }

      if (filters.status) {
        query += ` AND p.status = ?`;
        params.push(filters.status);
      }

      query += ` ORDER BY p.created_at DESC`;

      const [rows] = await pool.execute(query, params);

      // Ensure item_type field exists for all items (fallback to 'product' if column doesn't exist)
      const processedRows = rows.map((row) => ({
        ...row,
        item_type: row.item_type || "product", // Default to 'product' if column doesn't exist
      }));

      return { success: true, data: processedRows };
    } catch (error) {
      console.error("Error fetching products:", error);
      return { success: false, error: error.message };
    }
  }

  // Get product by ID with full details
  static async getItemById(id) {
    try {
      const [products] = await pool.execute(
        `SELECT 
          p.*,
          pc.name as category_name
        FROM po_procurement_items p
        LEFT JOIN po_product_categories pc ON p.category_id = pc.id
        WHERE p.id = ?`,
        [id],
      );

      if (products.length === 0) {
        return { success: false, error: "Procurement item not found" };
      }

      const product = products[0];

      // Get images
      const [images] = await pool.execute(`SELECT * FROM po_procurement_item_images WHERE procurement_item_id = ? ORDER BY is_primary DESC, sort_order`, [id]);

      // Get variants
      const [variants] = await pool.execute(
        `SELECT pvm.*, pv.name as variant_name, pv.sort_order
        FROM po_procurement_item_variant_mappings pvm
        JOIN po_product_variants pv ON pvm.variant_id = pv.id
        WHERE pvm.procurement_item_id = ? AND pvm.is_active = 1
        ORDER BY pv.sort_order`,
        [id],
      );

      // Get latest cost
      const [costs] = await pool.execute(
        `SELECT * FROM po_procurement_item_cost_history 
        WHERE procurement_item_id = ? AND variant_id IS NULL 
        ORDER BY effective_date DESC LIMIT 1`,
        [id],
      );

      // Get latest pricing
      const [pricing] = await pool.execute(
        `SELECT * FROM po_procurement_item_pricing_history 
        WHERE procurement_item_id = ? 
        ORDER BY effective_date DESC LIMIT 5`,
        [id],
      );

      // Get overheads
      const [overheads] = await pool.execute(
        `SELECT po.*, ot.name as overhead_type_name, pv.name as variant_name
        FROM po_procurement_item_overheads po
        JOIN po_overhead_types ot ON po.overhead_type_id = ot.id
        LEFT JOIN po_product_variants pv ON po.variant_id = pv.id
        WHERE po.procurement_item_id = ?
        ORDER BY po.effective_date DESC`,
        [id],
      );

      return {
        success: true,
        data: {
          ...product,
          item_type: product.item_type || "product", // Default to 'product' if column doesn't exist
          images,
          variants,
          latest_cost: costs[0] || null,
          pricing_history: pricing,
          overheads,
        },
      };
    } catch (error) {
      console.error("Error fetching product details:", error);
      return { success: false, error: error.message };
    }
  }

  // Create product
  static async createItem(productData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { name, category_id, hsn_code, sku_code, gst_percentage, base_unit, description, status, item_type, default_profit_margin, created_by, variants = [], images = [] } = productData;

      // Validate and convert gst_percentage
      let gstPercentage = null;
      if (gst_percentage && gst_percentage !== "" && !isNaN(parseFloat(gst_percentage))) {
        gstPercentage = parseFloat(gst_percentage);
      }

      // Validate and convert default_profit_margin
      let profitMargin = null;
      if (default_profit_margin && default_profit_margin !== "" && !isNaN(parseFloat(default_profit_margin))) {
        profitMargin = parseFloat(default_profit_margin);
        if (profitMargin < 0 || profitMargin > 100) {
          throw new Error("Profit margin must be between 0 and 100");
        }
      }

      // Try to insert with item_type first, fallback to without it if column doesn't exist
      let result;
      try {
        result = await connection.execute(
          `INSERT INTO po_procurement_items 
          (name, item_type, category_id, hsn_code, sku_code, gst_percentage, base_unit, description, status, default_profit_margin, created_by) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [name, item_type || "product", category_id, hsn_code, sku_code, gstPercentage, base_unit, description, status || "active", profitMargin, created_by],
        );
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" && error.message.includes("item_type")) {
          // Fallback: insert without item_type column
          result = await connection.execute(
            `INSERT INTO po_procurement_items 
            (name, category_id, hsn_code, sku_code, gst_percentage, base_unit, description, status, default_profit_margin, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category_id, hsn_code, sku_code, gstPercentage, base_unit, description, status || "active", profitMargin, created_by],
          );
        } else {
          throw error;
        }
      }

      const productId = result.insertId;

      // Insert variant mappings
      if (variants.length > 0) {
        for (const variantId of variants) {
          await connection.execute(`INSERT INTO po_procurement_item_variant_mappings (product_id, variant_id) VALUES (?, ?)`, [productId, variantId]);
        }
      }

      // Insert images
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          await connection.execute(`INSERT INTO po_procurement_item_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)`, [productId, images[i], i === 0 ? 1 : 0, i]);
        }
      }

      await connection.commit();
      return { success: true, data: { id: productId } };
    } catch (error) {
      await connection.rollback();
      console.error("Error creating product:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Update product
  static async updateItem(id, productData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const { name, category_id, hsn_code, sku_code, gst_percentage, base_unit, description, status, item_type, default_profit_margin, updated_by, variants, images } = productData;

      // Validate and convert gst_percentage
      let gstPercentage = null;
      if (gst_percentage && gst_percentage !== "" && !isNaN(parseFloat(gst_percentage))) {
        gstPercentage = parseFloat(gst_percentage);
      }

      // Validate and convert default_profit_margin
      let profitMargin = null;
      if (default_profit_margin && default_profit_margin !== "" && !isNaN(parseFloat(default_profit_margin))) {
        profitMargin = parseFloat(default_profit_margin);
        if (profitMargin < 0 || profitMargin > 100) {
          throw new Error("Profit margin must be between 0 and 100");
        }
      }

      // Try to update with item_type first, fallback to without it if column doesn't exist
      try {
        await connection.execute(
          `UPDATE po_procurement_items 
          SET name = ?, item_type = ?, category_id = ?, hsn_code = ?, sku_code = ?, gst_percentage = ?, 
              base_unit = ?, description = ?, status = ?, default_profit_margin = ?, updated_by = ?, updated_at = NOW()
          WHERE id = ?`,
          [name, item_type || "product", category_id, hsn_code, sku_code, gstPercentage, base_unit, description, status, profitMargin, updated_by, id],
        );
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" && error.message.includes("item_type")) {
          // Fallback: update without item_type column
          await connection.execute(
            `UPDATE po_procurement_items 
            SET name = ?, category_id = ?, hsn_code = ?, sku_code = ?, gst_percentage = ?, 
                base_unit = ?, description = ?, status = ?, default_profit_margin = ?, updated_by = ?, updated_at = NOW()
            WHERE id = ?`,
            [name, category_id, hsn_code, sku_code, gstPercentage, base_unit, description, status, profitMargin, updated_by, id],
          );
        } else {
          throw error;
        }
      }

      // Update variant mappings if provided
      if (variants !== undefined) {
        // Deactivate all existing mappings
        await connection.execute(`UPDATE po_procurement_item_variant_mappings SET is_active = 0 WHERE procurement_item_id = ?`, [id]);

        // Insert or reactivate variants
        for (const variantId of variants) {
          await connection.execute(
            `INSERT INTO po_procurement_item_variant_mappings (product_id, variant_id, is_active) 
            VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE is_active = 1`,
            [id, variantId],
          );
        }
      }

      // If default_profit_margin was updated, recalculate existing pricing records that use global margin
      if (profitMargin !== null) {
        // Get all existing pricing records that use global margin for this procurement item
        const [existingRecords] = await connection.execute(
          `SELECT vpd.*, pi.default_profit_margin as old_margin
           FROM variant_pricing_data vpd
           JOIN po_procurement_items pi ON vpd.procurement_item_id = pi.id
           WHERE pi.id = ? AND vpd.use_global_margin = 1`,
          [id],
        );

        // Recalculate MRP for each existing record
        for (const record of existingRecords) {
          const sourcingCost = parseFloat(record.sourcing_cost);
          const gstAmount = parseFloat(record.gst_amount || 0);
          const variantShippingCost = parseFloat(record.variant_shipping_cost || 0);
          const packagingCost = parseFloat(record.packaging_cost || 0);
          const deliveryCost = parseFloat(record.delivery_cost || 0);
          const softwareCost = parseFloat(record.software_cost || 0);

          // Calculate total cost (sourcing cost + GST + operational expenses)
          const totalCost = sourcingCost + gstAmount + variantShippingCost + packagingCost + deliveryCost + softwareCost;

          // Calculate final MRP based on new target profit margin
          const finalMRP = totalCost / (1 - profitMargin / 100);

          // Calculate payment gateway charge (2% of final MRP)
          const paymentGatewayCharge = finalMRP * 0.02;

          // Calculate base MRP (final MRP - payment gateway charge)
          const baseMRP = finalMRP - paymentGatewayCharge;

          // Calculate actual profit margin percentage
          const actualProfitMargin = ((finalMRP - totalCost) / finalMRP) * 100;

          // Update the pricing record with new calculations
          await connection.execute(
            `UPDATE variant_pricing_data 
             SET profit_margin_percentage = ?,
                 actual_profit_margin_percentage = ?,
                 base_mrp = ?,
                 payment_gateway_charge = ?,
                 final_mrp = ?,
                 calculated_by = ?,
                 calculation_date = NOW(),
                 notes = CONCAT(COALESCE(notes, ''), ' | Recalculated with new default profit margin: ', ?, '% (was ', ?, '%)')
             WHERE id = ?`,
            [profitMargin, parseFloat(actualProfitMargin.toFixed(2)), parseFloat(baseMRP.toFixed(2)), parseFloat(paymentGatewayCharge.toFixed(2)), parseFloat(finalMRP.toFixed(2)), updated_by, profitMargin, parseFloat(record.old_margin || 20), record.id],
          );
        }
      }

      // Update images if provided
      if (images !== undefined) {
        await connection.execute(`DELETE FROM po_procurement_item_images WHERE procurement_item_id = ?`, [id]);

        for (let i = 0; i < images.length; i++) {
          await connection.execute(`INSERT INTO po_procurement_item_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)`, [id, images[i], i === 0 ? 1 : 0, i]);
        }
      }

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Error updating product:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  // Delete product
  static async deleteItem(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Check for dependencies before deletion
      const [purchaseOrderItems] = await pool.execute(`SELECT COUNT(*) as count FROM purchase_order_items WHERE procurement_item_id = ?`, [id]);

      const [variantMappings] = await pool.execute(`SELECT COUNT(*) as count FROM po_procurement_item_variant_mappings WHERE procurement_item_id = ?`, [id]);

      const [images] = await pool.execute(`SELECT COUNT(*) as count FROM po_procurement_item_images WHERE procurement_item_id = ?`, [id]);

      // Check if product is being used in purchase orders
      if (purchaseOrderItems[0].count > 0) {
        return {
          success: false,
          error: "Cannot delete product. It is being used in existing purchase orders. Please remove it from all purchase orders first.",
        };
      }

      // If there are variant mappings or images, we can still delete but should clean them up
      if (variantMappings[0].count > 0) {
        // Soft delete variant mappings
        await pool.execute(`UPDATE po_procurement_item_variant_mappings SET is_active = 0 WHERE procurement_item_id = ?`, [id]);
      }

      if (images[0].count > 0) {
        // Delete associated images
        await pool.execute(`DELETE FROM po_procurement_item_images WHERE procurement_item_id = ?`, [id]);
      }

      // Now delete the product
      const [result] = await pool.execute(`DELETE FROM po_procurement_items WHERE id = ?`, [id]);

      if (result.affectedRows === 0) {
        return { success: false, error: "Product not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting product:", error);
      return { success: false, error: error.message };
    }
  }

  // Add cost history
  static async addCostHistory(costData) {
    try {
      const { product_id, variant_id, sourcing_cost, is_gst_inclusive, gst_amount, effective_date, notes, created_by } = costData;

      const [result] = await pool.execute(
        `INSERT INTO po_procurement_item_cost_history 
        (product_id, variant_id, sourcing_cost, is_gst_inclusive, gst_amount, effective_date, notes, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, variant_id, sourcing_cost, is_gst_inclusive, gst_amount, effective_date, notes, created_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error adding cost history:", error);
      return { success: false, error: error.message };
    }
  }

  // Add pricing history
  static async addPricingHistory(pricingData) {
    try {
      const { product_id, variant_id, landed_cost, profit_margin_percentage, mrp, gst_amount, effective_date, notes, created_by } = pricingData;

      const [result] = await pool.execute(
        `INSERT INTO po_procurement_item_pricing_history 
        (product_id, variant_id, landed_cost, profit_margin_percentage, mrp, gst_amount, effective_date, notes, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, variant_id, landed_cost, profit_margin_percentage, mrp, gst_amount, effective_date, notes, created_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error adding pricing history:", error);
      return { success: false, error: error.message };
    }
  }

  // Publish MRP
  static async publishMRP(pricingId, publishedBy) {
    try {
      await pool.execute(
        `UPDATE po_procurement_item_pricing_history 
        SET is_published = 1, published_at = NOW(), published_by = ?
        WHERE id = ?`,
        [publishedBy, pricingId],
      );

      return { success: true };
    } catch (error) {
      console.error("Error publishing MRP:", error);
      return { success: false, error: error.message };
    }
  }

  // Add overhead
  static async addOverhead(overheadData) {
    try {
      const { product_id, variant_id, overhead_type_id, amount, calculation_type, effective_date, notes, created_by } = overheadData;

      const [result] = await pool.execute(
        `INSERT INTO po_procurement_item_overheads 
        (product_id, variant_id, overhead_type_id, amount, calculation_type, effective_date, notes, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [product_id, variant_id, overhead_type_id, amount, calculation_type, effective_date, notes, created_by],
      );

      return { success: true, data: { id: result.insertId } };
    } catch (error) {
      console.error("Error adding overhead:", error);
      return { success: false, error: error.message };
    }
  }

  // Get cost history
  static async getCostHistory(productId, variantId = null) {
    try {
      const query = variantId ? `SELECT * FROM po_procurement_item_cost_history WHERE procurement_item_id = ? AND variant_id = ? ORDER BY effective_date DESC` : `SELECT * FROM po_procurement_item_cost_history WHERE procurement_item_id = ? AND variant_id IS NULL ORDER BY effective_date DESC`;

      const params = variantId ? [productId, variantId] : [productId];
      const [rows] = await pool.execute(query, params);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching cost history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get pricing history
  static async getPricingHistory(productId, variantId = null) {
    try {
      const query = variantId ? `SELECT * FROM po_procurement_item_pricing_history WHERE procurement_item_id = ? AND variant_id = ? ORDER BY effective_date DESC` : `SELECT * FROM po_procurement_item_pricing_history WHERE procurement_item_id = ? ORDER BY effective_date DESC`;

      const params = variantId ? [productId, variantId] : [productId];
      const [rows] = await pool.execute(query, params);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching pricing history:", error);
      return { success: false, error: error.message };
    }
  }

  // Get variants for a product
  static async getVariants(productId) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const [rows] = await pool.execute(
        `SELECT pv.*, pvm.id as mapping_id
         FROM po_product_variants pv
         JOIN po_procurement_item_variant_mappings pvm ON pv.id = pvm.variant_id
         WHERE pvm.procurement_item_id = ? AND pvm.is_active = 1 AND pv.is_active = 1
         ORDER BY pv.sort_order, pv.name`,
        [productId],
      );

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching variants:", error);
      return { success: false, error: error.message };
    }
  }

  // Helper function to parse variant name and extract unit_size and unit
  // Handles formats like "1L", "5L", "1 KG", "2 KG", "500 G", "0.5 L", etc.
  static parseVariantName(variantName) {
    if (!variantName || typeof variantName !== 'string') {
      return { unitSize: 1.0, unit: '' };
    }

    // Remove extra spaces and normalize to uppercase for easier matching
    const normalized = variantName.trim().toUpperCase();
    
    // Pattern to match: number (including decimals), optional space, unit (1-3 letters)
    // Examples: "1L", "5 L", "1 KG", "2KG", "0.5 L", "500 G", "1.5KG"
    // This regex will match: number followed by optional space and optional unit letters
    const match = normalized.match(/^([\d.]+)\s*([A-Z]{1,3})?$/);
    
    if (match) {
      const sizeStr = match[1];
      const unitStr = (match[2] || '').trim();
      
      const unitSize = parseFloat(sizeStr);
      if (isNaN(unitSize)) {
        return { unitSize: 1.0, unit: '' };
      }
      
      // Normalize unit: L, LITRE, LITERS -> L; KG, KGS, KILOGRAM -> KG; G, GRAM, GRAMS -> G; etc.
      let normalizedUnit = '';
      if (unitStr) {
        if (unitStr === 'LITRE' || unitStr === 'LITERS' || unitStr === 'L') {
          normalizedUnit = 'L';
        } else if (unitStr === 'KILOGRAM' || unitStr === 'KGS' || unitStr === 'KG') {
          normalizedUnit = 'KG';
        } else if (unitStr === 'GRAM' || unitStr === 'GRAMS' || unitStr === 'G') {
          normalizedUnit = 'G';
        } else if (unitStr === 'ML' || unitStr === 'MILLILITER' || unitStr === 'MILLILITERS') {
          normalizedUnit = 'ML';
        } else {
          // Use the unit as-is if it's a recognized format
          normalizedUnit = unitStr;
        }
      }
      
      return { unitSize, unit: normalizedUnit };
    }
    
    // If no match, try to extract just the number (fallback)
    const numberMatch = normalized.match(/^([\d.]+)/);
    if (numberMatch) {
      const sizeValue = parseFloat(numberMatch[1]);
      return { unitSize: isNaN(sizeValue) ? 1.0 : sizeValue, unit: '' };
    }
    
    // Default fallback
    return { unitSize: 1.0, unit: '' };
  }

  // Create variant for a product
  static async createVariant(variantData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { product_id, name, size: providedSize, unit = "", sort_order = 0, is_active = 1 } = variantData;

      // Determine size: use provided size, or parse from name, or default to 1.0
      let variantSize = providedSize !== undefined ? parseFloat(providedSize) : null;
      
      if (variantSize === null || isNaN(variantSize)) {
        // Parse from name if size not provided directly
        const parsed = this.parseVariantName(name);
        variantSize = parsed.unitSize;
      }

      // Get base_unit from the procurement item as fallback
      const [productData] = await pool.execute(
        `SELECT base_unit FROM po_procurement_items WHERE id = ?`,
        [product_id]
      );
      const productBaseUnit = productData.length > 0 ? (productData[0].base_unit || '').toUpperCase() : '';

      // Determine the base_unit
      // Priority: extracted from name > provided unit > product base_unit > default "pc"
      let finalBaseUnit = '';
      let extractedUnit = '';
      
      if (name) {
        const parsed = this.parseVariantName(name);
        extractedUnit = parsed.unit;
      }
      
      if (extractedUnit) {
        finalBaseUnit = extractedUnit.toLowerCase();
      } else if (unit && unit.trim() !== '') {
        finalBaseUnit = unit.trim().toLowerCase();
      } else if (productBaseUnit) {
        finalBaseUnit = productBaseUnit.toLowerCase();
      } else {
        finalBaseUnit = 'pc';
      }

      // Generate display name from size + base_unit (e.g., "1.000 L", "5.000 L")
      const displayName = `${variantSize.toFixed(3)} ${finalBaseUnit.toUpperCase()}`;
      const finalName = name || displayName;

      // Check if variant already exists for this product (by size and base_unit, or by name)
      const [existingMapping] = await pool.execute(
        `SELECT pv.id, pv.name, pvm.id as mapping_id, pvm.is_active
         FROM po_product_variants pv 
         JOIN po_procurement_item_variant_mappings pvm ON pv.id = pvm.variant_id 
         WHERE pvm.procurement_item_id = ? 
           AND (pv.size = ? AND pv.base_unit = ? OR pv.name = ?)`,
        [product_id, variantSize, finalBaseUnit, finalName],
      );

      if (existingMapping.length > 0) {
        if (existingMapping[0].is_active) {
          return {
            success: false,
            error: `Variant "${name}" already exists for this product`,
          };
        } else {
          // Reactivate the existing mapping
          await pool.execute(
            `UPDATE po_procurement_item_variant_mappings 
             SET is_active = 1, created_at = NOW() 
             WHERE id = ?`,
            [existingMapping[0].mapping_id],
          );
          return {
            success: true,
            data: {
              id: existingMapping[0].id,
              mapping_id: existingMapping[0].mapping_id,
              ...variantData,
            },
          };
        }
      }

      // Check if a variant with same size and base_unit exists globally
      let existingVariant;
      try {
        [existingVariant] = await pool.execute(
          `SELECT id FROM po_product_variants 
           WHERE size = ? AND base_unit = ? AND is_active = 1 
           LIMIT 1`,
          [variantSize, finalBaseUnit]
        );
      } catch (error) {
        console.error("Error checking for existing variant:", error);
        throw error;
      }

      let variantId;
      if (existingVariant.length > 0) {
        // Reuse existing variant with same size and base_unit
        variantId = existingVariant[0].id;
        // Set unit to match base_unit (both should be the same)
        const finalUnit = finalBaseUnit.toUpperCase();
        
        // Update name, unit, and base_unit if needed
        try {
          await pool.execute(
            `UPDATE po_product_variants 
             SET name = ?, unit = ?, base_unit = ? 
             WHERE id = ?`,
            [finalName, finalUnit, finalBaseUnit, variantId]
          );
        } catch (error) {
          console.error("Error updating variant:", error);
          throw error;
        }
      } else {
        // Create new variant
        // Set unit to match base_unit (both should be the same)
        const finalUnit = finalBaseUnit.toUpperCase();
        
        try {
          const [variantResult] = await pool.execute(
            `INSERT INTO po_product_variants (name, unit, size, base_unit, sort_order, is_active, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [finalName, finalUnit, variantSize, finalBaseUnit, sort_order, is_active],
          );
          variantId = variantResult.insertId;
        } catch (error) {
          console.error("Error creating variant:", error);
          throw error;
        }
      }

      // Create the mapping to the product
      try {
        const [mappingResult] = await pool.execute(
          `INSERT INTO po_procurement_item_variant_mappings (procurement_item_id, variant_id, is_active, created_at) 
           VALUES (?, ?, ?, NOW())`,
          [product_id, variantId, 1],
        );

        return { success: true, data: { id: variantId, mapping_id: mappingResult.insertId, ...variantData } };
      } catch (mappingError) {
        if (mappingError.code === "ER_DUP_ENTRY") {
          // Check if there's an inactive mapping we can reactivate
          const [inactiveMapping] = await pool.execute(
            `SELECT id FROM po_procurement_item_variant_mappings 
             WHERE procurement_item_id = ? AND variant_id = ? AND is_active = 0`,
            [product_id, variantId],
          );

          if (inactiveMapping.length > 0) {
            await pool.execute(
              `UPDATE po_procurement_item_variant_mappings 
               SET is_active = 1, created_at = NOW() 
               WHERE id = ?`,
              [inactiveMapping[0].id],
            );
            return {
              success: true,
              data: {
                id: variantId,
                mapping_id: inactiveMapping[0].id,
                ...variantData,
              },
            };
          } else {
            return {
              success: false,
              error: `Variant "${name}" already exists for this product`,
            };
          }
        } else {
          throw mappingError;
        }
      }
    } catch (error) {
      console.error("Error creating variant:", error);
      return { success: false, error: error.message };
    }
  }

  // Update variant
  static async updateVariant(id, variantData) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      const { name, sort_order, is_active } = variantData;

      const [result] = await pool.execute(
        `UPDATE po_product_variants 
         SET name = ?, sort_order = ?, is_active = ?, updated_at = NOW() 
         WHERE id = ?`,
        [name, sort_order, is_active, id],
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Variant not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error updating variant:", error);
      return { success: false, error: error.message };
    }
  }

  // Delete variant
  static async deleteVariant(id) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Soft delete by setting is_active = 0 in the mapping table
      const [result] = await pool.execute(
        `UPDATE po_procurement_item_variant_mappings 
         SET is_active = 0 
         WHERE variant_id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return { success: false, error: "Variant not found" };
      }

      return { success: true, affectedRows: result.affectedRows };
    } catch (error) {
      console.error("Error deleting variant:", error);
      return { success: false, error: error.message };
    }
  }

  // Update default profit margin for a procurement item
  static async updateDefaultProfitMargin(id, profitMargin, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (profitMargin < 0 || profitMargin > 100) {
        return { success: false, error: "Profit margin must be between 0 and 100" };
      }

      // Update the procurement item's default profit margin
      const [result] = await connection.execute(
        `UPDATE po_procurement_items 
         SET default_profit_margin = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [profitMargin, userId, id],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return { success: false, error: "Procurement item not found" };
      }

      // Update existing pricing records that use global margin for this procurement item
      // First, get all existing pricing records that need to be updated
      const [existingRecords] = await connection.execute(
        `SELECT vpd.*, pi.default_profit_margin as old_margin
         FROM variant_pricing_data vpd
         JOIN po_procurement_items pi ON vpd.procurement_item_id = pi.id
         WHERE pi.id = ? AND vpd.use_global_margin = 1`,
        [id],
      );

      // Recalculate MRP for each existing record
      for (const record of existingRecords) {
        const sourcingCost = parseFloat(record.sourcing_cost);
        const gstAmount = parseFloat(record.gst_amount || 0);
        const variantShippingCost = parseFloat(record.variant_shipping_cost || 0);
        const packagingCost = parseFloat(record.packaging_cost || 0);
        const deliveryCost = parseFloat(record.delivery_cost || 0);
        const softwareCost = parseFloat(record.software_cost || 0);

        // Calculate total cost (sourcing cost + GST + operational expenses)
        const totalCost = sourcingCost + gstAmount + variantShippingCost + packagingCost + deliveryCost + softwareCost;

        // Calculate final MRP based on new target profit margin
        const finalMRP = totalCost / (1 - profitMargin / 100);

        // Calculate payment gateway charge (2% of final MRP)
        const paymentGatewayCharge = finalMRP * 0.02;

        // Calculate base MRP (final MRP - payment gateway charge)
        const baseMRP = finalMRP - paymentGatewayCharge;

        // Calculate actual profit margin percentage
        const actualProfitMargin = ((finalMRP - totalCost) / finalMRP) * 100;

        // Update the pricing record with new calculations
        await connection.execute(
          `UPDATE variant_pricing_data 
           SET profit_margin_percentage = ?,
               actual_profit_margin_percentage = ?,
               base_mrp = ?,
               payment_gateway_charge = ?,
               final_mrp = ?,
               calculated_by = ?,
               calculation_date = NOW(),
               notes = CONCAT(COALESCE(notes, ''), ' | Recalculated with new default profit margin: ', ?, '% (was ', ?, '%)')
           WHERE id = ?`,
          [profitMargin, parseFloat(actualProfitMargin.toFixed(2)), parseFloat(baseMRP.toFixed(2)), parseFloat(paymentGatewayCharge.toFixed(2)), parseFloat(finalMRP.toFixed(2)), userId, profitMargin, parseFloat(record.old_margin || 20), record.id],
        );
      }

      await connection.commit();
      return { success: true, data: { default_profit_margin: profitMargin } };
    } catch (error) {
      await connection.rollback();
      console.error("Error updating default profit margin:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }
}

export default ProcurementItemModel;
