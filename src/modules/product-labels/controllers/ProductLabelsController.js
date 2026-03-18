import { opsPool } from "../../../db/pool.js";
import { buildSEO } from "../../../utils/seo.js";
import { LabelOrderModel } from "../models/LabelOrderModel.js";
import { ProductLabelModel } from "../models/ProductLabelModel.js";

export class ProductLabelsController {
  // UI Routes
  static async renderDashboard(req, res) {
    try {
      const seo = buildSEO({ title: "Product Labels Dashboard — Ops", url: req.path });

      // Get dashboard statistics
      let stats = {
        totalLabels: 0,
        totalOrders: 0,
        pendingOrders: 0,
        activeVendors: 0,
        recentOrders: [],
      };

      if (opsPool) {
        try {
          // Get total labels count
          const [labelCount] = await opsPool.query(
            "SELECT COUNT(*) as total FROM product_labels WHERE active = 1"
          );
          stats.totalLabels = labelCount[0]?.total || 0;

          // Get total orders count
          const [orderCount] = await opsPool.query(
            "SELECT COUNT(*) as total FROM label_orders"
          );
          stats.totalOrders = orderCount[0]?.total || 0;

          // Get pending orders count (pending, confirmed, in_production)
          const [pendingCount] = await opsPool.query(
            "SELECT COUNT(*) as total FROM label_orders WHERE status IN ('pending', 'confirmed', 'in_production')"
          );
          stats.pendingOrders = pendingCount[0]?.total || 0;

          // Get active vendors count
          const [vendorCount] = await opsPool.query(
            "SELECT COUNT(*) as total FROM printing_vendors WHERE active = 1"
          );
          stats.activeVendors = vendorCount[0]?.total || 0;

          // Get recent orders (last 10)
          const recentOrdersResult = await LabelOrderModel.listOrders({
            limit: 10,
            offset: 0,
          });
          
          // Get number of items for each order
          if (recentOrdersResult.success && recentOrdersResult.orders) {
            for (const order of recentOrdersResult.orders) {
              try {
                const [itemCount] = await opsPool.query(
                  "SELECT COUNT(*) as count FROM label_order_items WHERE order_id = ?",
                  [order.id]
                );
                order.item_count = itemCount[0]?.count || 0;
              } catch (error) {
                console.error(`Error fetching item count for order ${order.id}:`, error);
                order.item_count = 0;
              }
            }
          }
          
          stats.recentOrders = recentOrdersResult.success ? recentOrdersResult.orders || [] : [];
        } catch (error) {
          console.error("Error fetching dashboard stats:", error);
        }
      }

      res.render("pages/ops/product-labels/dashboard", {
        seo,
        pageKey: "ops/product-labels/dashboard",
        promo: false,
        user: req.user,
        stats,
      });
    } catch (error) {
      console.error("ProductLabelsController.renderDashboard error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Product Labels Dashboard — Error" },
        pageKey: "ops/product-labels/dashboard/error",
        promo: false,
        user: req.user,
        title: "Unable to load Dashboard",
        message: "Something went wrong while loading the Product Labels dashboard.",
        error,
      });
    }
  }

  static async renderLabelsPage(req, res) {
    try {
      const seo = buildSEO({ title: "Product Labels — Ops", url: req.path });

      // Get products for dropdown
      let products = [];
      if (opsPool) {
        try {
          const [productRows] = await opsPool.query(
            "SELECT id, name, unit_size FROM products WHERE is_active = 1 ORDER BY name ASC"
          );
          products = productRows || [];
        } catch (error) {
          console.error("Error fetching products:", error);
        }
      }

      // Ensure thumbnails exist for all design files (async, don't wait)
      // This will be handled when labels are loaded via API, so we don't need to do it here
      // The API endpoint will handle thumbnail generation

      res.render("pages/ops/product-labels/labels/index", {
        seo,
        pageKey: "ops/product-labels/labels/index",
        promo: false,
        user: req.user,
        products,
      });
    } catch (error) {
      console.error("ProductLabelsController.renderLabelsPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Product Labels — Error" },
        pageKey: "ops/product-labels/error",
        promo: false,
        user: req.user,
        title: "Unable to load Product Labels",
        message: "Something went wrong while loading the Product Labels module.",
        error,
      });
    }
  }

  // API Routes
  static async listLabels(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", productId = "", active = "" } = req.query;

      const result = await ProductLabelModel.listLabels({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        productId: productId ? Number(productId) : null,
        active: active !== "" ? active === "true" : null,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list labels" });
      }

      // Ensure thumbnails exist for all design files (async, don't wait)
      if (result.labels && result.labels.length > 0) {
        import("../utils/pdfThumbnail.js").then(({ ensureThumbnailExists }) => {
          result.labels.forEach(label => {
            if (label.design_file_path) {
              ensureThumbnailExists(label.design_file_path).catch(error => {
                console.error(`Error ensuring thumbnail for ${label.design_file_path}:`, error);
              });
            }
          });
        }).catch(error => {
          console.error("Error importing thumbnail utility:", error);
        });
      }

      return res.json({ success: true, labels: result.labels, total: result.total });
    } catch (error) {
      console.error("ProductLabelsController.listLabels error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getLabelById(req, res) {
    try {
      const { labelId } = req.params;
      const result = await ProductLabelModel.getLabelById(labelId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Label not found" });
      }

      return res.json({ success: true, label: result.label });
    } catch (error) {
      console.error("ProductLabelsController.getLabelById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createLabel(req, res) {
    try {
      // Use the exact text from the Product field (req.body.name)
      // Only fetch unit_size from database if not provided
      let unitSize = req.body.unit_size;
      let productName = req.body.name; // Use the exact text from the form

      if (req.body.product_id && opsPool && !unitSize) {
        try {
          const [productRows] = await opsPool.query(
            "SELECT unit_size FROM products WHERE id = ?",
            [req.body.product_id]
          );
          if (productRows && productRows.length > 0) {
            unitSize = productRows[0].unit_size || unitSize;
          }
        } catch (error) {
          console.error("Error fetching product details:", error);
        }
      }

      const labelData = {
        product_id: req.body.product_id,
        name: productName, // Use exact text from Product field
        unit_size: unitSize,
        label_type: req.body.label_type || "sticker",
        label_material: req.body.label_material || "white pvc",
        cutting: req.body.cutting || "Full",
        design_file_path: req.file ? `/uploads/product-labels/designs/${req.file.filename}` : null,
        design_file_name: req.file ? req.file.originalname : null,
        notes: req.body.notes,
        active: req.body.active === 'on' || req.body.active === 'true' || req.body.active === true || req.body.active === 1 ? 1 : 0,
        created_by: req.user?.id || null,
      };

      const result = await ProductLabelModel.createLabel(labelData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create label" });
      }

      // Generate thumbnail if design file is uploaded (async, don't wait)
      if (req.file && labelData.design_file_path) {
        import("../utils/pdfThumbnail.js").then(({ ensureThumbnailExists }) => {
          ensureThumbnailExists(labelData.design_file_path).catch(error => {
            console.error("Error generating thumbnail during label creation:", error);
          });
        }).catch(error => {
          console.error("Error importing thumbnail utility:", error);
        });
      }

      return res.json({ success: true, label: { id: result.id } });
    } catch (error) {
      console.error("ProductLabelsController.createLabel error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateLabel(req, res) {
    try {
      const { labelId } = req.params;
      const labelData = {};

      // If name is provided in body, use it (allows custom names)
      if (req.body.name !== undefined) {
        labelData.name = req.body.name; // Use exact text from Product field
      }
      
      if (req.body.product_id !== undefined) {
        labelData.product_id = req.body.product_id;
        
        // Only fetch unit_size from database if not provided in form
        if (opsPool && !req.body.unit_size) {
          try {
            const [productRows] = await opsPool.query(
              "SELECT unit_size FROM products WHERE id = ?",
              [req.body.product_id]
            );
            if (productRows && productRows.length > 0) {
              labelData.unit_size = productRows[0].unit_size;
            }
          } catch (error) {
            console.error("Error fetching product details:", error);
          }
        }
      }
      
      // Only update name/unit_size if explicitly provided (for backward compatibility)
      if (req.body.name !== undefined && !labelData.name) labelData.name = req.body.name;
      if (req.body.unit_size !== undefined && !labelData.unit_size) labelData.unit_size = req.body.unit_size;
      if (req.body.label_type !== undefined) labelData.label_type = req.body.label_type;
      if (req.body.label_material !== undefined) labelData.label_material = req.body.label_material;
      if (req.body.cutting !== undefined) labelData.cutting = req.body.cutting;
      if (req.body.notes !== undefined) labelData.notes = req.body.notes;
      if (req.body.active !== undefined) {
        labelData.active = req.body.active === 'on' || req.body.active === 'true' || req.body.active === true || req.body.active === 1 ? 1 : 0;
      }

      // Handle file upload if provided
      if (req.file) {
        labelData.design_file_path = `/uploads/product-labels/designs/${req.file.filename}`;
        labelData.design_file_name = req.file.originalname;

        // Delete old file and thumbnail if exists
        const existingLabel = await ProductLabelModel.getLabelById(labelId);
        if (existingLabel.success && existingLabel.label.design_file_path) {
          const fs = await import("fs");
          const path = await import("path");
          const oldFilePath = path.join(process.cwd(), "public", existingLabel.label.design_file_path);
          try {
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
            
            // Delete old thumbnail
            const { getThumbnailPath } = await import("../utils/pdfThumbnail.js");
            const oldThumbnailPath = getThumbnailPath(existingLabel.label.design_file_path);
            if (oldThumbnailPath) {
              const fullOldThumbnailPath = path.join(process.cwd(), "public", oldThumbnailPath);
              if (fs.existsSync(fullOldThumbnailPath)) {
                fs.unlinkSync(fullOldThumbnailPath);
              }
            }
          } catch (error) {
            console.error("Error deleting old file:", error);
          }
        }

        // Generate thumbnail for new design file (async, don't wait)
        if (labelData.design_file_path) {
          import("../utils/pdfThumbnail.js").then(({ ensureThumbnailExists }) => {
            ensureThumbnailExists(labelData.design_file_path).catch(error => {
              console.error("Error generating thumbnail during label update:", error);
            });
          }).catch(error => {
            console.error("Error importing thumbnail utility:", error);
          });
        }
      }

      const result = await ProductLabelModel.updateLabel(labelId, labelData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update label" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("ProductLabelsController.updateLabel error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteLabel(req, res) {
    try {
      const { labelId } = req.params;

      // Get label to delete file
      const existingLabel = await ProductLabelModel.getLabelById(labelId);
      if (existingLabel.success && existingLabel.label.design_file_path) {
        const fs = await import("fs");
        const path = await import("path");
        const filePath = path.join(process.cwd(), "public", existingLabel.label.design_file_path);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error("Error deleting file:", error);
        }
      }

      const result = await ProductLabelModel.deleteLabel(labelId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete label" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("ProductLabelsController.deleteLabel error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}


