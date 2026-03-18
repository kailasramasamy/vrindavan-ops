// Delivery Analytics Controller
import { analyticsPool, opsPool } from "../../../db/pool.js";
import { buildSEO } from "../../../utils/seo.js";

export const deliveryAnalyticsController = {
  // Render delivery analytics page
  async getDeliveryAnalytics(req, res) {
    try {
      const user = req.user;

      const seo = buildSEO({
        title: "Delivery Analytics — Performance Analysis",
        url: req.path,
      });

      res.render("pages/ops/analytics/delivery", {
        seo,
        pageKey: "ops/analytics/delivery",
        promo: false,
        user,
      });
    } catch (error) {
      console.error("Error loading delivery analytics:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Delivery Analytics — Error" },
        pageKey: "ops/analytics/delivery/error",
        promo: false,
        user: req.user,
        title: "Unable to load Delivery Analytics",
        message: "Something went wrong while loading the Delivery Analytics module.",
        error,
      });
    }
  },

  // API endpoint for delivery analytics data
  async getDeliveryAnalyticsData(req, res) {
    try {
      if (!analyticsPool || !opsPool) {
        return res.status(500).json({
          success: false,
          error: "Database connection not available",
        });
      }

      let startDate, endDate;
      const range = req.query.range;

      if (range === "custom" && req.query.start && req.query.end) {
        startDate = req.query.start;
        endDate = req.query.end;
      } else if (range === "monthly" && req.query.start && req.query.end) {
        startDate = req.query.start;
        endDate = req.query.end;
      } else {
        // Fallback to month param or previous month
        const month = req.query.month || getPreviousMonth();
        const dateRange = getMonthDateRange(month);
        startDate = dateRange.startDate;
        endDate = dateRange.endDate;
      }

      // Fetch delivery boy performance data
      const performanceData = await getDeliveryBoyPerformance(
        analyticsPool,
        opsPool,
        startDate,
        endDate
      );

      // Calculate stats
      const stats = calculateStats(performanceData);

      return res.json({
        success: true,
        data: {
          startDate,
          endDate,
          performance: performanceData,
          stats,
        },
      });
    } catch (error) {
      console.error("Error fetching delivery analytics data:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch delivery analytics data",
      });
    }
  },

  // Render delivery boy issues list page
  async getDeliveryBoyIssues(req, res) {
    try {
      const user = req.user;
      const deliveryBoy = req.query.deliveryBoy || "";
      const issueType = req.query.issueType || "";
      const dateRange = req.query.range || "7d";
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;

      const seo = buildSEO({
        title: `Delivery Boy Issues — ${deliveryBoy || "All"}`,
        url: req.path,
      });

      res.render("pages/ops/analytics/delivery-issues", {
        seo,
        pageKey: "ops/analytics/delivery/issues",
        promo: false,
        user,
        deliveryBoy,
        issueType,
        dateRange,
        startDate,
        endDate,
      });
    } catch (error) {
      console.error("Error loading delivery boy issues:", error);
      res.status(500).render("pages/ops/error", {
        seo: { title: "Delivery Boy Issues — Error" },
        pageKey: "ops/analytics/delivery/issues/error",
        promo: false,
        user: req.user,
        title: "Unable to load Delivery Boy Issues",
        message: "Something went wrong while loading the issues.",
        error,
      });
    }
  },

  // API endpoint to get issues for a specific delivery boy
  async getDeliveryBoyIssuesData(req, res) {
    try {
      const deliveryBoy = req.query.deliveryBoy || "";
      const issueType = req.query.issueType || "";
      const dateRange = req.query.range || "7d";
      const customStart = req.query.startDate;
      const customEnd = req.query.endDate;
      const { startDate, endDate } = getDateRangeFromFilter(dateRange, customStart, customEnd);

      if (!analyticsPool) {
        return res.status(500).json({
          success: false,
          error: "Database connection not available",
        });
      }

      // Get issues filtered by delivery boy and optionally issue type
      let issuesQuery = `
        SELECT 
          i.id,
          i.user_id,
          i.order_id,
          i.issue_type_id,
          i.description,
          i.reported_via,
          i.priority,
          i.created_at,
          i.updated_at,
          it.name as issue_type_name,
          db.name as delivery_boy_name,
          db.id as delivery_boy_id,
          db.user_id as delivery_boy_user_id,
          o.user_id as order_user_id,
          COALESCE(
            (SELECT to_status_id 
             FROM issue_status_history ish 
             WHERE ish.issue_id = i.id 
             ORDER BY ish.changed_at DESC 
             LIMIT 1),
            i.current_status_id
          ) as current_status_id,
          COALESCE(
            (SELECT name 
             FROM issue_statuses iss 
             WHERE iss.id = (
               SELECT to_status_id 
               FROM issue_status_history ish 
               WHERE ish.issue_id = i.id 
               ORDER BY ish.changed_at DESC 
               LIMIT 1
             )),
            (SELECT name FROM issue_statuses WHERE id = i.current_status_id)
          ) as current_status_name
         FROM issues i
         LEFT JOIN issue_types it ON it.id = i.issue_type_id
         LEFT JOIN orders o ON o.id = i.order_id
         LEFT JOIN delivery_boys db ON db.user_id = o.delivery_boy_id
         WHERE i.created_at >= ? AND i.created_at <= ?
      `;

      const queryParams = [`${startDate} 00:00:00`, `${endDate} 23:59:59`];

      if (deliveryBoy) {
        // Decode if URL encoded (handle double encoding)
        let decodedDeliveryBoy = deliveryBoy;
        try {
          decodedDeliveryBoy = decodeURIComponent(decodedDeliveryBoy);
          // Try decoding again in case of double encoding
          if (decodedDeliveryBoy.includes('%')) {
            decodedDeliveryBoy = decodeURIComponent(decodedDeliveryBoy);
          }
        } catch (e) {
          // If decoding fails, use original
          decodedDeliveryBoy = deliveryBoy;
        }
        issuesQuery += ` AND db.name = ?`;
        queryParams.push(decodedDeliveryBoy);
      }

      if (issueType) {
        // Decode if URL encoded (handle double encoding)
        let decodedIssueType = issueType;
        try {
          decodedIssueType = decodeURIComponent(decodedIssueType);
          // Try decoding again in case of double encoding
          if (decodedIssueType.includes('%')) {
            decodedIssueType = decodeURIComponent(decodedIssueType);
          }
        } catch (e) {
          // If decoding fails, use original
          decodedIssueType = issueType;
        }
        issuesQuery += ` AND it.name = ?`;
        queryParams.push(decodedIssueType);
      }

      issuesQuery += ` ORDER BY i.created_at DESC`;

      const [issues] = await analyticsPool.query(issuesQuery, queryParams);

      const issuesList = issues.map(issue => ({
        id: issue.id,
        issue_type_id: issue.issue_type_id,
        issue_type_name: issue.issue_type_name || "Unknown",
        current_status_id: issue.current_status_id,
        current_status_name: issue.current_status_name || "Unknown",
        description: issue.description || null,
        reported_via: issue.reported_via || null,
        priority: issue.priority || null,
        delivery_boy_id: issue.delivery_boy_id,
        delivery_boy_name: issue.delivery_boy_name || null,
        delivery_boy_user_id: issue.delivery_boy_user_id,
        order_id: issue.order_id,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
      }));

      return res.json({
        success: true,
        data: {
          issues: issuesList,
          deliveryBoy,
          issueType,
          dateRange,
          startDate,
          endDate,
        },
      });
    } catch (error) {
      console.error("Error fetching delivery boy issues:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch delivery boy issues",
      });
    }
  },

  // API endpoint for delivery issues data
  async getDeliveryIssuesData(req, res) {
    try {
      const dateRange = req.query.range || "7d"; // Default: last 7 days
      const customStart = req.query.startDate;
      const customEnd = req.query.endDate;
      const { startDate, endDate } = getDateRangeFromFilter(dateRange, customStart, customEnd);
      
      if (!analyticsPool) {
        return res.status(500).json({
          success: false,
          error: "Database connection not available",
        });
      }

      // Fetch delivery issues data
      const issuesData = await getDeliveryIssues(
        analyticsPool,
        startDate,
        endDate
      );

      return res.json({
        success: true,
        data: {
          dateRange,
          startDate,
          endDate,
          ...issuesData,
        },
      });
    } catch (error) {
      console.error("Error fetching delivery issues data:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to fetch delivery issues data",
      });
    }
  },

  // API endpoint to get detailed information for a specific issue
  async getIssueDetails(req, res) {
    try {
      const { issueId } = req.params;

      // Get issue details with customer and delivery address information
      const [issues] = await analyticsPool.query(
        `SELECT 
          i.id,
          i.user_id,
          i.order_id,
          i.issue_type_id,
          i.description,
          i.reported_via,
          i.priority,
          i.created_at,
          i.updated_at,
          it.name as issue_type_name,
          db.name as delivery_boy_name,
          db.id as delivery_boy_id,
          db.user_id as delivery_boy_user_id,
          o.user_id as order_user_id,
          u.name as customer_name,
          u.phone as customer_phone,
          da.complete_address,
          l.name as locality_name,
          COALESCE(
            (SELECT to_status_id 
             FROM issue_status_history ish 
             WHERE ish.issue_id = i.id 
             ORDER BY ish.changed_at DESC 
             LIMIT 1),
            i.current_status_id
          ) as current_status_id,
          COALESCE(
            (SELECT name 
             FROM issue_statuses iss 
             WHERE iss.id = (
               SELECT to_status_id 
               FROM issue_status_history ish 
               WHERE ish.issue_id = i.id 
               ORDER BY ish.changed_at DESC 
               LIMIT 1
             )),
            (SELECT name FROM issue_statuses WHERE id = i.current_status_id)
          ) as current_status_name
         FROM issues i
         LEFT JOIN issue_types it ON it.id = i.issue_type_id
         LEFT JOIN orders o ON o.id = i.order_id
         LEFT JOIN delivery_boys db ON db.user_id = o.delivery_boy_id
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN delivery_addresses da ON da.user_id = o.user_id
         LEFT JOIN localities l ON l.id = da.locality_id
         WHERE i.id = ?
         LIMIT 1`,
        [issueId]
      );

      if (!issues || issues.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Issue not found",
        });
      }

      const issue = issues[0];

      // Fetch product details from food_orders
      let products = [];
      if (issue.order_id) {
        try {
          console.log(`Fetching products for order: ${issue.order_id}`);
          const [foodOrders] = await analyticsPool.query(
            `SELECT 
              fo.id,
              fo.quantity,
              fo.price,
              f.name as product_name,
              f.unit as product_unit
             FROM food_orders fo
             LEFT JOIN foods f ON f.id = fo.food_id
             WHERE fo.order_id = ?
             ORDER BY fo.id ASC`,
            [issue.order_id]
          );

          if (foodOrders && foodOrders.length > 0) {
            console.log(`Found ${foodOrders.length} products for order ${issue.order_id}`);
            products = foodOrders.map(fo => ({
              name: fo.product_name || "Unknown Product",
              unit_size: fo.product_unit || "—",
              quantity: fo.quantity || 0,
            }));
          } else {
            console.log(`No products found for order ${issue.order_id}`);
          }
        } catch (error) {
          console.error("Error fetching product details:", error);
          // Continue without products if there's an error
        }
      }

      res.json({
        success: true,
        data: {
          id: issue.id,
          issue_type_name: issue.issue_type_name || "Unknown",
          current_status_name: issue.current_status_name || "Unknown",
          description: issue.description || null,
          reported_via: issue.reported_via || null,
          priority: issue.priority || null,
          order_id: issue.order_id,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          customer: {
            name: issue.customer_name || "—",
            phone: issue.customer_phone || "—",
          },
          delivery_address: {
            complete_address: issue.complete_address || "—",
            locality_name: issue.locality_name || "—",
          },
          delivery_boy: {
            name: issue.delivery_boy_name || "—",
          },
          products: products,
        },
      });
    } catch (error) {
      console.error("Error getting issue details:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch issue details",
      });
    }
  },
};

// Helper function to get previous month in YYYY-MM format
function getPreviousMonth() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
}

// Helper function to get date range for a month
function getMonthDateRange(month) {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));
  
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

// Get delivery boy performance data
async function getDeliveryBoyPerformance(analyticsPool, opsPool, startDate, endDate) {
  try {
    // Get all active delivery boys
    // Check which active column exists (similar to DeliveryPaymentsService)
    const tableHasColumn = async (pool, table, column) => {
      try {
        const [rows] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
        return Array.isArray(rows) && rows.length > 0;
      } catch (error) {
        console.warn(`Unable to determine if column ${column} exists on ${table}:`, error?.message || error);
        return false;
      }
    };

    const hasActiveColumn = await tableHasColumn(analyticsPool, "delivery_boys", "active");
    const hasIsActiveColumn = await tableHasColumn(analyticsPool, "delivery_boys", "is_active");

    let query = "SELECT id, user_id, name, mobile FROM delivery_boys";
    if (hasActiveColumn) {
      query += " WHERE active = 1";
    } else if (hasIsActiveColumn) {
      query += " WHERE is_active = 1";
    }
    // If neither column exists, fetch all (backward compatibility)
    query += " ORDER BY name ASC";

    const [deliveryBoys] = await analyticsPool.query(query);

    if (!deliveryBoys || deliveryBoys.length === 0) {
      return [];
    }

    const userIds = deliveryBoys.map((db) => db.user_id).filter((id) => id != null);

    if (userIds.length === 0) {
      return [];
    }

    // Get orders revenue for each delivery boy
    const placeholders = userIds.map(() => "?").join(", ");
    const [orders] = await analyticsPool.query(
      `SELECT 
        o.delivery_boy_id,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(fo.quantity * fo.price), 0) as total_revenue
       FROM orders o
       INNER JOIN food_orders fo ON fo.order_id = o.id
       WHERE o.delivery_boy_id IN (${placeholders})
         AND o.active = 1
         AND DATE(o.order_date) BETWEEN ? AND ?
       GROUP BY o.delivery_boy_id`,
      [...userIds, startDate, endDate]
    );

    // Create a map of user_id -> order data
    const ordersMap = new Map();
    orders.forEach((row) => {
      ordersMap.set(row.delivery_boy_id, {
        order_count: Number(row.order_count) || 0,
        total_revenue: Number(row.total_revenue) || 0,
      });
    });

    // Get salary data from delivery payment records for months in the date range
    const startMonth = startDate.substring(0, 7);
    const endMonth = endDate.substring(0, 7);
    const [salaryRecords] = await opsPool.query(
      `SELECT
        r.delivery_boy_user_id,
        r.payment_type,
        r.fixed_salary_amount,
        r.commission_amount,
        r.hybrid_base_amount,
        c.period_month
       FROM delivery_payment_records r
       INNER JOIN delivery_payment_cycles c ON c.id = r.cycle_id
       WHERE r.delivery_boy_user_id IN (${placeholders})
         AND LEFT(CAST(c.period_month AS CHAR), 7) >= ?
         AND LEFT(CAST(c.period_month AS CHAR), 7) <= ?
       ORDER BY r.delivery_boy_user_id`,
      [...userIds, startMonth, endMonth]
    );

    // Create a map of user_id -> salary data (sum across months for multi-month ranges)
    const salaryMap = new Map();
    salaryRecords.forEach((row) => {
      const userId = row.delivery_boy_user_id;
      let salary = 0;

      if (row.payment_type === "fixed") {
        salary = Number(row.fixed_salary_amount) || 0;
      } else if (row.payment_type === "commission") {
        salary = Number(row.commission_amount) || 0;
      } else if (row.payment_type === "hybrid") {
        salary = (Number(row.hybrid_base_amount) || 0) + (Number(row.commission_amount) || 0);
      }

      const existing = salaryMap.get(userId);
      if (existing) {
        existing.salary += salary;
      } else {
        salaryMap.set(userId, {
          payment_type: row.payment_type,
          salary: salary,
        });
      }
    });

    // Combine data for each delivery boy
    const performance = deliveryBoys.map((db) => {
      const userId = db.user_id;
      const orderData = ordersMap.get(userId) || { order_count: 0, total_revenue: 0 };
      const salaryData = salaryMap.get(userId) || { payment_type: "commission", salary: 0 };
      
      const revenue = orderData.total_revenue;
      const profit = revenue * 0.2; // 20% of revenue
      const salary = salaryData.salary;
      
      // Categorize delivery boy
      let category = "average";
      if (profit > salary * 1.2) {
        category = "good"; // Profit is much higher than salary (20%+)
      } else if (profit < salary) {
        category = "loss"; // Profit is less than salary
      }

      return {
        delivery_boy_id: db.id,
        user_id: userId,
        name: db.name || "Unknown",
        phone: db.mobile || null,
        order_count: orderData.order_count,
        revenue: revenue,
        profit: profit,
        salary: salary,
        payment_type: salaryData.payment_type,
        category: category,
        profit_vs_salary: profit - salary,
      };
    });

    return performance;
  } catch (error) {
    console.error("Error getting delivery boy performance:", error);
    throw error;
  }
}

// Calculate stats from performance data
function calculateStats(performanceData) {
  const good = performanceData.filter((p) => p.category === "good").length;
  const average = performanceData.filter((p) => p.category === "average").length;
  const loss = performanceData.filter((p) => p.category === "loss").length;

  return {
    good,
    average,
    loss,
    total: performanceData.length,
  };
}

// Helper function to get date range from filter
function getDateRangeFromFilter(range, customStart = null, customEnd = null) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();
  
  switch (range) {
    case "today":
      // Today: start and end both are today
      startDate = new Date(now);
      endDate = new Date(now);
      break;
    case "yesterday":
      // Yesterday: start and end both are yesterday
      startDate.setDate(now.getDate() - 1);
      endDate.setDate(now.getDate() - 1);
      break;
    case "7d":
      startDate.setDate(now.getDate() - 7);
      endDate = new Date(now);
      break;
    case "30d":
      startDate.setDate(now.getDate() - 30);
      endDate = new Date(now);
      break;
    case "90d":
      startDate.setDate(now.getDate() - 90);
      endDate = new Date(now);
      break;
    case "custom":
      // For custom, use provided dates
      if (customStart && customEnd) {
        return {
          startDate: customStart,
          endDate: customEnd,
        };
      }
      // Fallback to 7 days if custom dates not provided
      startDate.setDate(now.getDate() - 7);
      endDate = new Date(now);
      break;
    default:
      startDate.setDate(now.getDate() - 7);
      endDate = new Date(now);
  }
  
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  // Format dates in local timezone (YYYY-MM-DD) to avoid timezone conversion issues
  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

// Get delivery issues data
async function getDeliveryIssues(analyticsPool, startDate, endDate) {
  try {
    // Get all issue types
    const [issueTypes] = await analyticsPool.query(
      `SELECT id, name, code 
       FROM issue_types 
       WHERE active = 1
       ORDER BY name ASC`
    );

    // Get all issues within date range
    // Note: Issues link to delivery boys through orders (issues.order_id -> orders.delivery_boy_id -> delivery_boys.user_id)
    // Note: issue_status_history uses to_status_id (not status_id)
    const [issues] = await analyticsPool.query(
      `SELECT 
        i.id,
        i.user_id,
        i.order_id,
        i.issue_type_id,
        i.created_at,
        i.updated_at,
        it.name as issue_type_name,
        db.name as delivery_boy_name,
        db.id as delivery_boy_id,
        db.user_id as delivery_boy_user_id,
        o.user_id as order_user_id,
        COALESCE(
          (SELECT to_status_id 
           FROM issue_status_history ish 
           WHERE ish.issue_id = i.id 
           ORDER BY ish.changed_at DESC 
           LIMIT 1),
          i.current_status_id
        ) as current_status_id,
        COALESCE(
          (SELECT name 
           FROM issue_statuses iss 
           WHERE iss.id = (
             SELECT to_status_id 
             FROM issue_status_history ish 
             WHERE ish.issue_id = i.id 
             ORDER BY ish.changed_at DESC 
             LIMIT 1
           )),
          (SELECT name FROM issue_statuses WHERE id = i.current_status_id)
        ) as current_status_name
       FROM issues i
       LEFT JOIN issue_types it ON it.id = i.issue_type_id
       LEFT JOIN orders o ON o.id = i.order_id
       LEFT JOIN delivery_boys db ON db.user_id = o.delivery_boy_id
       WHERE i.created_at >= ? AND i.created_at <= ?
       ORDER BY i.created_at DESC`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
    );

    // Get all issue statuses
    const [allStatuses] = await analyticsPool.query(
      `SELECT id, name, code 
       FROM issue_statuses 
       ORDER BY sort_order ASC, name ASC`
    );

    // Calculate counts by status
    const statusCounts = {};
    allStatuses.forEach(status => {
      statusCounts[status.name] = 0;
    });
    issues.forEach(issue => {
      const statusName = issue.current_status_name || "Unknown";
      if (!statusCounts[statusName]) {
        statusCounts[statusName] = 0;
      }
      statusCounts[statusName]++;
    });
    const statusCountsTable = allStatuses.map(status => ({
      name: status.name,
      code: status.code,
      count: statusCounts[status.name] || 0,
    }));

    // Calculate counts by type
    const typeCounts = {};
    issueTypes.forEach(type => {
      typeCounts[type.name] = 0;
    });
    issues.forEach(issue => {
      const typeName = issue.issue_type_name || "Unknown";
      if (!typeCounts[typeName]) {
        typeCounts[typeName] = 0;
      }
      typeCounts[typeName]++;
    });
    const typeCountsTable = issueTypes.map(type => ({
      name: type.name,
      code: type.code,
      count: typeCounts[type.name] || 0,
    }));


    // Format issues for the table (include all necessary fields)
    const issuesList = issues.map(issue => ({
      id: issue.id,
      issue_type_id: issue.issue_type_id,
      issue_type_name: issue.issue_type_name || "Unknown",
      current_status_id: issue.current_status_id,
      current_status_name: issue.current_status_name || "Unknown",
      delivery_boy_id: issue.delivery_boy_id,
      delivery_boy_name: issue.delivery_boy_name || null,
      delivery_boy_user_id: issue.delivery_boy_user_id,
      order_id: issue.order_id,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
    }));

    return {
      statusCounts: statusCountsTable,
      typeCounts: typeCountsTable,
      issues: issuesList,
      issueTypes: issueTypes.map(t => ({ id: t.id, name: t.name })),
      statuses: allStatuses.map(s => ({ id: s.id, name: s.name, code: s.code })),
    };
  } catch (error) {
    console.error("Error getting delivery issues:", error);
    throw error;
  }
}


// Helper function to get color for issue type
function getColorForIssueType(typeId, alpha = 1) {
  const colors = [
    `rgba(59, 130, 246, ${alpha})`, // blue
    `rgba(16, 185, 129, ${alpha})`, // green
    `rgba(245, 158, 11, ${alpha})`, // amber
    `rgba(239, 68, 68, ${alpha})`, // red
    `rgba(139, 92, 246, ${alpha})`, // violet
    `rgba(236, 72, 153, ${alpha})`, // pink
    `rgba(14, 165, 233, ${alpha})`, // sky
    `rgba(34, 197, 94, ${alpha})`, // emerald
  ];
  return colors[typeId % colors.length];
}

