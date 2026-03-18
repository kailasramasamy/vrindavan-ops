import { buildSEO } from "../../../utils/seo.js";
import { MilkPoolModel } from "../models/MilkPoolModel.js";

// Get all milk pools
export const getAllMilkPools = async (req, res) => {
  try {
    const { milk_type } = req.query;
    const filters = { milk_type };

    const result = await MilkPoolModel.getAllMilkPools(filters);

    if (result.success) {
      res.json({ success: true, pools: result.rows });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error fetching milk pools:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get milk pool by ID
export const getMilkPoolById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await MilkPoolModel.getMilkPoolById(id);

    if (result.success && result.rows.length > 0) {
      res.json({ success: true, pool: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: "Milk pool not found" });
    }
  } catch (error) {
    console.error("Error fetching milk pool:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create new milk pool
export const createMilkPool = async (req, res) => {
  try {
    const { name, description, milk_type, is_active } = req.body;

    if (!name || !milk_type) {
      return res.status(400).json({ success: false, error: "Name and milk type are required" });
    }

    const result = await MilkPoolModel.createMilkPool({
      name,
      description,
      milk_type,
      is_active: is_active !== undefined ? is_active : true,
    });

    if (result.success) {
      res.json({ success: true, message: "Milk pool created successfully", id: result.insertId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error creating milk pool:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update milk pool
export const updateMilkPool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, milk_type, is_active } = req.body;

    if (!name || !milk_type) {
      return res.status(400).json({ success: false, error: "Name and milk type are required" });
    }

    const result = await MilkPoolModel.updateMilkPool(id, {
      name,
      description,
      milk_type,
      is_active,
    });

    if (result.success) {
      res.json({ success: true, message: "Milk pool updated successfully" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error updating milk pool:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete milk pool
export const deleteMilkPool = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await MilkPoolModel.deleteMilkPool(id);

    if (result.success) {
      res.json({ success: true, message: "Milk pool deleted successfully" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error deleting milk pool:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get daily pool allocations
export const getDailyPoolAllocations = async (req, res) => {
  try {
    const { date } = req.query;
    const allocation_date = date || new Date().toISOString().split("T")[0];

    const result = await MilkPoolModel.getDailyPoolAllocations(allocation_date);

    if (result.success) {
      res.json({ success: true, allocations: result.rows });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error fetching daily pool allocations:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Save daily pool allocation
export const saveDailyPoolAllocation = async (req, res) => {
  try {
    const { allocation_date, pool_id, milk_allocated, notes } = req.body;

    if (!allocation_date || !pool_id || milk_allocated === undefined) {
      return res.status(400).json({ success: false, error: "Allocation date, pool ID, and milk allocated are required" });
    }

    const result = await MilkPoolModel.upsertDailyPoolAllocation({
      allocation_date,
      pool_id,
      milk_allocated,
      notes: notes || "",
      created_by: req.user?.id || 1,
    });

    if (result.success) {
      res.json({ success: true, message: "Pool allocation saved successfully" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error saving daily pool allocation:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete daily pool allocation
export const deleteDailyPoolAllocation = async (req, res) => {
  try {
    const { allocation_date, pool_id } = req.body;

    if (!allocation_date || !pool_id) {
      return res.status(400).json({ success: false, error: "Allocation date and pool ID are required" });
    }

    const result = await MilkPoolModel.deleteDailyPoolAllocation(allocation_date, pool_id);

    if (result.success) {
      res.json({ success: true, message: "Pool allocation deleted successfully" });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error("Error deleting daily pool allocation:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Render milk pools management page
export const renderMilkPools = async (req, res) => {
  try {
    const result = await MilkPoolModel.getAllMilkPools();

    if (result.success) {
      res.render("pages/ops/production/pool-management", {
        title: "Pool Management",
        pageKey: "ops/production/pool-management",
        pools: result.rows,
        seo: buildSEO({
          title: "Pool Management - Production Management",
          description: "Manage milk pools for production allocation",
          keywords: "milk pools, production, allocation, dairy management",
        }),
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    } else {
      res.status(500).render("pages/ops/production/pool-management", {
        title: "Pool Management",
        pageKey: "ops/production/pool-management",
        pools: [],
        error: result.error,
        seo: buildSEO({
          title: "Pool Management - Production Management",
          description: "Manage milk pools for production allocation",
          keywords: "milk pools, production, allocation, dairy management",
        }),
        section: "Admin",
        subsection: "Products",
        user: req.user,
      });
    }
  } catch (error) {
    console.error("Error rendering pool management page:", error);
    res.status(500).render("pages/ops/production/pool-management", {
      title: "Pool Management",
      pageKey: "ops/production/pool-management",
      pools: [],
      error: error.message,
      seo: buildSEO({
        title: "Pool Management - Production Management",
        description: "Manage milk pools for production allocation",
        keywords: "milk pools, production, allocation, dairy management",
      }),
      section: "Admin",
      subsection: "Products",
      user: req.user,
    });
  }
};
