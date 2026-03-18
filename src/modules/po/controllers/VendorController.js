import POVendorModel from "../models/VendorModel.js";

class POVendorController {
  // Get all vendors
  static async getAllVendors(req, res) {
    try {
      const filters = {
        search: req.query.search,
        status: req.query.status,
      };

      const result = await POVendorModel.getAllVendors(filters);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get vendor by ID
  static async getVendorById(req, res) {
    try {
      const { id } = req.params;
      const result = await POVendorModel.getVendorById(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Create vendor
  static async createVendor(req, res) {
    try {
      const vendorData = {
        ...req.body,
        created_by: req.session?.user?.id || 1,
      };

      const result = await POVendorModel.createVendor(vendorData);

      if (result.success) {
        res.json({ success: true, message: "Vendor created successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Update vendor
  static async updateVendor(req, res) {
    try {
      const { id } = req.params;
      const vendorData = {
        ...req.body,
        updated_by: req.session?.user?.id || 1,
      };

      const result = await POVendorModel.updateVendor(id, vendorData);

      if (result.success) {
        res.json({ success: true, message: "Vendor updated successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete vendor
  static async deleteVendor(req, res) {
    try {
      const { id } = req.params;
      const result = await POVendorModel.deleteVendor(id);

      if (result.success) {
        res.json({ success: true, message: "Vendor deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Add vendor document
  static async addDocument(req, res) {
    try {
      const { id } = req.params;
      const documentData = {
        vendor_id: id,
        ...req.body,
        uploaded_by: req.session?.user?.id || 1,
      };

      const result = await POVendorModel.addDocument(documentData);

      if (result.success) {
        res.json({ success: true, message: "Document added successfully", data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error adding document:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Delete vendor document
  static async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;
      const result = await POVendorModel.deleteDocument(documentId);

      if (result.success) {
        res.json({ success: true, message: "Document deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Get vendor performance
  static async getVendorPerformance(req, res) {
    try {
      const { id } = req.params;
      const result = await POVendorModel.getVendorPerformance(id);

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error fetching vendor performance:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default POVendorController;
