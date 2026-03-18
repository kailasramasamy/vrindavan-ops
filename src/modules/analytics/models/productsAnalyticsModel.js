import { analyticsPool } from "../../../db/pool.js";

const DEFAULT_RANGE_DAYS = 30;

function parseRangeDays(startDate, endDate) {
  if (!startDate || !endDate) {
    return DEFAULT_RANGE_DAYS;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return DEFAULT_RANGE_DAYS;
  }
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    return DEFAULT_RANGE_DAYS;
  }
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(days, 1);
}

export class ProductsAnalyticsModel {
  static async getTopLevelSummary() {
    if (!analyticsPool) {
      return {
        total_products: 0,
        low_stock_products: 0,
        out_of_stock_products: 0,
      };
    }

    const summaryQuery = `
      WITH stock_balances AS (
        ${buildStockBalancesCte()}
      )
      SELECT
        (SELECT COUNT(*) FROM foods f WHERE f.status = '1') AS total_products,
        (
          SELECT COUNT(*)
          FROM foods f
          LEFT JOIN stock_balances sb ON sb.product_id = f.id
          WHERE
            f.status = '1'
            AND f.track_inventory = '1'
            AND COALESCE(sb.total_stock, 0) > 0
            AND COALESCE(sb.total_stock, 0) <= COALESCE(f.low_stock_threshold, 0)
        ) AS low_stock_products,
        (
          SELECT COUNT(*)
          FROM foods f
          LEFT JOIN stock_balances sb ON sb.product_id = f.id
          WHERE
            f.track_inventory = '1'
            AND COALESCE(sb.total_stock, 0) <= 0
        ) AS out_of_stock_products
    `;

    const [[summary]] = await analyticsPool.query(summaryQuery);
    return {
      total_products: Number(summary?.total_products || 0),
      low_stock_products: Number(summary?.low_stock_products || 0),
      out_of_stock_products: Number(summary?.out_of_stock_products || 0),
    };
  }

  static async getSecondarySummary(range) {
    const performance = await this.getProductPerformance(range);
    const soldProducts = performance.filter((product) => product.total_quantity > 0);
    const avgQuantity =
      soldProducts.length > 0 ? soldProducts.reduce((sum, product) => sum + product.total_quantity, 0) / soldProducts.length : 0;

    const bestSelling = soldProducts.filter((product) => product.total_quantity >= avgQuantity).length;
    const worstSelling = performance.filter((product) => product.total_quantity <= 5).length;
    const noSales = performance.filter((product) => product.status === "1" && product.total_quantity === 0).length;

    return {
      best_selling_products: bestSelling,
      worst_selling_products: worstSelling,
      products_without_sales: noSales,
    };
  }

  static async getProductPerformance(range) {
    if (!analyticsPool) {
      return [];
    }

    const { startDate, endDate } = range;
    const hasRange = Boolean(startDate && endDate);
    const params = [];
    let dateFilter = "";

    if (hasRange) {
      dateFilter = "WHERE o.order_date BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    const performanceQuery = `
      WITH sales AS (
        SELECT 
          fo.food_id,
          SUM(fo.quantity) AS total_qty,
          SUM(fo.price * fo.quantity) AS total_revenue,
          COUNT(DISTINCT o.id) AS total_orders,
          MAX(o.order_date) AS last_order_date,
          MIN(o.order_date) AS first_order_date
        FROM food_orders fo
        JOIN orders o ON o.id = fo.order_id
        ${dateFilter}
        GROUP BY fo.food_id
      ),
      stock_balances AS (
        ${buildStockBalancesCte()}
      )
      SELECT
        f.id,
        f.name,
        f.unit,
        f.price,
        f.discount_price,
        (
          SELECT m.file_name
          FROM media m
          WHERE m.model_type = 'App\\\\Models\\\\Food'
            AND m.model_id = f.id
          ORDER BY m.order_column ASC, m.id ASC
          LIMIT 1
        ) AS image_file,
        f.low_stock_threshold,
        f.status,
        f.track_inventory,
        f.category_id,
        c.name AS category_name,
        f.subcategory_id,
        sc.name AS subcategory_name,
        COALESCE(s.total_qty, 0) AS total_qty,
        COALESCE(s.total_revenue, 0) AS total_revenue,
        COALESCE(s.total_orders, 0) AS total_orders,
        s.last_order_date,
        s.first_order_date,
        COALESCE(sb.total_stock, 0) AS total_stock
      FROM foods f
      LEFT JOIN categories c ON c.id = f.category_id
      LEFT JOIN sub_categories sc ON sc.id = f.subcategory_id
      LEFT JOIN sales s ON f.id = s.food_id
      LEFT JOIN stock_balances sb ON sb.product_id = f.id
      WHERE f.status IN ('0', '1')
    `;

    const [rows] = await analyticsPool.query(performanceQuery, params);

    return rows.map((row) => {
      const trackInventory = row.track_inventory === null || row.track_inventory === undefined ? null : String(row.track_inventory);
      const isInventoryTracked = trackInventory !== "0";
      const imageFile = row.image_file || null;
      let imageUrl = null;
      if (imageFile) {
        const encodedUrl = encodeURIComponent(`https://media-image-upload.s3.ap-south-1.amazonaws.com/foods/${imageFile}`);
        imageUrl = `https://app.vrindavanmilk.com/_next/image?url=${encodedUrl}&w=96&q=75`;
      }
      const activeDays = computeActiveDays(row.first_order_date, row.last_order_date, range);
      const avgDailySales = activeDays > 0 ? Number(row.total_qty || 0) / activeDays : 0;
      let daysSinceLastSale = null;
      if (row.last_order_date) {
        const lastOrder = new Date(row.last_order_date);
        const now = new Date();
        const diffMs = now.setHours(0, 0, 0, 0) - new Date(lastOrder.setHours(0, 0, 0, 0)).getTime();
        if (Number.isFinite(diffMs)) {
          daysSinceLastSale = Math.max(Math.floor(diffMs / (24 * 60 * 60 * 1000)), 0);
        }
      }

      let daysToStockout = null;
      const threshold = Number(row.low_stock_threshold || 0);
      if (isInventoryTracked && threshold > 0 && avgDailySales > 0) {
        daysToStockout = Number((threshold / avgDailySales).toFixed(2));
      }

      return {
        product_id: row.id,
        name: row.name,
        unit: row.unit,
        price: Number(row.price || 0),
        discount_price: Number(row.discount_price || 0),
        image_url: imageUrl,
        low_stock_threshold: threshold,
        track_inventory: trackInventory,
        inventory_tracked: isInventoryTracked,
        status: row.status,
        category_id: row.category_id,
        category_name: row.category_name,
        subcategory_id: row.subcategory_id,
        subcategory_name: row.subcategory_name,
        total_quantity: Number(row.total_qty || 0),
        total_revenue: Number(row.total_revenue || 0),
        total_orders: Number(row.total_orders || 0),
        last_order_date: row.last_order_date,
        avg_daily_sales: Number(avgDailySales.toFixed(2)),
        days_since_last_sale: daysSinceLastSale,
        projected_days_to_stockout: daysToStockout,
        total_stock: Number(row.total_stock || 0),
      };
    });
  }

  static async getProductsListByType(type, { range, categoryId = null, subcategoryId = null } = {}) {
    const filters = [];
    const params = [];

    if (categoryId) {
      filters.push("f.category_id = ?");
      params.push(categoryId);
    }

    if (subcategoryId) {
      filters.push("f.subcategory_id = ?");
      params.push(subcategoryId);
    }

    const filterClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

    if (["best_selling", "worst_selling", "no_sales"].includes(type)) {
      const performance = await this.getProductPerformance(range);
      return filterPerformanceList(performance, type, { categoryId, subcategoryId });
    }

    let dateFilter = "";
    const dateParams = [];
    if (range.startDate && range.endDate && range.range !== "all_time") {
      dateFilter = "AND DATE(sm.created_at) BETWEEN ? AND ?";
      dateParams.push(range.startDate, range.endDate);
    }

    const listQuery = `
      WITH stock_balances AS (
        ${buildStockBalancesCte()}
      ),
      sales_data AS (
        SELECT
          sm.stockable_id,
          SUM(ABS(sm.amount)) AS qty_sold,
          MAX(sm.created_at) AS last_sale_date,
          MIN(sm.created_at) AS first_sale_date
        FROM stock_mutations sm
        WHERE sm.stockable_type = 'App\\\\Models\\\\Food'
          AND sm.amount < 0
          ${dateFilter}
        GROUP BY sm.stockable_id
      )
      SELECT
        f.id,
        f.name,
        f.unit,
        (
          SELECT m.file_name
          FROM media m
          WHERE m.model_type = 'App\\\\Models\\\\Food'
            AND m.model_id = f.id
          ORDER BY m.order_column ASC, m.id ASC
          LIMIT 1
        ) AS image_file,
        f.price,
        f.discount_price,
        f.status,
        f.track_inventory,
        f.low_stock_threshold,
        f.category_id,
        c.name AS category_name,
        f.subcategory_id,
        sc.name AS subcategory_name,
        COALESCE(sb.total_stock, 0) AS total_stock,
        COALESCE(sd.qty_sold, 0) AS qty_sold,
        COALESCE(sd.qty_sold * f.discount_price, 0) AS revenue,
        sd.last_sale_date,
        sd.first_sale_date
      FROM foods f
      LEFT JOIN stock_balances sb ON sb.product_id = f.id
      LEFT JOIN sales_data sd ON sd.stockable_id = f.id
      LEFT JOIN categories c ON c.id = f.category_id
      LEFT JOIN sub_categories sc ON sc.id = f.subcategory_id
      WHERE f.status IN ('0', '1')
        ${filterClause}
    `;

    const allParams = [...dateParams, ...params];

    const [rows] = await analyticsPool.query(listQuery, allParams);

    return rows
      .map((row) => {
        const trackInventory = row.track_inventory === null || row.track_inventory === undefined ? null : String(row.track_inventory);
        const qtySold = Number(row.qty_sold || 0);
        const revenue = Number(row.revenue || 0);
        const imageFile = row.image_file || null;
        let imageUrl = null;
        if (imageFile) {
          const encodedUrl = encodeURIComponent(`https://media-image-upload.s3.ap-south-1.amazonaws.com/foods/${imageFile}`);
          imageUrl = `https://app.vrindavanmilk.com/_next/image?url=${encodedUrl}&w=96&q=75`;
        }
        
        // Calculate days since last sale
        let daysSinceLastSale = null;
        if (row.last_sale_date) {
          const lastSale = new Date(row.last_sale_date);
          const now = new Date();
          const diffMs = now.setHours(0, 0, 0, 0) - lastSale.setHours(0, 0, 0, 0);
          if (Number.isFinite(diffMs)) {
            daysSinceLastSale = Math.max(Math.floor(diffMs / (24 * 60 * 60 * 1000)), 0);
          }
        }

        // Calculate average daily sales
        let avgDailySales = 0;
        if (row.first_sale_date && row.last_sale_date && qtySold > 0) {
          const first = new Date(row.first_sale_date);
          const last = new Date(row.last_sale_date);
          const diffMs = last.setHours(0, 0, 0, 0) - first.setHours(0, 0, 0, 0);
          const days = Math.max(Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1, 1);
          avgDailySales = qtySold / days;
        }

        return {
          ...row,
          track_inventory: trackInventory,
          status: row.status === null || row.status === undefined ? null : String(row.status),
          qty_sold: qtySold,
          revenue: revenue,
          avg_daily_sales: Number(avgDailySales.toFixed(2)),
          days_since_last_sale: daysSinceLastSale,
          image_url: imageUrl,
        };
      })
      .filter((row) => {
        switch (type) {
          case "low_stock":
            return (
              row.track_inventory === "1" &&
              Number(row.total_stock) > 0 &&
              row.low_stock_threshold !== null &&
              Number(row.total_stock) <= Number(row.low_stock_threshold)
            );
          case "out_of_stock":
            return row.track_inventory === "1" && Number(row.total_stock) <= 0;
          case "total":
          default:
            return row.status === "1";
        }
      });
  }

  static async getProductCategories() {
    if (!analyticsPool) {
      return [];
    }
    const [rows] = await analyticsPool.query("SELECT id, name FROM categories ORDER BY name ASC");
    return rows;
  }

  static async getProductSubcategories(categoryId = null) {
    if (!analyticsPool) {
      return [];
    }
    const params = [];
    let where = "WHERE 1=1";
    if (categoryId) {
      where += " AND category_id = ?";
      params.push(categoryId);
    }
    const [rows] = await analyticsPool.query(
      `SELECT id, name, category_id FROM sub_categories ${where} ORDER BY name ASC`,
      params
    );
    return rows;
  }
}

function buildStockBalancesCte() {
  return `
    SELECT
      sm.stockable_id AS product_id,
      SUM(sm.amount) AS total_stock
    FROM stock_mutations sm
    GROUP BY sm.stockable_id
  `;
}

function filterPerformanceList(performance, type, { categoryId, subcategoryId }) {
  let list = [...performance];
  if (categoryId) {
    list = list.filter((item) => item.category_id === Number(categoryId));
  }
  if (subcategoryId) {
    list = list.filter((item) => item.subcategory_id === Number(subcategoryId));
  }

  const soldProducts = list.filter((product) => product.total_quantity > 0);
  const avgQuantity =
    soldProducts.length > 0 ? soldProducts.reduce((sum, product) => sum + product.total_quantity, 0) / soldProducts.length : 0;

  switch (type) {
    case "best_selling":
      return soldProducts.filter((product) => product.total_quantity >= avgQuantity);
    case "worst_selling":
      return list.filter((product) => product.total_quantity <= 5);
    case "no_sales":
      return list.filter((product) => product.status === "1" && product.total_quantity === 0);
    default:
      return list;
  }
}

function computeActiveDays(firstOrderDate, lastOrderDate, range) {
  const fallback = parseRangeDays(range.startDate, range.endDate);

  if (!lastOrderDate) {
    return fallback;
  }
  const last = new Date(lastOrderDate);
  if (Number.isNaN(last.getTime())) {
    return fallback;
  }

  if (!firstOrderDate) {
    return fallback;
  }

  const first = new Date(firstOrderDate);
  if (Number.isNaN(first.getTime())) {
    return fallback;
  }

  const diffMs = last.setHours(0, 0, 0, 0) - first.setHours(0, 0, 0, 0);
  if (diffMs < 0) {
    return fallback;
  }
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(days, 1);
}
