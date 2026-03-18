import { PartnerProductPricingModel } from "../models/PartnerProductPricingModel.js";
import { SalesPartnerModel } from "../models/SalesPartnerModel.js";
import { ProductModel } from "../../production/models/ProductModel.js";

export class PartnerProductPricingController {
  // Get pricing page - show pricing for all partners
  static async getPricingPage(req, res) {
    try {
      const seo = { title: "Partner Product Pricing", description: "Manage product pricing for partners" };

      // Get all partners
      const partnersResult = await SalesPartnerModel.getAllPartners(false);
      const partners = partnersResult.rows || [];

      // Get all products
      const productsResult = await ProductModel.getAllProducts();
      const products = productsResult.rows || [];

      // Get all pricing
      const pricingResult = await PartnerProductPricingModel.getAllPricing();
      const allPricing = pricingResult.rows || [];

      // Group pricing by partner
      const pricingByPartner = {};
      allPricing.forEach(pricing => {
        if (!pricingByPartner[pricing.partner_id]) {
          pricingByPartner[pricing.partner_id] = [];
        }
        pricingByPartner[pricing.partner_id].push(pricing);
      });

      res.render("pages/ops/sales/partner-product-pricing", {
        seo,
        user: req.user,
        pageKey: "sales",
        partners,
        products,
        pricingByPartner,
        allPricing
      });
    } catch (error) {
      console.error("Error loading pricing page:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get pricing for a specific partner
  static async getPricingByPartner(req, res) {
    try {
      const { partnerId } = req.params;
      const result = await PartnerProductPricingModel.getPricingByPartner(partnerId);
      
      if (result.success) {
        res.json({ success: true, pricing: result.rows });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching pricing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get pricing by ID
  static async getPricingById(req, res) {
    try {
      const { id } = req.params;
      const result = await PartnerProductPricingModel.getPricingById(id);
      
      if (result.success && result.row) {
        res.json({ success: true, pricing: result.row });
      } else {
        res.status(404).json({ success: false, error: "Pricing not found" });
      }
    } catch (error) {
      console.error("Error fetching pricing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create or update pricing
  static async savePricing(req, res) {
    try {
      const { partner_id, product_id, basic_price, gst_percentage, gst_amount } = req.body;

      if (!partner_id || !product_id || !basic_price) {
        return res.status(400).json({
          success: false,
          error: "Partner, product, and unit price are required",
        });
      }

      const result = await PartnerProductPricingModel.savePricing({
        partner_id: parseInt(partner_id),
        product_id: parseInt(product_id),
        basic_price: parseFloat(basic_price),
        gst_percentage: gst_percentage ? parseFloat(gst_percentage) : null,
        gst_amount: gst_amount ? parseFloat(gst_amount) : null,
      });

      if (result.success) {
        res.json({
          success: true,
          message: result.isUpdate ? "Pricing updated successfully" : "Pricing created successfully",
          id: result.id
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error saving pricing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete pricing
  static async deletePricing(req, res) {
    try {
      const { id } = req.params;
      const result = await PartnerProductPricingModel.deletePricing(id);

      if (result.success) {
        res.json({ success: true, message: "Pricing deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting pricing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

