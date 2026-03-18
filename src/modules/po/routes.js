import express from "express";
import pool from "../../db/pool.js";
import CategoryController from "./controllers/CategoryController.js";
import LogisticsPartnerController from "./controllers/LogisticsPartnerController.js";
import ProcurementItemController from "./controllers/ProcurementItemController.js";
import PurchaseOrderController from "./controllers/PurchaseOrderController.js";
import * as VariantPricingController from "./controllers/VariantPricingController.js";
import POVendorController from "./controllers/VendorController.js";
import { invoiceUpload, poUpload, poUploadMultiple } from "./middleware/upload.js";

const router = express.Router();

// Authentication is handled by the parent ops router

// ==================== Category Routes ====================

// Categories API
router.get("/api/v1/categories", CategoryController.getAllCategories);
router.get("/api/v1/categories/:id", CategoryController.getCategoryById);
router.post("/api/v1/categories", CategoryController.createCategory);
router.put("/api/v1/categories/:id", CategoryController.updateCategory);
router.delete("/api/v1/categories/:id", CategoryController.deleteCategory);
router.get("/api/v1/categories/stats", CategoryController.getCategoryStats);

// ==================== Product Routes ====================

// Products API
router.get("/api/v1/products", ProcurementItemController.getAllItems);
router.get("/api/v1/products/:id", ProcurementItemController.getItemById);
router.post("/api/v1/products", ProcurementItemController.createItem);
router.put("/api/v1/products/:id", ProcurementItemController.updateItem);
router.delete("/api/v1/products/:id", ProcurementItemController.deleteItem);

// Product Cost & Pricing
router.post("/api/v1/products/:id/cost", ProcurementItemController.addCostHistory);
router.post("/api/v1/products/:id/pricing", ProcurementItemController.addPricingHistory);
router.put("/api/v1/products/pricing/:pricingId/publish", ProcurementItemController.publishMRP);
router.post("/api/v1/products/:id/overhead", ProcurementItemController.addOverhead);
router.get("/api/v1/products/:id/cost-history", ProcurementItemController.getCostHistory);
router.get("/api/v1/products/:id/pricing-history", ProcurementItemController.getPricingHistory);

// Product Variants
router.get("/api/v1/products/:id/variants", ProcurementItemController.getVariants);
router.post("/api/v1/products/:id/variants", ProcurementItemController.createVariant);
router.put("/api/v1/variants/:id", ProcurementItemController.updateVariant);
router.delete("/api/v1/variants/:id", ProcurementItemController.deleteVariant);
router.put("/api/v1/products/:id/profit-margin", ProcurementItemController.updateDefaultProfitMargin);

// ==================== Vendor Routes ====================

// Vendors API
router.get("/api/v1/vendors", POVendorController.getAllVendors);
router.get("/api/v1/vendors/:id", POVendorController.getVendorById);
router.post("/api/v1/vendors", POVendorController.createVendor);
router.put("/api/v1/vendors/:id", POVendorController.updateVendor);
router.delete("/api/v1/vendors/:id", POVendorController.deleteVendor);

// Vendor Documents & Performance
router.post("/api/v1/vendors/:id/documents", POVendorController.addDocument);
router.delete("/api/v1/vendors/documents/:documentId", POVendorController.deleteDocument);
router.get("/api/v1/vendors/:id/performance", POVendorController.getVendorPerformance);

// ==================== Logistics Partner Routes ====================

// Logistics Partners API
router.get("/api/v1/logistics-partners", LogisticsPartnerController.getAllLogisticsPartners);
router.get("/api/v1/logistics-partners/dropdown", LogisticsPartnerController.getLogisticsPartnersForDropdown);
router.get("/api/v1/logistics-partners/stats", LogisticsPartnerController.getLogisticsPartnerStats);
router.get("/api/v1/logistics-partners/:id", LogisticsPartnerController.getLogisticsPartnerById);
router.post("/api/v1/logistics-partners", LogisticsPartnerController.createLogisticsPartner);
router.put("/api/v1/logistics-partners/:id", LogisticsPartnerController.updateLogisticsPartner);
router.delete("/api/v1/logistics-partners/:id", LogisticsPartnerController.deleteLogisticsPartner);

// ==================== Purchase Order Routes ====================

// Purchase Orders API
router.get("/api/v1/purchase-orders", PurchaseOrderController.getAllPOs);
router.get("/api/v1/purchase-orders/:id", PurchaseOrderController.getPOById);
router.post("/api/v1/purchase-orders", PurchaseOrderController.createPO);
router.put("/api/v1/purchase-orders/:id", PurchaseOrderController.updatePO);
router.delete("/api/v1/purchase-orders/:id", PurchaseOrderController.deletePO);

// PO Status & Workflow
router.put("/api/v1/purchase-orders/:id/status", PurchaseOrderController.changeStatus);

// PO Items
router.get("/api/v1/purchase-orders/:id/items", PurchaseOrderController.getPOItems);

// PO Payments
router.post("/api/v1/purchase-orders/:id/payments", PurchaseOrderController.recordPayment);
router.get("/api/v1/purchase-orders/:id/payments", PurchaseOrderController.getPaymentHistory);

// PO Invoice, Shipment, Payment
router.post("/api/v1/purchase-orders/:id/invoice", invoiceUpload.single("invoice_file"), PurchaseOrderController.addInvoice);
router.put("/api/v1/purchase-orders/:id/shipment", PurchaseOrderController.updateShipment);
router.post("/api/v1/purchase-orders/:id/payment", PurchaseOrderController.addPayment);

// Dashboard & Reports
router.get("/api/v1/dashboard/stats", PurchaseOrderController.getDashboardStats);
router.get("/api/v1/reports/invoices", PurchaseOrderController.getInvoicesReport);

// ==================== File Upload Routes ====================

// Single file upload
router.post("/api/v1/upload/:type", poUpload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: `/uploads/po/${req.params.type}/${req.file.filename}`,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Multiple file upload
router.post("/api/v1/upload-multiple/:type", poUploadMultiple.array("files", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No files uploaded" });
    }

    const uploadedFiles = req.files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/po/${req.params.type}/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
    }));

    res.json({
      success: true,
      message: `${req.files.length} file(s) uploaded successfully`,
      data: uploadedFiles,
    });
  } catch (error) {
    console.error("Error uploading files:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Admin Page Routes ====================

// Dashboard
router.get("/dashboard", async (req, res) => {
  try {
    res.render("pages/ops/po/dashboard", {
      seo: {
        title: "PO Dashboard - Vrindavan Farm",
        description: "Purchase Order Management Dashboard",
      },
      section: "po",
      subsection: "dashboard",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering PO dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
});

// Main PO route (redirects to dashboard)
router.get("/", async (req, res) => {
  try {
    res.render("pages/ops/po/dashboard", {
      seo: {
        title: "PO Management - Vrindavan Farm",
        description: "Purchase Order Management Dashboard",
      },
      section: "po",
      subsection: "dashboard",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering PO main page:", error);
    res.status(500).send("Error loading PO page");
  }
});

// Categories Pages
router.get("/categories", async (req, res) => {
  try {
    res.render("pages/ops/po/categories/index", {
      seo: {
        title: "Categories - PO Management",
        description: "Manage product categories for purchase orders",
      },
      section: "po",
      subsection: "categories",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering categories page:", error);
    res.status(500).send("Error loading categories");
  }
});

// Products Pages
router.get("/products", async (req, res) => {
  try {
    // Get categories and variants for filters
    const [categories] = await pool.execute("SELECT * FROM po_product_categories WHERE is_active = 1 ORDER BY name");
    const [variants] = await pool.execute("SELECT * FROM po_product_variants WHERE is_active = 1 ORDER BY sort_order");

    res.render("pages/ops/po/products/index", {
      seo: {
        title: "Products - PO Management",
        description: "Manage product profiles for purchase orders",
      },
      section: "po",
      subsection: "products",
      user: req.session?.user || null,
      categories,
      variants,
    });
  } catch (error) {
    console.error("Error rendering products page:", error);
    res.status(500).send("Error loading products");
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [categories] = await pool.execute("SELECT * FROM po_product_categories WHERE is_active = 1 ORDER BY name");
    const [variants] = await pool.execute("SELECT * FROM po_product_variants WHERE is_active = 1 ORDER BY sort_order");
    const [overheadTypes] = await pool.execute("SELECT * FROM po_overhead_types WHERE is_active = 1 ORDER BY name");

    res.render("pages/ops/po/products/view", {
      seo: {
        title: "Product Details - PO Management",
        description: "View and manage product details",
      },
      section: "po",
      subsection: "products",
      user: req.session?.user || null,
      productId: id,
      categories,
      variants,
      overheadTypes,
    });
  } catch (error) {
    console.error("Error rendering product view:", error);
    res.status(500).send("Error loading product");
  }
});

// Vendors Pages
router.get("/vendors", async (req, res) => {
  try {
    res.render("pages/ops/po/vendors/index", {
      seo: {
        title: "Vendors - PO Management",
        description: "Manage vendor profiles",
      },
      section: "po",
      subsection: "vendors",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering vendors page:", error);
    res.status(500).send("Error loading vendors");
  }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const { id } = req.params;

    res.render("pages/ops/po/vendors/view", {
      seo: {
        title: "Vendor Details - PO Management",
        description: "View and manage vendor details",
      },
      section: "po",
      subsection: "vendors",
      user: req.session?.user || null,
      vendorId: id,
    });
  } catch (error) {
    console.error("Error rendering vendor view:", error);
    res.status(500).send("Error loading vendor");
  }
});

// Logistics Partners Pages
router.get("/logistics-partners", async (req, res) => {
  try {
    res.render("pages/ops/po/logistics-partners/index", {
      seo: {
        title: "Logistics Partners - PO Management",
        description: "Manage logistics partners",
      },
      section: "po",
      subsection: "logistics-partners",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering logistics partners page:", error);
    res.status(500).send("Error loading logistics partners");
  }
});

// Purchase Orders Pages
router.get("/purchase-orders", async (req, res) => {
  try {
    const [vendors] = await pool.execute("SELECT id, name FROM po_vendors WHERE status = 'active' ORDER BY name");

    res.render("pages/ops/po/purchase-orders/index", {
      seo: {
        title: "Purchase Orders - PO Management",
        description: "Manage purchase orders",
      },
      section: "po",
      subsection: "purchase-orders",
      user: req.session?.user || null,
      vendors,
    });
  } catch (error) {
    console.error("Error rendering purchase orders page:", error);
    res.status(500).send("Error loading purchase orders");
  }
});

router.get("/purchase-orders/create", async (req, res) => {
  try {
    const [vendors] = await pool.execute("SELECT * FROM po_vendors WHERE status = 'active' ORDER BY name");
    const [products] = await pool.execute("SELECT id, name, sku_code FROM po_procurement_items WHERE status = 'active' ORDER BY name");
    const [templates] = await pool.execute("SELECT * FROM po_templates WHERE is_active = 1 ORDER BY template_name");

    res.render("pages/ops/po/purchase-orders/create", {
      seo: {
        title: "Create Purchase Order - PO Management",
        description: "Create new purchase order",
      },
      section: "po",
      subsection: "purchase-orders",
      user: req.session?.user || null,
      vendors,
      products,
      templates,
    });
  } catch (error) {
    console.error("Error rendering create PO page:", error);
    res.status(500).send("Error loading create PO page");
  }
});

router.get("/purchase-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [vendors] = await pool.execute("SELECT * FROM po_vendors WHERE status = 'active' ORDER BY name");
    const [products] = await pool.execute("SELECT id, name, sku_code FROM po_procurement_items WHERE status = 'active' ORDER BY name");

    res.render("pages/ops/po/purchase-orders/view", {
      seo: {
        title: "Purchase Order Details - PO Management",
        description: "View and manage purchase order",
      },
      section: "po",
      subsection: "purchase-orders",
      user: req.session?.user || null,
      poId: id,
      vendors,
      products,
    });
  } catch (error) {
    console.error("Error rendering PO view:", error);
    res.status(500).send("Error loading purchase order");
  }
});

router.get("/purchase-orders/:id/edit", async (req, res) => {
  try {
    const { id } = req.params;
    const [vendors] = await pool.execute("SELECT * FROM po_vendors WHERE status = 'active' ORDER BY name");
    const [products] = await pool.execute("SELECT id, name, sku_code FROM po_procurement_items WHERE status = 'active' ORDER BY name");

    res.render("pages/ops/po/purchase-orders/edit", {
      seo: {
        title: "Edit Purchase Order - PO Management",
        description: "Edit purchase order details and items",
      },
      section: "po",
      subsection: "purchase-orders",
      user: req.session?.user || null,
      poId: id,
      vendors,
      products,
    });
  } catch (error) {
    console.error("Error rendering PO edit page:", error);
    res.status(500).send("Error loading purchase order edit page");
  }
});

// Reports Page
router.get("/reports", async (req, res) => {
  try {
    const [vendors] = await pool.execute("SELECT id, name FROM po_vendors WHERE status = 'active' ORDER BY name");
    const [categories] = await pool.execute("SELECT id, name FROM po_product_categories WHERE is_active = 1 ORDER BY name");

    res.render("pages/ops/po/reports/index", {
      seo: {
        title: "Reports - PO Management",
        description: "Purchase order reports and analytics",
      },
      section: "po",
      subsection: "reports",
      user: req.session?.user || null,
      vendors,
      categories,
    });
  } catch (error) {
    console.error("Error rendering reports page:", error);
    res.status(500).send("Error loading reports");
  }
});

// ==================== Variant Pricing Routes ====================

// Variant Pricing API
router.post("/api/v1/purchase-orders/:poId/calculate-mrp", VariantPricingController.calculateMRP);
router.get("/api/v1/variants/:variantId/pricing", VariantPricingController.getVariantPricingData);
router.get("/api/v1/purchase-orders/:poId/pricing", VariantPricingController.getPOPricingData);
router.get("/api/v1/expense-settings", VariantPricingController.getExpenseSettings);
router.put("/api/v1/expense-settings", VariantPricingController.updateExpenseSettings);
router.get("/api/v1/pricing-data", VariantPricingController.getAllPricingData);
router.put("/api/v1/variants/:variantId/expenses/:procurementItemId", VariantPricingController.setVariantExpenses);
router.put("/api/v1/variants/:variantId/profit-margin/:procurementItemId", VariantPricingController.setVariantProfitMargin);
router.put("/api/v1/variants/:variantId/fixed-mrp/:procurementItemId", VariantPricingController.setVariantFixedMRP);
router.get("/api/v1/variants", async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT id, name, size as unit_size, base_unit FROM po_product_variants WHERE is_active = TRUE ORDER BY name`);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching variants:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Pricing Management Page
router.get("/pricing", async (req, res) => {
  try {
    res.render("pages/ops/po/pricing/index", {
      seo: {
        title: "Variant Pricing Management - Vrindavan Farm",
        description: "Calculate and manage MRP for product variants",
        keywords: "pricing, MRP, variants, profit margin",
      },
      section: "po",
      subsection: "pricing",
      user: req.session?.user || null,
    });
  } catch (error) {
    console.error("Error rendering pricing page:", error);
    res.status(500).send("Error loading pricing page");
  }
});

export default router;
