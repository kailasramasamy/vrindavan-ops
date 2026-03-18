import { ProductMappingModel } from "../../../models/ProductMappingModel.js";
import { buildSEO } from "../../../utils/seo.js";
import { ProductModel } from "../../production/models/ProductModel.js";
import { SalesPartnerModel } from "../models/SalesPartnerModel.js";
import { PartnerProductPricingModel } from "../models/PartnerProductPricingModel.js";
import { hasModulePermission } from "../../../middleware/rbac.js";

export class ProductMappingController {
  // Check if user has product mappings access
  static async checkMappingsAccess(user, permission = 'read') {
    // Admin always has access
    if (user.role === 'admin') {
      return true;
    }
    return await hasModulePermission(user, 'sales', 'product_mappings', permission);
  }

  // View: Product Mappings Management Page
  static async getMappingsPage(req, res) {
    try {
      // Check access
      const hasAccess = await ProductMappingController.checkMappingsAccess(req.user, 'read');
      if (!hasAccess) {
        return res.status(403).render("pages/ops/error", {
          seo: { title: "Access Denied" },
          pageKey: "ops/error",
          title: "Access Denied",
          message: "You do not have permission to access Product Mappings.",
          error: { status: 403 },
          user: req.user
        });
      }

      const seo = buildSEO("Product Mappings Management", "Manage product mappings for external systems");

      // Get all mappings
      const mappingsResult = await ProductMappingModel.getAllMappings();
      const mappings = mappingsResult.rows || [];

      // Get all products for dropdown
      const productsResult = await ProductModel.getAllProducts();
      const products = productsResult.rows || [];
      
      // Debug: Log products count
      if (!productsResult.success) {
        console.error("Error fetching products:", productsResult.error);
      } else {
        console.log(`Loaded ${products.length} products for dropdown`);
      }

      // Get all partners for pricing
      const partnersResult = await SalesPartnerModel.getAllPartners(false);
      const partners = partnersResult.rows || [];

      // Get all pricing
      const pricingResult = await PartnerProductPricingModel.getAllPricing();
      const allPricing = pricingResult.rows || [];

      // Group mappings by source
      const mappingsBySource = mappings.reduce((acc, mapping) => {
        if (!acc[mapping.source]) {
          acc[mapping.source] = [];
        }
        acc[mapping.source].push(mapping);
        return acc;
      }, {});

      // Group pricing by partner
      const pricingByPartner = {};
      allPricing.forEach(pricing => {
        if (!pricingByPartner[pricing.partner_id]) {
          pricingByPartner[pricing.partner_id] = [];
        }
        pricingByPartner[pricing.partner_id].push(pricing);
      });

      res.render("pages/ops/sales/product-mappings", {
        seo,
        user: req.user,
        pageKey: "sales",
        mappings,
        mappingsBySource,
        products,
        sources: Object.keys(mappingsBySource),
        partners,
        pricingByPartner,
        allPricing,
      });
    } catch (error) {
      console.error("Error loading product mappings page:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Create mapping
  static async createMapping(req, res) {
    try {
      const { product_id, source, external_name, external_unit_size, notes } = req.body;

      if (!product_id || !source || !external_name) {
        return res.status(400).json({
          success: false,
          error: "Product, source, and external name are required",
        });
      }

      const result = await ProductMappingModel.createMapping({
        product_id,
        source,
        external_name,
        external_unit_size,
        notes,
      });

      if (result.success) {
        res.json({ success: true, message: "Product mapping created successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating mapping:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Update mapping
  static async updateMapping(req, res) {
    try {
      const { id } = req.params;
      const { product_id, source, external_name, external_unit_size, is_active, notes } = req.body;

      if (!product_id || !source || !external_name) {
        return res.status(400).json({
          success: false,
          error: "Product, source, and external name are required",
        });
      }

      const result = await ProductMappingModel.updateMapping(id, {
        product_id,
        source,
        external_name,
        external_unit_size,
        is_active: is_active !== undefined ? is_active : 1,
        notes,
      });

      if (result.success) {
        res.json({ success: true, message: "Product mapping updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating mapping:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Delete mapping
  static async deleteMapping(req, res) {
    try {
      const { id } = req.params;

      const result = await ProductMappingModel.deleteMapping(id);

      if (result.success) {
        res.json({ success: true, message: "Product mapping deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting mapping:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // API: Get mapping by ID
  static async getMappingById(req, res) {
    try {
      const { id } = req.params;

      const result = await ProductMappingModel.getAllMappings();
      const mapping = result.rows?.find((m) => m.id === parseInt(id));

      if (mapping) {
        res.json({ success: true, mapping });
      } else {
        res.status(404).json({ success: false, error: "Mapping not found" });
      }
    } catch (error) {
      console.error("Error fetching mapping:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
