import { ProductsAnalyticsModel } from "../models/productsAnalyticsModel.js";

const DEFAULT_RANGE = "30d";

function resolveDateRange(query = {}) {
  const range = query.range || DEFAULT_RANGE;
  const now = new Date();
  let startDate;
  let endDate;

  switch (range) {
    case "today": {
      startDate = formatDate(now);
      endDate = formatDate(now);
      break;
    }
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = formatDate(yesterday);
      endDate = formatDate(yesterday);
      break;
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
    case "14d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 13);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
    case "90d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 89);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
    case "180d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 179);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
    case "1y":
    case "365d": {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      start.setDate(start.getDate() - 29);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
    case "custom": {
      if (query.start && query.end) {
        startDate = query.start;
        endDate = query.end;
      } else {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        startDate = formatDate(start);
        endDate = formatDate(now);
      }
      break;
    }
    case "30d":
    default: {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      startDate = formatDate(start);
      endDate = formatDate(now);
      break;
    }
  }

  return {
    range,
    startDate,
    endDate,
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildTableResponse(performance, limit = 5) {
  const products = [...performance];

  // Helper to clone data with computed fields
  const mapProduct = (product) => ({
    id: product.product_id,
    name: product.name,
    unit: product.unit,
    total_orders: product.total_orders,
    total_quantity: product.total_quantity,
    total_revenue: product.total_revenue,
    avg_daily_sales: product.avg_daily_sales,
    projected_days_to_stockout: product.projected_days_to_stockout,
    days_since_last_sale: product.days_since_last_sale,
    last_order_date: product.last_order_date,
    low_stock_threshold: product.low_stock_threshold,
  });

  const soldProducts = products.filter((p) => p.total_quantity > 0);

  const bestSelling = soldProducts
    .sort((a, b) => (b.total_quantity === a.total_quantity ? b.total_revenue - a.total_revenue : b.total_quantity - a.total_quantity))
    .slice(0, limit)
    .map(mapProduct);

  const avgQuantity =
    soldProducts.length > 0 ? soldProducts.reduce((sum, p) => sum + p.total_quantity, 0) / soldProducts.length : 0;

  const averageSelling = soldProducts
    .filter((p) => !bestSelling.find((b) => b.id === p.product_id))
    .sort((a, b) => {
      const diffA = Math.abs(a.total_quantity - avgQuantity);
      const diffB = Math.abs(b.total_quantity - avgQuantity);
      return diffA === diffB ? b.total_revenue - a.total_revenue : diffA - diffB;
    })
    .slice(0, limit)
    .map(mapProduct);

  const worstSelling = products
    .sort((a, b) => {
      if (a.total_quantity === b.total_quantity) {
        const aDays = a.days_since_last_sale ?? Number.MAX_SAFE_INTEGER;
        const bDays = b.days_since_last_sale ?? Number.MAX_SAFE_INTEGER;
        return bDays - aDays;
      }
      return a.total_quantity - b.total_quantity;
    })
    .slice(0, limit)
    .map(mapProduct);

  const fastOOS = products
    .filter((p) => typeof p.projected_days_to_stockout === "number" && Number.isFinite(p.projected_days_to_stockout))
    .sort((a, b) => a.projected_days_to_stockout - b.projected_days_to_stockout)
    .slice(0, limit)
    .map(mapProduct);

  const topRevenue = soldProducts
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, limit)
    .map(mapProduct);

  return {
    bestSelling,
    averageSelling,
    worstSelling,
    fastStockout: fastOOS,
    topRevenue,
  };
}

export const productsAnalyticsController = {
  async getProductsAnalytics(req, res) {
    try {
      const user = req.user;
      const range = resolveDateRange(req.query);

      res.render("pages/ops/analytics/products", {
        title: "Products Analytics",
        user,
        activeSection: "products",
        subsection: "Products",
        seo: {
          title: "Products Analytics - Vrindavan Farm",
          description: "Understand product performance, stock status, and sales velocity at a glance.",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
        filters: range,
      });
    } catch (error) {
      console.error("Error rendering products analytics:", error);
      res.redirect("/analytics");
    }
  },

  async getProductsAnalyticsData(req, res) {
    try {
      const range = resolveDateRange(req.query);

      const [topSummary, secondarySummary, performance] = await Promise.all([
        ProductsAnalyticsModel.getTopLevelSummary(),
        ProductsAnalyticsModel.getSecondarySummary(range),
        ProductsAnalyticsModel.getProductPerformance(range),
      ]);

      const tables = buildTableResponse(performance);

      res.json({
        success: true,
        data: {
          summary: {
            top: topSummary,
            secondary: secondarySummary,
          },
          tables,
          range,
          performance,
        },
      });
    } catch (error) {
      console.error("Error fetching products analytics data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load products analytics data",
      });
    }
  },

  async getProductsListPage(req, res) {
    try {
      const user = req.user;
      const type = (req.query.type || "total").toLowerCase();
      const usesRange = ["best_selling", "worst_selling", "no_sales"].includes(type);
      const filters = usesRange
        ? resolveDateRange(req.query)
        : {
            range: "30d",
            startDate: null,
            endDate: null,
          };

      res.render("pages/ops/analytics/products-list", {
        title: "Products List",
        user,
        activeSection: "products",
        subsection: "Products",
        seo: {
          title: "Products Detail - Vrindavan Farm Analytics",
          description: "Detailed product listing for analytics summary insights.",
          url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
        },
        filters,
        listType: type,
        usesRange,
      });
    } catch (error) {
      console.error("Error rendering products list page:", error);
      res.redirect("/analytics/products");
    }
  },

  async getProductsListData(req, res) {
    try {
      const type = (req.query.type || "total").toLowerCase();
      const categoryId = Number.isFinite(Number(req.query.category_id)) ? Number(req.query.category_id) : null;
      const subcategoryId = Number.isFinite(Number(req.query.subcategory_id)) ? Number(req.query.subcategory_id) : null;
      const range = resolveDateRange(req.query);

      const [list, categories, subcategories] = await Promise.all([
        ProductsAnalyticsModel.getProductsListByType(type, { range, categoryId, subcategoryId }),
        ProductsAnalyticsModel.getProductCategories(),
        ProductsAnalyticsModel.getProductSubcategories(),
      ]);

      res.json({
        success: true,
        data: {
          list,
          categories,
          subcategories,
          range,
        },
      });
    } catch (error) {
      console.error("Error fetching products list data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to load products list",
      });
    }
  },
};


