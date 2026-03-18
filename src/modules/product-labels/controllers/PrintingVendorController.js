import { PrintingVendorModel } from "../models/PrintingVendorModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class PrintingVendorController {
  // UI Routes
  static async renderVendorsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Printing Vendors — Ops", url: req.path });

      res.render("pages/ops/product-labels/vendors/index", {
        seo,
        pageKey: "ops/product-labels/vendors/index",
        promo: false,
        user: req.user,
      });
    } catch (error) {
      console.error("PrintingVendorController.renderVendorsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Printing Vendors — Error" },
        pageKey: "ops/product-labels/vendors/error",
        promo: false,
        user: req.user,
        title: "Unable to load Printing Vendors",
        message: "Something went wrong while loading the Printing Vendors module.",
        error,
      });
    }
  }

  // API Routes
  static async listVendors(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", active = "" } = req.query;

      const result = await PrintingVendorModel.listVendors({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        active: active !== "" ? active === "true" : null,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list vendors" });
      }

      return res.json({ success: true, vendors: result.vendors, total: result.total });
    } catch (error) {
      console.error("PrintingVendorController.listVendors error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getVendorById(req, res) {
    try {
      const { vendorId } = req.params;
      const result = await PrintingVendorModel.getVendorById(vendorId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Vendor not found" });
      }

      return res.json({ success: true, vendor: result.vendor });
    } catch (error) {
      console.error("PrintingVendorController.getVendorById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createVendor(req, res) {
    try {
      const vendorData = {
        name: req.body.name,
        contact_person: req.body.contact_person,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
        gst_number: req.body.gst_number,
        notes: req.body.notes,
        active: req.body.active !== undefined ? req.body.active : 1,
      };

      const result = await PrintingVendorModel.createVendor(vendorData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create vendor" });
      }

      return res.json({ success: true, id: result.id });
    } catch (error) {
      console.error("PrintingVendorController.createVendor error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateVendor(req, res) {
    try {
      const { vendorId } = req.params;
      const vendorData = {};

      if (req.body.name !== undefined) vendorData.name = req.body.name;
      if (req.body.contact_person !== undefined) vendorData.contact_person = req.body.contact_person;
      if (req.body.email !== undefined) vendorData.email = req.body.email;
      if (req.body.phone !== undefined) vendorData.phone = req.body.phone;
      if (req.body.address !== undefined) vendorData.address = req.body.address;
      if (req.body.city !== undefined) vendorData.city = req.body.city;
      if (req.body.state !== undefined) vendorData.state = req.body.state;
      if (req.body.pincode !== undefined) vendorData.pincode = req.body.pincode;
      if (req.body.gst_number !== undefined) vendorData.gst_number = req.body.gst_number;
      if (req.body.notes !== undefined) vendorData.notes = req.body.notes;
      if (req.body.active !== undefined) vendorData.active = req.body.active;

      const result = await PrintingVendorModel.updateVendor(vendorId, vendorData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update vendor" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("PrintingVendorController.updateVendor error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteVendor(req, res) {
    try {
      const { vendorId } = req.params;
      const result = await PrintingVendorModel.deleteVendor(vendorId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete vendor" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("PrintingVendorController.deleteVendor error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}


