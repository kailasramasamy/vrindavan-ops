# Purchase Order (PO) Management Module

A comprehensive system for managing products, vendors, and purchase orders with cost tracking, pricing management, and complete PO lifecycle workflow.

## 📚 Quick Links

- **Status:** [/docs/PO_MODULE_STATUS.md](../../../docs/PO_MODULE_STATUS.md) - Current implementation status
- **Guide:** [/docs/po-implementation-guide.md](../../../docs/po-implementation-guide.md) - Step-by-step implementation guide
- **Summary:** [/docs/po-module-summary.md](../../../docs/po-module-summary.md) - Complete feature summary
- **Technical:** [/docs/po-management-module.md](../../../docs/po-management-module.md) - Technical documentation

## 🚀 Quick Start

### 1. Setup Database

```bash
mysql -u root -p vrindavan_ops < sql/043_po_management_schema.sql
```

### 2. Access Dashboard

Navigate to: `http://localhost:3000/ops/po/dashboard`

### 3. Test API

Use Postman or Thunder Client with the endpoints below.

## 📁 Module Structure

```
src/modules/po/
├── README.md (this file)
├── models/
│   ├── ProductModel.js      # Product CRUD, cost/pricing/overhead management
│   ├── VendorModel.js        # Vendor CRUD, documents, performance metrics
│   └── PurchaseOrderModel.js # PO lifecycle, payments, shipments, invoices
├── controllers/
│   ├── ProductController.js  # Product API endpoints
│   ├── VendorController.js   # Vendor API endpoints
│   └── PurchaseOrderController.js # PO API endpoints
└── routes.js                 # All route definitions
```

## 🔗 API Endpoints

### Products (11 endpoints)

- `GET /api/v1/po/products` - List products
- `GET /api/v1/po/products/:id` - Get product details
- `POST /api/v1/po/products` - Create product
- `PUT /api/v1/po/products/:id` - Update product
- `DELETE /api/v1/po/products/:id` - Delete product
- `POST /api/v1/po/products/:id/cost` - Add cost history
- `POST /api/v1/po/products/:id/pricing` - Add pricing history
- `PUT /api/v1/po/products/pricing/:pricingId/publish` - Publish MRP
- `POST /api/v1/po/products/:id/overhead` - Add overhead
- `GET /api/v1/po/products/:id/cost-history` - Get cost history
- `GET /api/v1/po/products/:id/pricing-history` - Get pricing history

### Vendors (8 endpoints)

- `GET /api/v1/po/vendors` - List vendors
- `GET /api/v1/po/vendors/:id` - Get vendor details
- `POST /api/v1/po/vendors` - Create vendor
- `PUT /api/v1/po/vendors/:id` - Update vendor
- `DELETE /api/v1/po/vendors/:id` - Delete vendor
- `POST /api/v1/po/vendors/:id/documents` - Upload document
- `DELETE /api/v1/po/vendors/documents/:documentId` - Delete document
- `GET /api/v1/po/vendors/:id/performance` - Get performance metrics

### Purchase Orders (10 endpoints)

- `GET /api/v1/po/purchase-orders` - List POs
- `GET /api/v1/po/purchase-orders/:id` - Get PO details
- `POST /api/v1/po/purchase-orders` - Create PO
- `PUT /api/v1/po/purchase-orders/:id` - Update PO
- `DELETE /api/v1/po/purchase-orders/:id` - Delete PO
- `PUT /api/v1/po/purchase-orders/:id/status` - Change status
- `POST /api/v1/po/purchase-orders/:id/invoice` - Add invoice
- `PUT /api/v1/po/purchase-orders/:id/shipment` - Update shipment
- `POST /api/v1/po/purchase-orders/:id/payment` - Add payment
- `GET /api/v1/po/dashboard/stats` - Dashboard statistics

## 🌐 Page Routes

- `/ops/po/dashboard` - Main dashboard
- `/ops/po/products` - Product listing
- `/ops/po/products/:id` - Product details
- `/ops/po/vendors` - Vendor listing
- `/ops/po/vendors/:id` - Vendor details
- `/ops/po/purchase-orders` - PO listing
- `/ops/po/purchase-orders/create` - Create PO
- `/ops/po/purchase-orders/:id` - PO details
- `/ops/po/reports` - Reports & analytics

## 💾 Database Tables (18)

### Products

- `po_product_categories` - Categories with hierarchy
- `po_product_variants` - Reusable variants (50g, 100g, 1kg, etc.)
- `po_products` - Main product table
- `po_product_images` - Product images
- `po_product_variant_mappings` - Product-variant links
- `po_product_cost_history` - Cost tracking
- `po_overhead_types` - Overhead categories
- `po_product_overheads` - Product overheads
- `po_product_pricing_history` - MRP tracking

### Vendors

- `po_vendors` - Vendor profiles
- `po_vendor_documents` - Vendor documents

### Purchase Orders

- `purchase_orders` - Main PO table
- `purchase_order_items` - PO line items
- `po_status_history` - Status change audit trail
- `po_invoices` - Vendor invoices
- `po_shipments` - Shipment tracking
- `po_payments` - Payment tracking

### Templates

- `po_templates` - Standard PO templates

## ✨ Key Features

### Product Management

- Multiple variants per product
- Cost history tracking (view as graph/table)
- Overhead management per variant
- Auto-calculate landed cost
- Profit margin tuning
- MRP calculation with GST
- Publish workflow for MRP

### Vendor Management

- Complete vendor profiles
- Document attachments
- Performance metrics
- Rating system
- Purchase history

### PO Lifecycle

- Auto PO number generation
- Status workflow (Draft → Submitted → Approved → Ordered → In Transit → Received → Closed)
- Invoice management
- Shipment tracking (AWB, GRN)
- Payment tracking (partial & full)
- Audit trail

### Analytics

- Dashboard statistics
- Vendor performance
- Cost trends
- Payment reconciliation

## 📊 Status Workflow

```
CREATE
  ↓
Draft → Submit → Approve → Order → In Transit → Receive → Close
                                              ↓
                                          Cancel
```

## 🔧 Development

### Adding New Features

1. **Model:** Add business logic to appropriate model file
2. **Controller:** Create endpoint in appropriate controller
3. **Route:** Register route in `routes.js`
4. **View:** Create/update EJS template
5. **Test:** Test end-to-end workflow

### Example: Add New Product Feature

```javascript
// 1. In models/ProductModel.js
static async newFeature(id, data) {
  // Business logic here
}

// 2. In controllers/ProductController.js
static async newFeature(req, res) {
  const result = await POProductModel.newFeature(id, data);
  res.json(result);
}

// 3. In routes.js
router.post('/api/v1/po/products/:id/new-feature', ProductController.newFeature);
```

## 🧪 Testing

### Sample Product Creation

```javascript
POST /api/v1/po/products
{
  "name": "A2 Desi Cow Ghee",
  "category_id": 1,
  "hsn_code": "04059010",
  "sku_code": "GHEE-A2-001",
  "gst_percentage": 5,
  "base_unit": "1kg",
  "variants": [6, 7, 8],
  "images": ["/uploads/ghee1.jpg"]
}
```

### Sample Vendor Creation

```javascript
POST /api/v1/po/vendors
{
  "name": "Organic Farms Ltd",
  "gstin": "29ABCDE1234F1Z5",
  "address": "123 Farm Road",
  "city": "Bangalore",
  "state": "Karnataka",
  "contact_person_name": "John Doe",
  "contact_person_phone": "9876543210",
  "payment_terms": "30 days"
}
```

### Sample PO Creation

```javascript
POST /api/v1/po/purchase-orders
{
  "vendor_id": 1,
  "po_date": "2025-10-01",
  "payment_terms": "30 days",
  "expected_delivery_date": "2025-10-15",
  "items": [
    {
      "product_id": 1,
      "variant_id": 6,
      "quantity": 100,
      "unit_cost": 500,
      "gst_percentage": 5
    }
  ]
}
```

## 📝 Implementation Status

✅ **Complete (70%):**

- Database schema
- All models
- All controllers
- All routes
- Dashboard view
- Documentation

⏳ **Pending (30%):**

- Product views (listing, details)
- Vendor views (listing, details)
- PO views (listing, create, details)
- Reports view
- File upload middleware

See [PO_MODULE_STATUS.md](../../../docs/PO_MODULE_STATUS.md) for detailed status.

## 🆘 Support

- Check `/docs` folder for comprehensive documentation
- Review existing material management module for UI patterns
- API endpoints are fully functional and ready to use

---

**Module Version:** 1.0.0  
**Last Updated:** October 1, 2025  
**Status:** Backend Complete, Frontend Pending
