import { MaterialLocationModel } from "../models/MaterialLocationModel.js";

export class MaterialLocationController {
  // Get all locations
  static async getAll(req, res) {
    try {
      const result = await MaterialLocationModel.getAll();
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ success: false, error: "Failed to fetch locations" });
    }
  }

  // Get location by ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const location = await MaterialLocationModel.getById(id);

      if (!location) {
        return res.status(404).json({ success: false, error: "Location not found" });
      }

      res.json({ success: true, data: location });
    } catch (error) {
      console.error("Error fetching location:", error);
      res.status(500).json({ success: false, error: "Failed to fetch location" });
    }
  }

  // Create new location
  static async create(req, res) {
    try {
      const { name, description, location_type } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, error: "Location name is required" });
      }

      const result = await MaterialLocationModel.create({
        name: name.trim(),
        description,
        location_type: location_type || "other",
      });

      res.status(201).json({
        success: true,
        data: {
          id: result.id,
          name: name.trim(),
          description,
          location_type: location_type || "other",
        },
      });
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ success: false, error: "Failed to create location" });
    }
  }

  // Update location
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { name, description, location_type } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, error: "Location name is required" });
      }

      const success = await MaterialLocationModel.update(id, {
        name: name.trim(),
        description,
        location_type: location_type || "other",
      });

      if (!success) {
        return res.status(404).json({ success: false, error: "Location not found" });
      }

      res.json({ success: true, message: "Location updated successfully" });
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ success: false, error: "Failed to update location" });
    }
  }

  // Deactivate location
  static async deactivate(req, res) {
    try {
      const { id } = req.params;
      const success = await MaterialLocationModel.deactivate(id);

      if (!success) {
        return res.status(404).json({ success: false, error: "Location not found" });
      }

      res.json({ success: true, message: "Location deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating location:", error);
      res.status(500).json({ success: false, error: "Failed to deactivate location" });
    }
  }
}
