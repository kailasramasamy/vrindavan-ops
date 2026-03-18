import fetch from "node-fetch";
import pool from "../../../db/pool.js";

export class AppSalesSync {
  // Find product by name or name_alias (for app sync, no mapping needed)
  static async findProductByName(productName, unitSize = null) {
    try {
      if (!pool) {
        return { success: false, error: "Database connection not available" };
      }

      // Try to find product by exact name match first
      let query = `
        SELECT id, name, name_alias, unit_size, grammage
        FROM products
        WHERE is_active = 1 
          AND (name = ? OR name_alias = ?)
      `;
      let params = [productName, productName];

      // If unit size is provided, try to match it as well
      if (unitSize) {
        query += ` AND (unit_size = ? OR grammage = ?)`;
        params.push(unitSize, unitSize);
      }

      query += ` LIMIT 1`;

      const [rows] = await pool.execute(query, params);

      // If no exact match found and unit_size was provided, try without unit_size
      if (rows.length === 0 && unitSize) {
        query = `
          SELECT id, name, name_alias, unit_size, grammage
          FROM products
          WHERE is_active = 1 
            AND (name = ? OR name_alias = ?)
          LIMIT 1
        `;
        params = [productName, productName];
        const [rowsWithoutUnit] = await pool.execute(query, params);
        if (rowsWithoutUnit.length > 0) {
          return { success: true, product: rowsWithoutUnit[0] };
        }
      }

      return { success: true, product: rows[0] || null };
    } catch (error) {
      console.error("Error finding product by name:", error);
      return { success: false, error: error.message };
    }
  }
  static async fetchAppSales(startDate, endDate) {
    try {
      const url = `https://app.vrindavanmilk.com/api/routeOrders/summary?startDate=${startDate}&endDate=${endDate}&productId=All&searchTerm=&limit=2000&page=1`;

      const token = process.env.VRINDAVAN_API_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJrYWlsYXNAdnJpbmRhdmFubWlsay5jb20iLCJpYXQiOjE3NTAzNzIyOTUsImV4cCI6MTc1MDM3NTg5NX0.6Xts_xqvakcMjnO64Veg9llIujH38BnDotUTH1eC6jk";

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error("Error fetching app sales:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  static async syncAppSales(startDate, endDate, userId = 1) {
    try {
      // Fetch data from app API
      const apiResult = await this.fetchAppSales(startDate, endDate);

      if (!apiResult.success) {
        return { success: false, error: apiResult.error };
      }

      // Try different possible response structures
      let summary = [];
      
      // Check if summary is directly in data
      if (Array.isArray(apiResult.data?.summary)) {
        summary = apiResult.data.summary;
      }
      // Check if summary is in data.data.summary
      else if (Array.isArray(apiResult.data?.data?.summary)) {
        summary = apiResult.data.data.summary;
      }
      // Check if summary is in data.data (and data itself is an array)
      else if (Array.isArray(apiResult.data?.data)) {
        summary = apiResult.data.data;
      }
      // Check if the response itself is an array
      else if (Array.isArray(apiResult.data)) {
        summary = apiResult.data;
      }
      // Try to find summary at root level
      else if (apiResult.data?.data && typeof apiResult.data.data === 'object') {
        const responseData = apiResult.data.data || {};
        summary = responseData.summary || [];
      }

      if (summary.length === 0) {
        return { success: true, message: "No sales data found for the specified date range", synced: 0 };
      }

      // Import models
      const { SalesRecordModel } = await import("../models/SalesRecordModel.js");

      // Get Vrindavan Farm App partner (should be ID 1)
      const { SalesPartnerModel } = await import("../models/SalesPartnerModel.js");
      const appPartner = await SalesPartnerModel.getPartnerByCode("VFA");

      if (!appPartner.success || !appPartner.rows) {
        return { success: false, error: "Vrindavan Farm App partner not found" };
      }

      const appPartnerId = appPartner.rows.id;

      // Get configured products for this partner
      const partnerProductsResult = await SalesPartnerModel.getPartnerProducts(appPartnerId);
      if (!partnerProductsResult.success) {
        return { success: false, error: "Failed to fetch partner products" };
      }

      const configuredProductIds = new Set(
        partnerProductsResult.rows.map(p => p.product_id)
      );

      if (configuredProductIds.size === 0) {
        return { 
          success: true, 
          message: "No products configured for this partner. Please configure products first at /ops/sales/partners", 
          synced: 0 
        };
      }

      let syncedCount = 0;
      let skippedCount = 0;
      let errors = [];

      // Process each summary item - only sync products with actual sales data
      for (const item of summary) {
        try {
          // Skip items with zero or no sales data
          const quantity = parseFloat(item.total_quantity || 0);
          const totalAmount = parseFloat(item.total_amount || 0);
          
          if (quantity <= 0 && totalAmount <= 0) {
            skippedCount++;
            continue;
          }
          
          // Find product by name or name_alias directly (no mapping needed)
          const productResult = await this.findProductByName(item.product_name, item.unit_size);
          const product = productResult?.product;

          if (!product) {
            const errorMsg = `Product not found: ${item.product_name} (${item.unit_size})`;
            errors.push(errorMsg);
            skippedCount++;
            continue;
          }

          // CRITICAL: Only sync products that are configured for this partner
          if (!configuredProductIds.has(product.id)) {
            skippedCount++;
            continue;
          }

          // Create sales record using the summary data
          // Only sync products that are explicitly configured for this partner
          const salesData = {
            sale_date: startDate, // Use the date from the sync request
            product_id: product.id,
            partner_id: appPartnerId,
            sales_channel: "app",
            quantity_sold: parseFloat(item.total_quantity || 0),
            unit_price: parseFloat(item.discount_price || item.unit_price || 0),
            total_amount: parseFloat(item.total_amount || 0),
            notes: `App sales sync for ${startDate}`,
            is_manual_entry: 0,
            api_reference: `app-${item.food_id}-${startDate}`,
            created_by: userId,
          };

          const result = await SalesRecordModel.upsertSalesRecord(salesData);

          if (result.success) {
            syncedCount++;
          } else {
            errors.push(`Failed to sync ${item.product_name}: ${result.error}`);
          }
        } catch (itemError) {
          console.error("Error processing item:", itemError);
          errors.push(`${item.product_name}: ${itemError.message}`);
        }
      }

      const message = `Successfully synced ${syncedCount} sales records from app${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`;

      if (errors.length > 0) {
        console.error("Sync errors:", errors);
      }

      return {
        success: true,
        message,
        synced: syncedCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : null,
        totalItems: summary.length,
        configuredProductsCount: configuredProductIds.size,
      };
    } catch (error) {
      console.error("Error syncing app sales:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
