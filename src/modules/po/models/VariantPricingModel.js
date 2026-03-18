import pool from "../../../db/pool.js";

export class VariantPricingModel {
  // Calculate and save MRP for all variants in a PO
  static async calculateAndSaveMRP(poId, userId = 1) {
    try {
      // Get PO details with items
      const [poData] = await pool.execute(
        `SELECT 
          po.id as po_id,
          po.shipping_cost as total_shipping_cost,
          poi.procurement_item_id,
          poi.unit_cost as base_unit_cost,
          poi.quantity as total_base_quantity,
          poi.gst_percentage,
          pi.name as item_name,
          pi.base_unit,
          pi.default_profit_margin
        FROM purchase_orders po
        JOIN purchase_order_items poi ON po.id = poi.po_id
        JOIN po_procurement_items pi ON poi.procurement_item_id = pi.id
        WHERE po.id = ? AND po.status = 'received'`,
        [poId],
      );

      if (poData.length === 0) {
        return { success: false, error: "PO not found or not received" };
      }

      // Get expense settings
      const [expenseSettings] = await pool.execute(`SELECT expense_type, default_amount FROM variant_expense_settings WHERE is_active = TRUE`);

      const expenses = {};
      expenseSettings.forEach((setting) => {
        expenses[setting.expense_type] = parseFloat(setting.default_amount);
      });

      const results = [];

      // Calculate total quantity across all items for shipping cost calculation
      const totalQuantityForShipping = poData.reduce((sum, item) => sum + parseFloat(item.total_base_quantity), 0);

      for (const item of poData) {
        // Get variants for this procurement item
        const [variants] = await pool.execute(
          `SELECT 
            v.id as variant_id,
            v.name as variant_name,
            v.size as unit_size,
            v.base_unit
          FROM po_procurement_item_variant_mappings vm
          JOIN po_product_variants v ON vm.variant_id = v.id
          WHERE vm.procurement_item_id = ? AND vm.is_active = TRUE AND v.is_active = TRUE`,
          [item.procurement_item_id],
        );

        for (const variant of variants) {
          // Check for existing per-variant settings to inherit
          const inheritedSettings = await this.getMostRecentVariantSettings(variant.variant_id, item.procurement_item_id);

          const pricingData = await this.calculateVariantMRP(item, variant, expenses, inheritedSettings.customExpenses, inheritedSettings.customProfitMargin, totalQuantityForShipping);

          // Check if pricing data already exists for this combination
          const [existingRecords] = await pool.execute(
            `SELECT id FROM variant_pricing_data 
             WHERE procurement_item_id = ? AND variant_id = ? AND po_id = ?`,
            [item.procurement_item_id, variant.variant_id, item.po_id],
          );

          let result;
          if (existingRecords.length > 0) {
            // Update existing record
            const existingId = existingRecords[0].id;
            result = await pool.execute(
              `UPDATE variant_pricing_data SET
                base_unit_cost = ?, variant_unit_size = ?, sourcing_cost = ?,
                total_shipping_cost = ?, total_base_quantity = ?, per_base_unit_shipping = ?, variant_shipping_cost = ?,
                packaging_cost = ?, delivery_cost = ?, software_cost = ?,
                profit_margin_percentage = ?, actual_profit_margin_percentage = ?, total_expenses = ?, base_mrp = ?, payment_gateway_charge = ?, final_mrp = ?,
                calculated_by = ?, notes = ?, use_global_margin = ?, gst_percentage = ?, gst_amount = ?, calculation_date = NOW()
               WHERE id = ?`,
              [item.base_unit_cost, variant.unit_size, pricingData.sourcing_cost, item.total_shipping_cost, totalQuantityForShipping, pricingData.per_base_unit_shipping, pricingData.variant_shipping_cost, pricingData.packaging_cost, pricingData.delivery_cost, pricingData.software_cost, pricingData.profit_margin_percentage, pricingData.actual_profit_margin_percentage, pricingData.total_expenses, pricingData.base_mrp, pricingData.payment_gateway_charge, pricingData.final_mrp, userId, `MRP calculated for ${variant.variant_name} from PO ${item.po_id}${inheritedSettings.inherited ? " (inherited settings)" : ""}`, inheritedSettings.useGlobalMargin, pricingData.gst_percentage, pricingData.gst_amount, existingId],
            );
            result[0].insertId = existingId; // Use existing ID for consistency
          } else {
            // Insert new record
            result = await pool.execute(
              `INSERT INTO variant_pricing_data (
                procurement_item_id, variant_id, po_id,
                base_unit_cost, variant_unit_size, sourcing_cost,
                total_shipping_cost, total_base_quantity, per_base_unit_shipping, variant_shipping_cost,
                packaging_cost, delivery_cost, software_cost,
                profit_margin_percentage, actual_profit_margin_percentage, total_expenses, base_mrp, payment_gateway_charge, final_mrp,
                calculated_by, notes, use_global_margin, gst_percentage, gst_amount
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [item.procurement_item_id, variant.variant_id, item.po_id, item.base_unit_cost, variant.unit_size, pricingData.sourcing_cost, item.total_shipping_cost, totalQuantityForShipping, pricingData.per_base_unit_shipping, pricingData.variant_shipping_cost, pricingData.packaging_cost, pricingData.delivery_cost, pricingData.software_cost, pricingData.profit_margin_percentage, pricingData.actual_profit_margin_percentage, pricingData.total_expenses, pricingData.base_mrp, pricingData.payment_gateway_charge, pricingData.final_mrp, userId, `MRP calculated for ${variant.variant_name} from PO ${item.po_id}${inheritedSettings.inherited ? " (inherited settings)" : ""}`, inheritedSettings.useGlobalMargin, pricingData.gst_percentage, pricingData.gst_amount],
            );
          }

          results.push({
            variant_id: variant.variant_id,
            variant_name: variant.variant_name,
            final_mrp: pricingData.final_mrp,
            pricing_data_id: result.insertId,
            inherited_settings: inheritedSettings.inherited,
          });
        }
      }

      return { success: true, data: results };
    } catch (error) {
      console.error("Error calculating MRP:", error);
      return { success: false, error: error.message };
    }
  }

  // Get most recent per-variant settings for inheritance
  static async getMostRecentVariantSettings(variantId, procurementItemId) {
    try {
      // Get variant unit size for converting stored expenses back to per-base-unit
      const [variantData] = await pool.execute(
        `SELECT size as unit_size FROM po_product_variants WHERE id = ?`,
        [variantId],
      );
      const variantUnitSize = variantData.length > 0 ? parseFloat(variantData[0].unit_size) || 1.0 : 1.0;

      // Get the most recent pricing data for this variant (excluding current PO)
      const [existingData] = await pool.execute(
        `SELECT 
          packaging_cost, 
          delivery_cost, 
          software_cost, 
          profit_margin_percentage,
          use_global_margin,
          variant_unit_size
        FROM variant_pricing_data 
        WHERE variant_id = ? AND procurement_item_id = ?
        ORDER BY calculation_date DESC 
        LIMIT 1`,
        [variantId, procurementItemId],
      );

      if (existingData.length === 0) {
        // No previous data found, use defaults
        return {
          customExpenses: {},
          customProfitMargin: null,
          useGlobalMargin: true,
          inherited: false,
        };
      }

      const data = existingData[0];
      // Use stored variant_unit_size if available, otherwise use current variant unit size
      const storedUnitSize = data.variant_unit_size ? parseFloat(data.variant_unit_size) : variantUnitSize;

      // Check if the previous settings were custom (not using defaults)
      const [defaultExpenses] = await pool.execute(`SELECT expense_type, default_amount FROM variant_expense_settings WHERE is_active = TRUE`);

      const defaultExpenseMap = {};
      defaultExpenses.forEach((setting) => {
        defaultExpenseMap[setting.expense_type] = parseFloat(setting.default_amount);
      });

      // Convert stored variant-specific expenses back to per-base-unit for comparison
      // Stored expenses are variant-specific, so divide by unit size to get per-base-unit
      const storedPackagingPerBase = storedUnitSize > 0 ? parseFloat(data.packaging_cost) / storedUnitSize : parseFloat(data.packaging_cost);
      const storedDeliveryPerBase = storedUnitSize > 0 ? parseFloat(data.delivery_cost) / storedUnitSize : parseFloat(data.delivery_cost);
      const storedSoftwarePerBase = storedUnitSize > 0 ? parseFloat(data.software_cost) / storedUnitSize : parseFloat(data.software_cost);

      // Determine if expenses were customized (compare per-base-unit values)
      const packagingCustom = Math.abs(storedPackagingPerBase - defaultExpenseMap.packaging) > 0.01;
      const deliveryCustom = Math.abs(storedDeliveryPerBase - defaultExpenseMap.delivery) > 0.01;
      const softwareCustom = Math.abs(storedSoftwarePerBase - defaultExpenseMap.software) > 0.01;

      // Build custom expenses object if any were customized
      // Store as per-base-unit values so they can be scaled correctly in calculateVariantMRP
      const customExpenses = {};
      if (packagingCustom) customExpenses.packaging = storedPackagingPerBase;
      if (deliveryCustom) customExpenses.delivery = storedDeliveryPerBase;
      if (softwareCustom) customExpenses.software = storedSoftwarePerBase;

      // Determine if profit margin was customized
      const customProfitMargin = data.use_global_margin ? null : parseFloat(data.profit_margin_percentage);

      return {
        customExpenses,
        customProfitMargin,
        useGlobalMargin: data.use_global_margin,
        inherited: packagingCustom || deliveryCustom || softwareCustom || !data.use_global_margin,
      };
    } catch (error) {
      console.error("Error getting most recent variant settings:", error);
      return {
        customExpenses: {},
        customProfitMargin: null,
        useGlobalMargin: true,
        inherited: false,
      };
    }
  }

  // Calculate MRP for a single variant
  static async calculateVariantMRP(item, variant, defaultExpenses, customExpenses = {}, customProfitMargin = null, totalQuantityForShipping = null) {
    // Ensure unit_size is properly parsed - handle string, number, or null values
    let unitSize = variant.unit_size;
    if (typeof unitSize === 'string') {
      unitSize = parseFloat(unitSize);
    } else if (typeof unitSize !== 'number') {
      unitSize = parseFloat(unitSize) || 1.0;
    }
    // Validate unit_size is positive and reasonable
    if (isNaN(unitSize) || unitSize <= 0) {
      console.warn(`Invalid unit_size for variant ${variant.variant_id || variant.variant_name}: ${variant.unit_size}, defaulting to 1.0`);
      unitSize = 1.0;
    }
    
    // base_unit_cost is the cost per base unit (e.g., per KG or per L) from the PO item
    const baseUnitCost = parseFloat(item.base_unit_cost) || 0;
    const profitMargin = customProfitMargin !== null ? customProfitMargin : parseFloat(item.default_profit_margin) || 20.0;
    const gstPercentage = parseFloat(item.gst_percentage) || 0;

    // 1. Calculate sourcing cost from base unit cost
    // Multiply base unit cost by variant unit size to get the sourcing cost for this specific variant
    // Example: If base unit cost is ₹100/L and variant is 0.5L, sourcing cost = ₹100 × 0.5 = ₹50
    // Example: If base unit cost is ₹35.70/KG and variant is 2KG, sourcing cost = ₹35.70 × 2 = ₹71.40
    const sourcingCost = baseUnitCost * unitSize;

    // 2. Calculate GST on sourcing cost
    const gstAmount = (sourcingCost * gstPercentage) / 100;

    // 3. Calculate shipping cost
    const totalShippingCost = parseFloat(item.total_shipping_cost) || 0;
    const totalBaseQuantity = parseFloat(item.total_base_quantity) || 1;
    // Use total quantity across all items for shipping cost calculation if provided
    const shippingQuantity = totalQuantityForShipping || totalBaseQuantity;
    const perBaseUnitShipping = shippingQuantity > 0 ? totalShippingCost / shippingQuantity : 0;
    const variantShippingCost = perBaseUnitShipping * unitSize;

    // 4. Use custom expenses if provided, otherwise use defaults
    // Scale expenses by variant unit size to account for different variant sizes
    const basePackagingCost = customExpenses.packaging !== undefined ? customExpenses.packaging : defaultExpenses.packaging;
    const baseDeliveryCost = customExpenses.delivery !== undefined ? customExpenses.delivery : defaultExpenses.delivery;
    const baseSoftwareCost = customExpenses.software !== undefined ? customExpenses.software : defaultExpenses.software;
    
    const packagingCost = (basePackagingCost || 0) * unitSize;
    const deliveryCost = (baseDeliveryCost || 0) * unitSize;
    const softwareCost = (baseSoftwareCost || 0) * unitSize;

    // 5. Calculate total cost (sourcing cost + GST + operational expenses)
    const totalCost = sourcingCost + gstAmount + variantShippingCost + packagingCost + deliveryCost + softwareCost;

    // 6. Calculate final MRP based on target profit margin
    // Formula: Final MRP = Total Cost / (1 - Target Profit Margin % / 100)
    const finalMRP = totalCost / (1 - profitMargin / 100);

    // 7. Calculate payment gateway charge (2% of final MRP)
    const paymentGatewayCharge = finalMRP * 0.02;

    // 8. Calculate base MRP (final MRP - payment gateway)
    const baseMRP = finalMRP - paymentGatewayCharge;

    // 9. Calculate total expenses (operational expenses + payment gateway)
    // Round individual components first, then sum to ensure consistency
    const roundedShippingCost = parseFloat(variantShippingCost.toFixed(2));
    const roundedPackagingCost = parseFloat(packagingCost.toFixed(2));
    const roundedDeliveryCost = parseFloat(deliveryCost.toFixed(2));
    const roundedSoftwareCost = parseFloat(softwareCost.toFixed(2));
    const roundedPaymentGatewayCharge = parseFloat(paymentGatewayCharge.toFixed(2));
    const totalExpenses = roundedShippingCost + roundedPackagingCost + roundedDeliveryCost + roundedSoftwareCost + roundedPaymentGatewayCharge;

    // Calculate actual profit margin (based on total cost vs final MRP)
    // The actual profit margin should match the target profit margin since we calculated finalMRP based on it
    const actualProfitMargin = profitMargin;

    return {
      sourcing_cost: parseFloat(sourcingCost.toFixed(2)),
      per_base_unit_shipping: parseFloat(perBaseUnitShipping.toFixed(2)),
      variant_shipping_cost: roundedShippingCost,
      packaging_cost: roundedPackagingCost,
      delivery_cost: roundedDeliveryCost,
      software_cost: roundedSoftwareCost,
      total_expenses: parseFloat(totalExpenses.toFixed(2)),
      profit_margin_percentage: profitMargin, // Target profit margin
      actual_profit_margin_percentage: parseFloat(actualProfitMargin.toFixed(2)), // Actual profit margin
      base_mrp: parseFloat(baseMRP.toFixed(2)),
      payment_gateway_charge: roundedPaymentGatewayCharge,
      final_mrp: parseFloat(finalMRP.toFixed(2)),
      gst_percentage: gstPercentage,
      gst_amount: parseFloat(gstAmount.toFixed(2)),
    };
  }

  // Get pricing data for a specific variant
  static async getVariantPricingData(variantId, procurementItemId = null) {
    try {
      let query = `
        SELECT 
          vpd.*,
          v.name as variant_name,
          v.size as unit_size,
          v.base_unit,
          pi.name as item_name,
          po.po_number,
          po.po_date
        FROM variant_pricing_data vpd
        JOIN po_product_variants v ON vpd.variant_id = v.id
        JOIN po_procurement_items pi ON vpd.procurement_item_id = pi.id
        JOIN purchase_orders po ON vpd.po_id = po.id
        WHERE vpd.variant_id = ? AND v.is_active = TRUE
      `;

      const params = [variantId];

      if (procurementItemId) {
        query += ` AND vpd.procurement_item_id = ?`;
        params.push(procurementItemId);
      }

      query += ` ORDER BY vpd.calculation_date DESC`;

      const [rows] = await pool.execute(query, params);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching variant pricing data:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all pricing data for a PO
  static async getPOPricingData(poId) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          vpd.*,
          v.name as variant_name,
          v.size as unit_size,
          v.base_unit,
          pi.name as item_name,
          po.po_number,
          po.po_date
        FROM variant_pricing_data vpd
        JOIN po_product_variants v ON vpd.variant_id = v.id
        JOIN po_procurement_items pi ON vpd.procurement_item_id = pi.id
        JOIN purchase_orders po ON vpd.po_id = po.id
        WHERE vpd.po_id = ? AND v.is_active = TRUE
        ORDER BY pi.name, vpd.variant_id`,
        [poId],
      );
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching PO pricing data:", error);
      return { success: false, error: error.message };
    }
  }

  // Update expense settings
  static async updateExpenseSettings(expenseType, amount, userId = 1) {
    try {
      const [result] = await pool.execute(
        `UPDATE variant_expense_settings 
         SET default_amount = ?, updated_by = ?, updated_at = NOW()
         WHERE expense_type = ?`,
        [amount, userId, expenseType],
      );

      return { success: true, data: result };
    } catch (error) {
      console.error("Error updating expense settings:", error);
      return { success: false, error: error.message };
    }
  }

  // Get expense settings
  static async getExpenseSettings() {
    try {
      const [rows] = await pool.execute(`SELECT * FROM variant_expense_settings WHERE is_active = TRUE ORDER BY expense_type`);
      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching expense settings:", error);
      return { success: false, error: error.message };
    }
  }

  // Get all pricing data
  static async getAllPricingData() {
    try {
      // Use basic query without GST for now to avoid SQL errors
      const [rows] = await pool.execute(`
        SELECT 
          vpd.*,
          v.name as variant_name,
          v.size as unit_size,
          v.base_unit,
          pi.name as item_name,
          po.po_number,
          po.po_date,
          vpd.gst_percentage,
          vpd.gst_amount,
          vpd.gst_percentage as gst_percentage_calc
        FROM variant_pricing_data vpd
        JOIN po_product_variants v ON vpd.variant_id = v.id
        JOIN po_procurement_items pi ON vpd.procurement_item_id = pi.id
        JOIN purchase_orders po ON vpd.po_id = po.id
        WHERE v.is_active = TRUE
        ORDER BY po.po_number DESC, pi.name, vpd.variant_id, vpd.calculation_date DESC
      `);

      return { success: true, data: rows };
    } catch (error) {
      console.error("Error fetching all pricing data:", error);
      return { success: false, error: error.message };
    }
  }

  // Set custom expenses for a specific variant
  static async setVariantExpenses(variantId, procurementItemId, expenses, userId) {
    try {
      const { packaging, delivery, software } = expenses;

      // Check if pricing data exists for this variant
      const [existingData] = await pool.execute(
        `SELECT * FROM variant_pricing_data 
         WHERE variant_id = ? AND procurement_item_id = ? 
         ORDER BY calculation_date DESC LIMIT 1`,
        [variantId, procurementItemId],
      );

      if (existingData.length === 0) {
        return { success: false, error: "No pricing data found for this variant" };
      }

      const data = existingData[0];

      // Recalculate MRP with new expenses
      const sourcingCost = parseFloat(data.sourcing_cost);
      const gstAmount = parseFloat(data.gst_amount || 0);
      const variantShippingCost = parseFloat(data.variant_shipping_cost);
      const profitMargin = parseFloat(data.profit_margin_percentage);

      // Calculate total cost (sourcing cost + GST + operational expenses)
      const totalCost = sourcingCost + gstAmount + variantShippingCost + packaging + delivery + software;

      // Calculate final MRP based on target profit margin
      // Formula: Final MRP = Total Cost / (1 - Target Profit Margin % / 100)
      const finalMRP = totalCost / (1 - profitMargin / 100);

      // Calculate payment gateway charge (2% of final MRP)
      const paymentGatewayCharge = finalMRP * 0.02;

      // Calculate base MRP (final MRP - payment gateway)
      const baseMRP = finalMRP - paymentGatewayCharge;

      // Calculate total expenses (operational expenses + payment gateway)
      const totalExpenses = variantShippingCost + packaging + delivery + software + paymentGatewayCharge;

      // Update the pricing data
      const [result] = await pool.execute(
        `UPDATE variant_pricing_data 
         SET packaging_cost = ?, delivery_cost = ?, software_cost = ?, 
             total_expenses = ?, base_mrp = ?, payment_gateway_charge = ?, final_mrp = ?,
             calculated_by = ?, calculation_date = NOW()
         WHERE id = ?`,
        [packaging, delivery, software, totalExpenses, baseMRP, paymentGatewayCharge, finalMRP, userId, data.id],
      );

      return {
        success: true,
        data: {
          final_mrp: parseFloat(finalMRP.toFixed(2)),
          base_mrp: parseFloat(baseMRP.toFixed(2)),
          payment_gateway_charge: parseFloat(paymentGatewayCharge.toFixed(2)),
          packaging_cost: packaging,
          delivery_cost: delivery,
          software_cost: software,
        },
      };
    } catch (error) {
      console.error("Error setting variant expenses:", error);
      return { success: false, error: error.message };
    }
  }

  // Set custom profit margin for a specific variant
  static async setVariantProfitMargin(variantId, procurementItemId, profitMargin, userId, useGlobal = false) {
    try {
      // Check if pricing data exists for this variant
      const [existingData] = await pool.execute(
        `SELECT * FROM variant_pricing_data 
         WHERE variant_id = ? AND procurement_item_id = ? 
         ORDER BY calculation_date DESC LIMIT 1`,
        [variantId, procurementItemId],
      );

      if (existingData.length === 0) {
        return { success: false, error: "No pricing data found for this variant" };
      }

      const data = existingData[0];

      // Recalculate MRP with new profit margin
      const sourcingCost = parseFloat(data.sourcing_cost);
      const gstAmount = parseFloat(data.gst_amount || 0);
      const variantShippingCost = parseFloat(data.variant_shipping_cost);
      const packagingCost = parseFloat(data.packaging_cost);
      const deliveryCost = parseFloat(data.delivery_cost);
      const softwareCost = parseFloat(data.software_cost);

      // Calculate total cost (sourcing cost + GST + operational expenses)
      const totalCost = sourcingCost + gstAmount + variantShippingCost + packagingCost + deliveryCost + softwareCost;

      // Calculate final MRP based on new profit margin
      // Formula: Final MRP = Total Cost / (1 - Target Profit Margin % / 100)
      const finalMRP = totalCost / (1 - profitMargin / 100);

      // Calculate payment gateway charge (2% of final MRP)
      const paymentGatewayCharge = finalMRP * 0.02;

      // Calculate base MRP (final MRP - payment gateway)
      const baseMRP = finalMRP - paymentGatewayCharge;

      // Calculate total expenses (operational expenses + payment gateway)
      const totalExpenses = variantShippingCost + packagingCost + deliveryCost + softwareCost + paymentGatewayCharge;

      // Calculate actual profit margin (should match the target profit margin)
      const actualProfitMargin = profitMargin;

      // Update the pricing data
      const [result] = await pool.execute(
        `UPDATE variant_pricing_data 
         SET profit_margin_percentage = ?, actual_profit_margin_percentage = ?, base_mrp = ?, payment_gateway_charge = ?, final_mrp = ?,
             use_global_margin = ?, calculated_by = ?, calculation_date = NOW()
         WHERE id = ?`,
        [profitMargin, actualProfitMargin, baseMRP, paymentGatewayCharge, finalMRP, useGlobal, userId, data.id],
      );

      return {
        success: true,
        data: {
          final_mrp: parseFloat(finalMRP.toFixed(2)),
          base_mrp: parseFloat(baseMRP.toFixed(2)),
          payment_gateway_charge: parseFloat(paymentGatewayCharge.toFixed(2)),
          profit_margin_percentage: profitMargin,
        },
      };
    } catch (error) {
      console.error("Error setting variant profit margin:", error);
      return { success: false, error: error.message };
    }
  }

  // Set fixed MRP for a variant
  static async setVariantFixedMRP(variantId, procurementItemId, fixedMRP, userId) {
    try {
      // Check if pricing data exists for this variant
      const [existingData] = await pool.execute(
        `SELECT * FROM variant_pricing_data 
         WHERE variant_id = ? AND procurement_item_id = ? 
         ORDER BY calculation_date DESC LIMIT 1`,
        [variantId, procurementItemId],
      );

      if (existingData.length === 0) {
        return { success: false, error: "No pricing data found for this variant" };
      }

      const data = existingData[0];

      // Get current cost components
      const sourcingCost = parseFloat(data.sourcing_cost);
      const gstAmount = parseFloat(data.gst_amount || 0);
      const variantShippingCost = parseFloat(data.variant_shipping_cost);
      const packagingCost = parseFloat(data.packaging_cost);
      const deliveryCost = parseFloat(data.delivery_cost);
      const softwareCost = parseFloat(data.software_cost);

      // Calculate total operational expenses (excluding payment gateway)
      const totalOperationalExpenses = variantShippingCost + packagingCost + deliveryCost + softwareCost;

      // Calculate payment gateway charge (2% of fixed MRP)
      const paymentGatewayCharge = fixedMRP * 0.02;

      // Calculate base MRP (fixed MRP - payment gateway)
      const baseMRP = fixedMRP - paymentGatewayCharge;

      // Calculate total expenses (operational expenses + payment gateway)
      const totalExpenses = totalOperationalExpenses + paymentGatewayCharge;

      // Calculate actual profit margin based on fixed MRP
      // Formula: Profit Margin = (Final MRP - Total Cost) / Final MRP * 100
      // Total cost includes all expenses including payment gateway
      const totalCost = sourcingCost + gstAmount + totalOperationalExpenses + paymentGatewayCharge;
      const profitAmount = fixedMRP - totalCost;
      const actualProfitMargin = (profitAmount / fixedMRP) * 100;

      // Update the pricing data with fixed MRP
      const [result] = await pool.execute(
        `UPDATE variant_pricing_data 
         SET base_mrp = ?, payment_gateway_charge = ?, final_mrp = ?,
             total_expenses = ?, profit_margin_percentage = ?, actual_profit_margin_percentage = ?,
             calculated_by = ?, calculation_date = NOW(), notes = ?
         WHERE id = ?`,
        [baseMRP, paymentGatewayCharge, fixedMRP, totalExpenses, actualProfitMargin, actualProfitMargin, userId, `Fixed MRP set to ₹${fixedMRP} (profit margin: ${actualProfitMargin.toFixed(2)}%)`, data.id],
      );

      return {
        success: true,
        data: {
          id: data.id,
          final_mrp: fixedMRP,
          base_mrp: baseMRP,
          payment_gateway_charge: paymentGatewayCharge,
          total_expenses: totalExpenses,
          profit_margin_percentage: actualProfitMargin,
          actual_profit_margin_percentage: actualProfitMargin,
        },
      };
    } catch (error) {
      console.error("Error setting fixed MRP:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
