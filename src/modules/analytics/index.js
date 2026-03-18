// Analytics Module - Main Entry Point
// Vrindavan Farm Analytics Dashboard

import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";

// Import analytics controllers
import { alertsController } from "./controllers/alertsController.js";
import { analyticsController } from "./controllers/analyticsController.js";
import { customersAnalyticsController } from "./controllers/customersAnalyticsController.js";
import { ordersAnalyticsController } from "./controllers/ordersAnalyticsController.js";
import { revenueAnalyticsController } from "./controllers/revenueAnalyticsController.js";
import { productsAnalyticsController } from "./controllers/productsAnalyticsController.js";
import { deliveryAnalyticsController } from "./controllers/deliveryAnalyticsController.js";

const router = express.Router();

// Apply authentication and RBAC middleware
router.use(requireAuth);
router.use(requireRole(["admin", "plant_manager"]));

// Main Analytics Routes
router.get("/", analyticsController.getOverview);
router.get("/overview", analyticsController.getOverview);
router.get("/orders", ordersAnalyticsController.getOrdersAnalytics);
router.get("/orders/all-products", ordersAnalyticsController.getAllProducts);
router.get("/orders/all-categories", ordersAnalyticsController.getAllCategories);
router.get("/orders/milk-trend-detailed", ordersAnalyticsController.getMilkTrendDetailed);
router.get("/orders/curd-trend-detailed", ordersAnalyticsController.getCurdTrendDetailed);
router.get("/orders/paneer-trend-detailed", ordersAnalyticsController.getPaneerTrendDetailed);
router.get("/orders/ghee-trend-detailed", ordersAnalyticsController.getGheeTrendDetailed);
router.get("/orders/order-trend-detailed", ordersAnalyticsController.getOrderTrendDetailed);
router.get("/orders/revenue-trend-detailed", ordersAnalyticsController.getRevenueTrendDetailed);
router.get("/revenue", revenueAnalyticsController.getRevenueAnalytics);
router.get("/customers", customersAnalyticsController.getCustomersAnalytics);
router.get("/products", productsAnalyticsController.getProductsAnalytics);
router.get("/products/list", productsAnalyticsController.getProductsListPage);
router.get("/delivery", deliveryAnalyticsController.getDeliveryAnalytics);
router.get("/delivery/issues", deliveryAnalyticsController.getDeliveryBoyIssues);
router.get("/alerts", alertsController.getAlerts);

// API Routes for data
router.get("/api/overview", analyticsController.getOverviewData);
router.get("/api/orders", ordersAnalyticsController.getOrdersData);
router.get("/api/orders/top-products-by-revenue", ordersAnalyticsController.getTopProductsByRevenue);
router.get("/api/orders/products-dropdown", ordersAnalyticsController.getAllProductsForDropdown);
router.get("/api/orders/product-performance", ordersAnalyticsController.getProductPerformance);
router.get("/api/orders/categories", ordersAnalyticsController.getCategories);
router.get("/api/orders/sub-categories", ordersAnalyticsController.getSubCategories);
router.get("/api/orders/category-performance", ordersAnalyticsController.getCategoryPerformance);
router.get("/api/orders/top-products-performance", ordersAnalyticsController.getTopProductsPerformance);
router.get("/api/orders/order-trend-data", ordersAnalyticsController.getOrderTrendFilteredData);
router.get("/api/orders/products-filter", ordersAnalyticsController.getProductsForFilter);
router.get("/api/orders/order-trend-expanded", ordersAnalyticsController.getExpandedOrderTrend);
router.get("/api/orders/revenue-trend-expanded", ordersAnalyticsController.getExpandedRevenueTrend);
router.get("/api/orders/milk-trend-expanded", ordersAnalyticsController.getExpandedMilkTrend);
router.get("/api/orders/curd-trend-expanded", ordersAnalyticsController.getExpandedCurdTrend);
router.get("/api/orders/paneer-trend-expanded", ordersAnalyticsController.getExpandedPaneerTrend);
router.get("/api/orders/ghee-trend-expanded", ordersAnalyticsController.getExpandedGheeTrend);
router.get("/api/revenue", revenueAnalyticsController.getRevenueData);
router.get("/api/customers", customersAnalyticsController.getCustomersData);
router.get("/api/products", productsAnalyticsController.getProductsAnalyticsData);
router.get("/api/products/list", productsAnalyticsController.getProductsListData);
router.get("/api/delivery", deliveryAnalyticsController.getDeliveryAnalyticsData);
router.get("/api/delivery/issues", deliveryAnalyticsController.getDeliveryIssuesData);
router.get("/api/delivery/issues/list", deliveryAnalyticsController.getDeliveryBoyIssuesData);
router.get("/api/delivery/issues/:issueId", deliveryAnalyticsController.getIssueDetails);
router.get("/api/alerts", alertsController.getAlertsData);

// Export routes
router.get("/export/order-trend-detailed", ordersAnalyticsController.exportOrderTrendDetailed);
router.get("/export/orders", ordersAnalyticsController.exportOrders);
router.get("/export/revenue", revenueAnalyticsController.exportRevenue);
router.get("/export/customers", customersAnalyticsController.exportCustomers);
router.get("/export/customers/segment", customersAnalyticsController.exportCustomersBySegment);
router.get("/export/customers/acquisition", customersAnalyticsController.exportCustomerAcquisition);
router.get("/export/customers/ltv-range", customersAnalyticsController.exportCustomersByLtvRange);
router.get("/export/customers/top-ltv", customersAnalyticsController.exportTopCustomersByLTV);
router.get("/export/customers/low-balance", customersAnalyticsController.exportLowBalanceCustomers);
router.get("/export/customers/recent", customersAnalyticsController.exportRecentCustomers);
router.get("/export/customers/cohorts", customersAnalyticsController.exportCustomerCohorts);

export default router;
