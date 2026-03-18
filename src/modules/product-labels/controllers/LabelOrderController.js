import { LabelOrderModel } from "../models/LabelOrderModel.js";
import { buildSEO } from "../../../utils/seo.js";

export class LabelOrderController {
  // UI Routes
  static async renderOrdersPage(req, res) {
    try {
      const seo = buildSEO({ title: "Label Orders — Ops", url: req.path });

      res.render("pages/ops/product-labels/orders/index", {
        seo,
        pageKey: "ops/product-labels/orders/index",
        promo: false,
        user: req.user,
      });
    } catch (error) {
      console.error("LabelOrderController.renderOrdersPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Label Orders — Error" },
        pageKey: "ops/product-labels/orders/error",
        promo: false,
        user: req.user,
        title: "Unable to load Label Orders",
        message: "Something went wrong while loading the Label Orders module.",
        error,
      });
    }
  }

  static async renderCreateOrderPage(req, res) {
    try {
      const { orderId } = req.params;
      const seo = buildSEO({ 
        title: orderId ? "Edit Label Order — Ops" : "Create Label Order — Ops", 
        url: req.path 
      });

      // Load vendors and labels
      const { PrintingVendorModel } = await import("../models/PrintingVendorModel.js");
      const { ProductLabelModel } = await import("../models/ProductLabelModel.js");

      const vendorsResult = await PrintingVendorModel.listVendors({ limit: 1000, offset: 0 });
      const labelsResult = await ProductLabelModel.listLabels({ limit: 1000, offset: 0 });

      const vendors = vendorsResult.success ? vendorsResult.vendors.filter(v => v.active === 1) : [];
      const labels = labelsResult.success ? labelsResult.labels.filter(l => l.active === 1) : [];

      let order = null;
      if (orderId) {
        const orderResult = await LabelOrderModel.getOrderById(orderId);
        if (orderResult.success) {
          order = orderResult.order;
        }
      }

      res.render("pages/ops/product-labels/orders/create", {
        seo,
        pageKey: "ops/product-labels/orders/create",
        promo: false,
        user: req.user,
        orderId: orderId || null,
        order: order,
        vendors: vendors,
        labels: labels,
      });
    } catch (error) {
      console.error("LabelOrderController.renderCreateOrderPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Create Order — Error" },
        pageKey: "ops/product-labels/orders/error",
        promo: false,
        user: req.user,
        title: "Unable to load Create Order page",
        message: "Something went wrong while loading the Create Order page.",
        error,
      });
    }
  }

  static async renderOrderPage(req, res) {
    try {
      const { orderNumber } = req.params;
      const seo = buildSEO({ title: `Order ${orderNumber} — Ops`, url: req.path });

      const result = await LabelOrderModel.getOrderByOrderNumber(orderNumber);

      if (!result.success) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Order Not Found" },
          pageKey: "ops/product-labels/orders/error",
          promo: false,
          user: req.user,
          title: "Order Not Found",
          message: "The requested order could not be found.",
        });
      }

      // Ensure thumbnails exist for all design files (async, don't wait)
      if (result.order.items) {
        import("../utils/pdfThumbnail.js").then(({ ensureThumbnailExists }) => {
          result.order.items.forEach(item => {
            if (item.design_file_path) {
              ensureThumbnailExists(item.design_file_path).catch(error => {
                console.error(`Error ensuring thumbnail for ${item.design_file_path}:`, error);
              });
            }
          });
        }).catch(error => {
          console.error("Error importing thumbnail utility:", error);
        });
      }

      res.render("pages/ops/product-labels/orders/view", {
        seo,
        pageKey: "ops/product-labels/orders/view",
        promo: false,
        user: req.user,
        order: result.order,
      });
    } catch (error) {
      console.error("LabelOrderController.renderOrderPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Order — Error" },
        pageKey: "ops/product-labels/orders/error",
        promo: false,
        user: req.user,
        title: "Unable to load Order",
        message: "Something went wrong while loading the order.",
        error,
      });
    }
  }

  static async renderShareableOrderPage(req, res) {
    try {
      const { shareCode } = req.params;
      const seo = buildSEO({ title: "Order View — Vendor", url: req.path });

      // Handle POST request (passcode submission)
      if (req.method === "POST") {
        const providedPasscode = req.body.passcode;

        if (!providedPasscode) {
          return res.render("pages/ops/product-labels/orders/share-access", {
            seo,
            pageKey: "ops/product-labels/orders/share-access",
            promo: false,
            shareCode,
            error: "Please enter a passcode.",
          });
        }

        // Verify passcode
        const verifyResult = await LabelOrderModel.verifySharePasscode(shareCode, providedPasscode);
        if (!verifyResult.success) {
          return res.render("pages/ops/product-labels/orders/share-access", {
            seo,
            pageKey: "ops/product-labels/orders/share-access",
            promo: false,
            shareCode,
            error: "Invalid passcode. Please try again.",
          });
        }

        // Store passcode verification in session for future requests
        if (!req.session.sharePasscode) {
          req.session.sharePasscode = {};
        }
        req.session.sharePasscode[shareCode] = true; // Store verification status, not the passcode itself

        // Redirect to the same URL without passcode in query string
        return res.redirect(`/ops/product-labels/orders/share/${shareCode}`);
      }

      // Handle GET request - check if already verified in session
      const isVerified = req.session?.sharePasscode?.[shareCode];

      if (!isVerified) {
        // Show passcode entry page
        return res.render("pages/ops/product-labels/orders/share-access", {
          seo,
          pageKey: "ops/product-labels/orders/share-access",
          promo: false,
          shareCode,
        });
      }

      // Get order details
      const result = await LabelOrderModel.getOrderByShareCode(shareCode);

      if (!result.success) {
        return res.status(404).render("pages/ops/error", {
          seo: { title: "Order Not Found" },
          pageKey: "ops/product-labels/orders/error",
          promo: false,
          title: "Order Not Found",
          message: "The requested order could not be found.",
        });
      }

      res.render("pages/ops/product-labels/orders/share-view", {
        seo,
        pageKey: "ops/product-labels/orders/share-view",
        promo: false,
        order: result.order,
      });
    } catch (error) {
      console.error("LabelOrderController.renderShareableOrderPage error:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Order — Error" },
        pageKey: "ops/product-labels/orders/error",
        promo: false,
        title: "Unable to load Order",
        message: "Something went wrong while loading the order.",
        error,
      });
    }
  }

  // API Routes
  static async listOrders(req, res) {
    try {
      const { limit = 100, offset = 0, search = "", vendorId = "", status = "" } = req.query;

      const result = await LabelOrderModel.listOrders({
        limit: Number(limit),
        offset: Number(offset),
        search: search || "",
        vendorId: vendorId ? Number(vendorId) : null,
        status: status || null,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to list orders" });
      }

      return res.json({ success: true, orders: result.orders, total: result.total });
    } catch (error) {
      console.error("LabelOrderController.listOrders error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async getOrderById(req, res) {
    try {
      const { orderId } = req.params;
      const result = await LabelOrderModel.getOrderById(orderId);

      if (!result.success) {
        return res.status(404).json({ success: false, error: result.error || "Order not found" });
      }

      return res.json({ success: true, order: result.order });
    } catch (error) {
      console.error("LabelOrderController.getOrderById error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async createOrder(req, res) {
    try {
      const orderData = {
        vendor_id: req.body.vendor_id,
        status: req.body.status || "draft",
        order_date: req.body.order_date || new Date().toISOString().split("T")[0],
        expected_delivery_date: req.body.expected_delivery_date || null,
        total_quantity: req.body.total_quantity || 0,
        total_cost: req.body.total_cost || null,
        notes: req.body.notes,
        created_by: req.user?.id || null,
        items: req.body.items || [],
      };

      const result = await LabelOrderModel.createOrder(orderData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to create order" });
      }

      return res.json({ success: true, id: result.id, order_number: result.order_number });
    } catch (error) {
      console.error("LabelOrderController.createOrder error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async updateOrder(req, res) {
    try {
      const { orderId } = req.params;
      const orderData = {};

      if (req.body.vendor_id !== undefined) orderData.vendor_id = req.body.vendor_id;
      if (req.body.status !== undefined) orderData.status = req.body.status;
      if (req.body.order_date !== undefined) orderData.order_date = req.body.order_date;
      if (req.body.expected_delivery_date !== undefined) orderData.expected_delivery_date = req.body.expected_delivery_date;
      if (req.body.actual_delivery_date !== undefined) orderData.actual_delivery_date = req.body.actual_delivery_date;
      if (req.body.total_quantity !== undefined) orderData.total_quantity = req.body.total_quantity;
      if (req.body.total_cost !== undefined) orderData.total_cost = req.body.total_cost;
      if (req.body.notes !== undefined) orderData.notes = req.body.notes;

      const result = await LabelOrderModel.updateOrder(orderId, orderData);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to update order" });
      }

      // Update items if provided
      if (req.body.items !== undefined) {
        const itemsResult = await LabelOrderModel.updateOrderItems(orderId, req.body.items);
        if (!itemsResult.success) {
          return res.status(500).json({ success: false, error: itemsResult.error || "Unable to update order items" });
        }
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("LabelOrderController.updateOrder error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async deleteOrder(req, res) {
    try {
      const { orderId } = req.params;
      const result = await LabelOrderModel.deleteOrder(orderId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to delete order" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("LabelOrderController.deleteOrder error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  static async generateShareLink(req, res) {
    try {
      const { orderId } = req.params;

      const result = await LabelOrderModel.generateOrGetShareCode(orderId);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error || "Unable to generate share link" });
      }

      return res.json({
        success: true,
        share_code: result.share_code,
        passcode: result.passcode,
      });
    } catch (error) {
      console.error("LabelOrderController.generateShareLink error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}


