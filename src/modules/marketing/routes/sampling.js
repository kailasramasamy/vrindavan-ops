import express from "express";
import fetch from "node-fetch";
import { opsPool, analyticsPool, getAppDbName } from "../../../db/pool.js";

const router = express.Router();

// Initialize database schema - ensure reference_product_id and reference_product_name columns exist
async function ensureSchemaColumns() {
  if (!opsPool) return;
  
  try {
    // Add reference_product_id column if it doesn't exist
    try {
      await opsPool.query(
        `ALTER TABLE marketing_sampling_campaigns 
         ADD COLUMN reference_product_id INT NULL`
      );
      console.log("Added reference_product_id column to marketing_sampling_campaigns");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding reference_product_id column:", err);
      }
    }
    
    // Add reference_product_name column if it doesn't exist
    try {
      await opsPool.query(
        `ALTER TABLE marketing_sampling_campaigns 
         ADD COLUMN reference_product_name VARCHAR(255) NULL`
      );
      console.log("Added reference_product_name column to marketing_sampling_campaigns");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding reference_product_name column:", err);
      }
    }
    
    // Add batch_number column to marketing_sampling_customers if it doesn't exist
    try {
      await opsPool.query(
        `ALTER TABLE marketing_sampling_customers 
         ADD COLUMN batch_number INT NULL AFTER sampling_date`
      );
      console.log("Added batch_number column to marketing_sampling_customers");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding batch_number column:", err);
      }
    }
    
    // Add amount_credited column to marketing_sampling_customers if it doesn't exist
    try {
      await opsPool.query(
        `ALTER TABLE marketing_sampling_customers 
         ADD COLUMN amount_credited BOOLEAN DEFAULT FALSE AFTER batch_number`
      );
      console.log("Added amount_credited column to marketing_sampling_customers");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding amount_credited column:", err);
      }
    }
    
    // Add sampling_scheduled column to marketing_sampling_customers if it doesn't exist
    try {
      await opsPool.query(
        `ALTER TABLE marketing_sampling_customers 
         ADD COLUMN sampling_scheduled BOOLEAN DEFAULT FALSE AFTER amount_credited`
      );
      console.log("Added sampling_scheduled column to marketing_sampling_customers");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding sampling_scheduled column:", err);
      }
    }
  } catch (error) {
    console.error("Error ensuring schema columns:", error);
  }
}

// Helper function to calculate batch_number for a sampling_date in a campaign
// Batch numbers are assigned based on chronological order of sampling dates (oldest = Batch 1)
async function calculateBatchNumber(campaignId, samplingDate) {
  if (!opsPool || !samplingDate) return null;
  
  try {
    const normalizedDate = samplingDate.split('T')[0].trim();
    
    // Check if there are existing customers with this sampling_date and batch_number
    const [existingCustomers] = await opsPool.query(
      `SELECT batch_number
       FROM marketing_sampling_customers 
       WHERE campaign_id = ? AND DATE_FORMAT(sampling_date, '%Y-%m-%d') = ? AND batch_number IS NOT NULL
       LIMIT 1`,
      [campaignId, normalizedDate]
    );
    
    // If the date already exists with a batch_number, use it
    if (existingCustomers.length > 0 && existingCustomers[0].batch_number) {
      return existingCustomers[0].batch_number;
    }
    
    // Otherwise, calculate batch_number based on chronological order
    // Get all distinct sampling dates for this campaign, sorted by date (ascending)
    const [dateRows] = await opsPool.query(
      `SELECT DISTINCT DATE_FORMAT(sampling_date, '%Y-%m-%d') as date_str
       FROM marketing_sampling_customers 
       WHERE campaign_id = ? AND sampling_date IS NOT NULL
       ORDER BY date_str ASC`,
      [campaignId]
    );
    
    const existingDates = dateRows.map(row => row.date_str);
    
    // Calculate where this date should fit in the sorted order
    const allDates = [...existingDates, normalizedDate].sort((a, b) => a.localeCompare(b));
    return allDates.indexOf(normalizedDate) + 1;
  } catch (error) {
    console.error("Error calculating batch number:", error);
    return null;
  }
}

// Run schema initialization when module loads
if (opsPool) {
  ensureSchemaColumns().catch(err => {
    console.error("Failed to initialize schema columns:", err);
  });
}

// Get all products from stage copy database
router.get("/products", async (req, res) => {
  try {
    if (!analyticsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const search = req.query.search || "";
    const limit = parseInt(req.query.limit) || 100;

    let query = "SELECT id, name, price, unit, sku_code FROM foods WHERE status = '1'";
    const params = [];

    if (search) {
      query += " AND (name LIKE ? OR sku_code LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += " ORDER BY name ASC LIMIT ?";
    params.push(limit);

    const [rows] = await analyticsPool.query(query, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// Get top buyers of Product A who haven't ordered Product B
// This finds customers who order Product A regularly but haven't ordered Product B
router.get("/customers/top-buyers", async (req, res) => {
  // Set longer timeout for this endpoint to prevent proxy timeouts
  req.setTimeout(90000); // 90 seconds (longer for production proxy)
  res.setTimeout(90000); // 90 seconds
  
  // Set headers to keep connection alive and disable nginx buffering
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering for streaming
  
  try {
    if (!analyticsPool || !opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const referenceProductId = parseInt(req.query.reference_product_id); // Product A (they order regularly)
    const sampleProductId = parseInt(req.query.sample_product_id); // Product B (they haven't ordered)
    const campaignId = parseInt(req.query.campaign_id) || null;
    // Reduce default limit to prevent proxy timeouts - allow up to 1000 but default to 500
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);

    if (!referenceProductId || !sampleProductId || isNaN(referenceProductId) || isNaN(sampleProductId)) {
      return res.status(400).json({
        success: false,
        error: "Both reference_product_id and sample_product_id are required",
      });
    }

    // Calculate date 30 days ago for checking if they ordered sample product recently
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    // Optimized query using CTE (Common Table Expression) for better performance
    // Strategy:
    // 1. sample_buyers CTE: Pre-materializes users who ordered sample product in last 30 days (faster filtering)
    // 2. ref_agg CTE: Pre-aggregates reference product stats per user for last 30 days only (single pass aggregation)
    // 3. Final query: Joins and filters using LEFT JOIN with NULL check (more efficient than NOT EXISTS)
    const topBuyersQuery = `
      WITH sample_buyers AS (
        SELECT DISTINCT o2.user_id
        FROM orders o2
        JOIN food_orders fo2 ON fo2.order_id = o2.id
        WHERE fo2.food_id = ?
          AND o2.order_status_id NOT IN (6, 7)
          AND o2.order_date >= ?
      ),
      ref_agg AS (
        SELECT
          o.user_id,
          COUNT(DISTINCT o.id) AS reference_product_orders,
          SUM(fo.quantity) AS reference_product_total_quantity,
          SUM(fo.price * fo.quantity) AS reference_product_total_amount,
          MAX(o.order_date) AS reference_product_last_order_date
        FROM food_orders fo
        JOIN orders o ON o.id = fo.order_id
        WHERE fo.food_id = ?
          AND o.order_status_id NOT IN (6, 7)
          AND o.order_date >= ?
        GROUP BY o.user_id
      )
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        u.phone AS customer_phone,
        r.reference_product_orders,
        r.reference_product_total_quantity,
        r.reference_product_total_amount,
        r.reference_product_last_order_date
      FROM ref_agg r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN sample_buyers sb ON sb.user_id = u.id
      WHERE u.is_deactivated = 0
        AND sb.user_id IS NULL
      ORDER BY r.reference_product_total_amount DESC, r.reference_product_orders DESC
      LIMIT ?
    `;

    // Execute optimized query with timeout protection
    // Note: Parameter order matches the query:
    // 1. sampleProductId - for sample_buyers CTE
    // 2. thirtyDaysAgoStr - for sample_buyers CTE (date filter)
    // 3. referenceProductId - for ref_agg CTE
    // 4. thirtyDaysAgoStr - for ref_agg CTE (date filter - only customers who ordered reference product in last 30 days)
    // 5. limit - for final LIMIT clause
    const queryStartTime = Date.now();
    const queryPromise = analyticsPool.query(topBuyersQuery, [
      sampleProductId,
      thirtyDaysAgoStr,
      referenceProductId,
      thirtyDaysAgoStr,
      limit,
    ]);
    
    // 30 second timeout (allowing time for query execution on slower servers)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30000);
    });
    
    const [topBuyers] = await Promise.race([queryPromise, timeoutPromise]);
    const queryTime = Date.now() - queryStartTime;
    console.log(`Top buyers query completed in ${queryTime}ms, fetched ${topBuyers.length} customers`);

    // Get already added customer IDs in batch to reduce database queries
    let existingCustomerIds = new Set();
    if (campaignId && topBuyers.length > 0) {
      const customerIds = topBuyers.map(b => b.customer_id);
      const placeholders = customerIds.map(() => '?').join(',');
      const [existing] = await opsPool.query(
        `SELECT customer_id FROM marketing_sampling_customers 
         WHERE campaign_id = ? AND customer_id IN (${placeholders})`,
        [campaignId, ...customerIds]
      );
      existingCustomerIds = new Set(existing.map(e => e.customer_id));
    }

    // Map results
    const customers = topBuyers.map(buyer => ({
      customer_id: buyer.customer_id,
      customer_name: buyer.customer_name || 'N/A',
      customer_phone: buyer.customer_phone || 'N/A',
      reference_product_orders: buyer.reference_product_orders,
      reference_product_total_quantity: buyer.reference_product_total_quantity,
      reference_product_total_amount: parseFloat(buyer.reference_product_total_amount || 0),
      reference_product_last_order_date: buyer.reference_product_last_order_date,
      already_added: existingCustomerIds.has(buyer.customer_id),
    }));

    res.json({
      success: true,
      data: customers,
    });
  } catch (error) {
    console.error("Error fetching top buyers:", error);
    console.error("Error stack:", error.stack);
    
    // Handle timeout and proxy errors specifically
    const isTimeout = error.message && (
      error.message.includes('timeout') || 
      error.message.includes('Timeout')
    );
    
    const statusCode = isTimeout ? 504 : 500;
    const errorMessage = isTimeout 
      ? "Query took too long. Please try with a smaller limit (e.g., 500 customers)." 
      : "Failed to fetch top buyers. The server may be experiencing high load.";
    
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      message: error.message 
    });
  }
});

// Create a new sampling campaign
router.post("/campaigns", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const { campaign_name, description, product_id, product_name, created_by } = req.body;

    if (!campaign_name || !product_id || !product_name) {
      return res.status(400).json({
        success: false,
        error: "campaign_name, product_id, and product_name are required",
      });
    }

    const [result] = await opsPool.query(
      `INSERT INTO marketing_sampling_campaigns 
       (campaign_name, description, product_id, product_name, created_by, status) 
       VALUES (?, ?, ?, ?, ?, 'draft')`,
      [campaign_name, description || null, product_id, product_name, created_by || 1]
    );

    res.json({
      success: true,
      data: {
        campaign_id: result.insertId,
      },
    });
  } catch (error) {
    console.error("Error creating campaign:", error);
    res.status(500).json({ success: false, error: "Failed to create campaign" });
  }
});

// Get all campaigns
router.get("/campaigns", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const [campaigns] = await opsPool.query(
      `SELECT * FROM marketing_sampling_campaigns 
       ORDER BY created_at DESC`
    );

    // Get stats for each campaign
    for (const campaign of campaigns) {
      const [customerCount] = await opsPool.query(
        "SELECT COUNT(*) AS count FROM marketing_sampling_customers WHERE campaign_id = ?",
        [campaign.id]
      );
      const [orderCount] = await opsPool.query(
        "SELECT COUNT(*) AS count FROM marketing_sampling_tracking WHERE campaign_id = ?",
        [campaign.id]
      );
      const [totalAmount] = await opsPool.query(
        "SELECT COALESCE(SUM(order_amount), 0) AS total FROM marketing_sampling_tracking WHERE campaign_id = ?",
        [campaign.id]
      );

      campaign.customer_count = customerCount[0].count;
      campaign.order_count = orderCount[0].count;
      campaign.total_amount = parseFloat(totalAmount[0].total || 0);

      // Get product image and unit from foods and media tables
      if (campaign.product_id && analyticsPool) {
        try {
          // Get product unit from foods table
          const [products] = await analyticsPool.query(
            "SELECT id, name, unit FROM foods WHERE id = ?",
            [campaign.product_id]
          );
          if (products.length > 0) {
            campaign.product_unit = products[0].unit || null;
          }

          // Get product image from media table
          const [media] = await analyticsPool.query(
            `SELECT file_name FROM media 
             WHERE model_type = 'App\\\\Models\\\\Food'
             AND model_id = ? 
             ORDER BY order_column ASC, id ASC LIMIT 1`,
            [campaign.product_id]
          );
          
          if (media.length > 0 && media[0].file_name) {
            const fileName = media[0].file_name;
            const encodedUrl = encodeURIComponent(`https://media-image-upload.s3.ap-south-1.amazonaws.com/foods/${fileName}`);
            campaign.product_image = `https://app.vrindavanmilk.com/_next/image?url=${encodedUrl}&w=48&q=75`;
          }
        } catch (err) {
          console.error("Error fetching product image/unit for campaign:", campaign.id, err);
        }
      }
    }

    res.json({
      success: true,
      data: campaigns,
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ success: false, error: "Failed to fetch campaigns" });
  }
});

// Get campaign details
router.get("/campaigns/:id", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    
    // Validate that the ID is a valid number
    if (isNaN(campaignId)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid campaign ID" 
      });
    }

    const [campaigns] = await opsPool.query(
      "SELECT * FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    // Get customers with delivery address and locality information
    // Format sampling_date as string (YYYY-MM-DD) to avoid timezone conversion issues
    const [customers] = await opsPool.query(
      `SELECT 
         msc.campaign_id,
         msc.customer_id,
         msc.customer_name,
         msc.customer_phone,
         msc.reference_product_id,
         msc.reference_product_orders,
         DATE_FORMAT(msc.sampling_date, '%Y-%m-%d') as sampling_date,
         msc.batch_number,
         msc.amount_credited,
         msc.sampling_scheduled,
         msc.added_at,
         da.house_no,
         da.complete_address,
         l.name AS locality_name
       FROM vrindavan_ops.marketing_sampling_customers msc
       LEFT JOIN ${getAppDbName()}.users u ON u.id = msc.customer_id
       LEFT JOIN ${getAppDbName()}.delivery_addresses da ON da.user_id = u.id AND da.is_default = 1
       LEFT JOIN ${getAppDbName()}.localities l ON l.id = da.locality_id
       WHERE msc.campaign_id = ? 
       ORDER BY msc.added_at DESC`,
      [campaignId]
    );

    // Update batch_number for customers that don't have it
    // Get all distinct sampling dates for this campaign, sorted by date (ascending)
    const [dateRows] = await opsPool.query(
      `SELECT DISTINCT DATE_FORMAT(sampling_date, '%Y-%m-%d') as date_str
       FROM marketing_sampling_customers 
       WHERE campaign_id = ? AND sampling_date IS NOT NULL
       ORDER BY date_str ASC`,
      [campaignId]
    );
    
    // Create a map of date -> batch number
    const dateToBatchMap = {};
    dateRows.forEach((row, idx) => {
      dateToBatchMap[row.date_str] = idx + 1;
    });
    
    // Update customers without batch_number
    for (const customer of customers) {
      if (customer.sampling_date && !customer.batch_number) {
        const normalizedDate = customer.sampling_date.split('T')[0].trim();
        const batchNum = dateToBatchMap[normalizedDate];
        if (batchNum) {
          await opsPool.query(
            `UPDATE marketing_sampling_customers 
             SET batch_number = ? 
             WHERE campaign_id = ? AND customer_id = ?`,
            [batchNum, campaignId, customer.customer_id]
          );
          customer.batch_number = batchNum;
        }
      }
    }

    // Get tracking data
    const [tracking] = await opsPool.query(
      `SELECT * FROM marketing_sampling_tracking 
       WHERE campaign_id = ? 
       ORDER BY order_date DESC, tracked_at DESC`,
      [campaignId]
    );

    // Get daily summary
    const [dailySummary] = await opsPool.query(
      `SELECT 
         order_date,
         COUNT(DISTINCT order_id) AS order_count,
         SUM(quantity) AS total_quantity,
         SUM(order_amount) AS total_amount
       FROM marketing_sampling_tracking
       WHERE campaign_id = ?
       GROUP BY order_date
       ORDER BY order_date DESC
       LIMIT 30`,
      [campaignId]
    );

    // Get sample product image and discount_price from database if product_id exists
    if (campaign.product_id && analyticsPool) {
      try {
        // Get product discount_price
        const [products] = await analyticsPool.query(
          "SELECT id, name, discount_price FROM foods WHERE id = ?",
          [campaign.product_id]
        );
        
        if (products.length > 0) {
          campaign.product_discount_price = products[0].discount_price || 0;
        }
        
        // Query media table using polymorphic relationship (model_type and model_id)
        // media.model_id references foods.id when model_type = 'App\\Models\\Food'
        const [media] = await analyticsPool.query(
          `SELECT file_name FROM media 
           WHERE model_type = 'App\\\\Models\\\\Food'
           AND model_id = ? 
           ORDER BY order_column ASC, id ASC LIMIT 1`,
          [campaign.product_id]
        );
        
        if (media.length > 0 && media[0].file_name) {
          // Construct the image URL using the provided format
          const fileName = media[0].file_name;
          const encodedUrl = encodeURIComponent(`https://media-image-upload.s3.ap-south-1.amazonaws.com/foods/${fileName}`);
          campaign.product_image = `https://app.vrindavanmilk.com/_next/image?url=${encodedUrl}&w=48&q=75`;
        }
      } catch (err) {
        console.error("Error fetching sample product details:", err);
      }
    }

    campaign.customers = customers;
    campaign.tracking = tracking;
    campaign.daily_summary = dailySummary.map((row) => ({
      order_date: row.order_date,
      order_count: row.order_count,
      total_quantity: parseInt(row.total_quantity || 0),
      total_amount: parseFloat(row.total_amount || 0),
    }));

    // Get reference_product_id from campaign table if available
    // The columns now exist, so we can directly access them from the SELECT * result
    // If not in campaign table, fall back to getting it from customers
    if (campaign.reference_product_id) {
      // Campaign already has reference_product_id, just get the name if missing
      if (!campaign.reference_product_name && analyticsPool) {
        try {
          const [products] = await analyticsPool.query(
            "SELECT name FROM foods WHERE id = ?",
            [campaign.reference_product_id]
          );
          if (products.length > 0) {
            campaign.reference_product_name = products[0].name;
          }
        } catch (err) {
          console.error("Error fetching reference product name:", err);
        }
      }
    } else if (customers.length > 0) {
      // Fallback: Get the most common reference_product_id from existing customers
      // This helps pre-fill the reference product when adding more customers
      const referenceProductCounts = {};
      customers.forEach(customer => {
        if (customer.reference_product_id) {
          referenceProductCounts[customer.reference_product_id] = 
            (referenceProductCounts[customer.reference_product_id] || 0) + 1;
        }
      });
      
      // Get the most common reference_product_id
      const productKeys = Object.keys(referenceProductCounts);
      let mostCommon = null;
      if (productKeys.length > 0) {
        mostCommon = productKeys.reduce((a, b) => 
          referenceProductCounts[a] > referenceProductCounts[b] ? a : b
        );
      }
      
      if (mostCommon) {
        campaign.reference_product_id = parseInt(mostCommon);
        
        // Try to get the product name from analytics database
        if (analyticsPool) {
          try {
            const [products] = await analyticsPool.query(
              "SELECT id, name FROM foods WHERE id = ?",
              [mostCommon]
            );
            if (products.length > 0) {
              campaign.reference_product_name = products[0].name;
            }
          } catch (err) {
            // Ignore error if product not found
            console.error("Error fetching reference product name:", err);
          }
        }
      }
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    console.error("Error fetching campaign details:", error);
    res.status(500).json({ success: false, error: "Failed to fetch campaign details" });
  }
});

// Add customers to campaign
router.post("/campaigns/:id/customers", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    const { customers, sampling_date } = req.body;

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: "customers array is required",
      });
    }

    if (!sampling_date) {
      return res.status(400).json({
        success: false,
        error: "sampling_date is required",
      });
    }

    // Check for duplicate customers already in this campaign
    const customerIds = customers.map(c => c.customer_id);
    const [existingCustomers] = await opsPool.query(
      `SELECT customer_id FROM marketing_sampling_customers 
       WHERE campaign_id = ? AND customer_id IN (?)`,
      [campaignId, customerIds]
    );

    if (existingCustomers.length > 0) {
      const duplicateIds = existingCustomers.map(c => c.customer_id).join(', ');
      return res.status(400).json({
        success: false,
        error: `Customer(s) ${duplicateIds} already exist in this campaign`,
      });
    }

    // Calculate batch_number for this sampling_date
    const batchNumber = await calculateBatchNumber(campaignId, sampling_date);
    
    // Insert customers with sampling_date and batch_number
    const values = customers.map((customer) => [
      campaignId,
      customer.customer_id,
      customer.customer_name || null,
      customer.customer_phone || null,
      customer.reference_product_id || null,
      customer.reference_product_orders || null,
      sampling_date,
      batchNumber
    ]);

    await opsPool.query(
      `INSERT INTO marketing_sampling_customers 
       (campaign_id, customer_id, customer_name, customer_phone, reference_product_id, reference_product_orders, sampling_date, batch_number) 
       VALUES ?`,
      [values]
    );

    // Update campaign with reference product if not already set
    // Get the reference_product_id from the first customer (they should all have the same one)
    const firstCustomer = customers.find(c => c.reference_product_id);
    if (firstCustomer && firstCustomer.reference_product_id) {
      // Check if campaign already has a reference_product_id
      const [campaigns] = await opsPool.query(
        "SELECT reference_product_id FROM marketing_sampling_campaigns WHERE id = ?",
        [campaignId]
      );
      
      const campaign = campaigns[0];
      
      // Only update if not already set
      if (!campaign || !campaign.reference_product_id) {
        // Get product name from analytics database
        let referenceProductName = null;
        if (analyticsPool) {
          try {
            const [products] = await analyticsPool.query(
              "SELECT name FROM foods WHERE id = ?",
              [firstCustomer.reference_product_id]
            );
            if (products.length > 0) {
              referenceProductName = products[0].name;
            }
          } catch (err) {
            console.error("Error fetching reference product name:", err);
          }
        }

        // Update campaign with reference_product_id and reference_product_name
        // Columns now exist in the table
        try {
          if (referenceProductName) {
            await opsPool.query(
              `UPDATE marketing_sampling_campaigns 
               SET reference_product_id = ?, reference_product_name = ? 
               WHERE id = ?`,
              [firstCustomer.reference_product_id, referenceProductName, campaignId]
            );
          } else {
            await opsPool.query(
              `UPDATE marketing_sampling_campaigns 
               SET reference_product_id = ? 
               WHERE id = ?`,
              [firstCustomer.reference_product_id, campaignId]
            );
          }
        } catch (err) {
          console.error("Error updating campaign with reference product:", err);
        }
      }
    }

    res.json({
      success: true,
      message: `Added ${customers.length} customers to campaign`,
    });
  } catch (error) {
    console.error("Error adding customers:", error);
    res.status(500).json({ success: false, error: "Failed to add customers" });
  }
});

// Update campaign status
router.patch("/campaigns/:id/status", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    const { status } = req.body;

    if (!["draft", "active", "paused", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
      });
    }

    await opsPool.query("UPDATE marketing_sampling_campaigns SET status = ? WHERE id = ?", [
      status,
      campaignId,
    ]);

    res.json({
      success: true,
      message: "Campaign status updated",
    });
  } catch (error) {
    console.error("Error updating campaign status:", error);
    res.status(500).json({ success: false, error: "Failed to update campaign status" });
  }
});

// Add credit to customers for sampling (Step 1 of auto-scheduling)
router.post("/campaigns/:id/add-credit", async (req, res) => {
  try {
    if (!opsPool || !analyticsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    const { sampling_date, test_mode, dry_run } = req.body;

    if (!sampling_date) {
      return res.status(400).json({
        success: false,
        error: "sampling_date is required",
      });
    }

    // Get campaign details
    const [campaigns] = await opsPool.query(
      "SELECT * FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    // Get product discount_price from analytics database
    const [products] = await analyticsPool.query(
      "SELECT id, name, unit, discount_price FROM foods WHERE id = ?",
      [campaign.product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = products[0];
    const creditAmount = parseFloat(product.discount_price || 0);

    if (creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Product discount_price is not set or invalid",
      });
    }

    // Normalize sampling_date to YYYY-MM-DD format (remove any time component)
    const normalizedDate = sampling_date.split('T')[0].trim();
    
    // Get customers for this sampling date, sorted by customer_id for consistency
    // This ensures test mode always uses the same customer (lowest customer_id)
    const [customers] = await opsPool.query(
      `SELECT customer_id, customer_name, customer_phone 
       FROM marketing_sampling_customers 
       WHERE campaign_id = ? AND DATE(sampling_date) = DATE(?)
       ORDER BY customer_id ASC`,
      [campaignId, normalizedDate]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No customers found for this sampling date",
      });
    }

    // If test mode, only process the first customer (lowest customer_id)
    const customersToProcess = test_mode ? [customers[0]] : customers;

    // Get today's date in YYYY-MM-DD format for the credit refund
    // Credit is added today, but samples will be sent on the sampling_date
    const today = new Date();
    const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Add credit to each customer by calling wallet/refund API
    const results = [];
    const refundReason = `Sampling of ${product.name} ${product.unit || ''}`.trim();

    for (const customer of customersToProcess) {
      try {
        const payload = {
          user_id: customer.customer_id,
          amount: creditAmount,
          date: todayDateStr,  // Use today's date for credit addition (not sampling_date)
          refund_reason: refundReason
        };

        if (dry_run) {
          // Dry run mode: just log, don't call API
          results.push({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            amount: creditAmount,
            success: true,
            message: 'Credit would be added successfully (dry run)',
            error: null
          });
        } else {
          // Call the wallet/refund API
          const apiToken = process.env.VRINDAVAN_API_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJrYWlsYXNAdnJpbmRhdmFubWlsay5jb20iLCJpYXQiOjE3NTAzNzIyOTUsImV4cCI6MTc1MDM3NTg5NX0.6Xts_xqvakcMjnO64Veg9llIujH38BnDotUTH1eC6jk";
          
          const response = await fetch('https://app.vrindavanmilk.com/api/wallet/refund', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          const success = response.ok;
          results.push({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            amount: creditAmount,
            success: success,
            message: result.message || (success ? 'Credit added successfully' : 'Failed to add credit'),
            error: success ? null : (result.error || result.message || 'Unknown error')
          });
          
          // Update amount_credited flag if credit was successfully added
          if (success && !dry_run) {
            await opsPool.query(
              `UPDATE marketing_sampling_customers 
               SET amount_credited = TRUE 
               WHERE campaign_id = ? AND customer_id = ?`,
              [campaignId, customer.customer_id]
            );
          }
        }

      } catch (error) {
        results.push({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          amount: creditAmount,
          success: false,
          message: 'Failed to add credit',
          error: error.message
        });
      }
    }

    // Calculate summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Credit addition completed: ${successCount} succeeded, ${failureCount} failed`,
      summary: {
        total: customersToProcess.length,
        succeeded: successCount,
        failed: failureCount,
        credit_amount: creditAmount,
        product_name: product.name,
        test_mode: test_mode || false
      },
      results: results
    });

  } catch (error) {
    console.error("Error adding credit:", error);
    res.status(500).json({ success: false, error: "Failed to add credit to customers" });
  }
});

// Place sample order for customers (Step 2 of auto-scheduling)
router.post("/campaigns/:id/place-order", async (req, res) => {
  try {
    if (!opsPool || !analyticsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    const { sampling_date, test_mode, dry_run } = req.body;

    if (!sampling_date) {
      return res.status(400).json({
        success: false,
        error: "sampling_date is required",
      });
    }

    // Get campaign details
    const [campaigns] = await opsPool.query(
      "SELECT * FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    if (!campaign.product_id) {
      return res.status(400).json({
        success: false,
        error: "Campaign product_id is not set",
      });
    }

    // Get product details from analytics database
    const [products] = await analyticsPool.query(
      "SELECT id, name, unit, discount_price, price FROM foods WHERE id = ?",
      [campaign.product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = products[0];
    const discountPrice = parseFloat(product.discount_price || product.price || 0);
    const regularPrice = parseFloat(product.price || product.discount_price || 0);

    if (discountPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: "Product price is not set or invalid",
      });
    }

    // Normalize sampling_date to YYYY-MM-DD format (remove any time component)
    // Use the date string directly from the batch to ensure correct date
    let normalizedDate = sampling_date.split('T')[0].trim();
    // If empty, try to parse as date and format
    if (!normalizedDate || normalizedDate === '') {
      const dateObj = new Date(sampling_date);
      if (!isNaN(dateObj.getTime())) {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        normalizedDate = `${year}-${month}-${day}`;
      }
    }
    
    // Get customers for this sampling date, sorted by customer_id for consistency
    // Match exact sampling_date only (no range check)
    const [customers] = await opsPool.query(
      `SELECT customer_id, customer_name, customer_phone, 
              DATE_FORMAT(sampling_date, '%Y-%m-%d') as sampling_date_str,
              sampling_date
       FROM marketing_sampling_customers 
       WHERE campaign_id = ? 
         AND DATE_FORMAT(sampling_date, '%Y-%m-%d') = ?
       ORDER BY customer_id ASC`,
      [campaignId, normalizedDate]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No customers found for this sampling date",
      });
    }

    // Get the actual date from the first customer's database record
    // All customers in a batch have the same sampling_date, so use the first one
    // This ensures we use the exact date stored in the database, not the timezone-shifted request date
    const actualBatchDate = customers[0].sampling_date_str?.trim() || normalizedDate;

    // If test mode, only process the first customer (lowest customer_id)
    const customersToProcess = test_mode ? [customers[0]] : customers;

    // Use the actual date from database for all orders
    const batchOrderDate = actualBatchDate;

    // Place order for each customer
    const results = [];

    for (const customer of customersToProcess) {
      try {
        // Use the batch order date (from database) for all customers in this batch
        const customerOrderDate = batchOrderDate;
        
        const payload = {
          user_id: String(customer.customer_id),
          orderDate: customerOrderDate,  // Use exact date from database
          productData: {
            discount_price: discountPrice,
            price: regularPrice,
            food_id: product.id,
            quantity: "1"
          }
        };

        if (dry_run) {
          // Dry run mode: just log, don't call API
          results.push({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            success: true,
            message: 'Order would be placed successfully (dry run)',
            error: null,
            order_id: null
          });
        } else {
          // Call the order API
          const apiToken = process.env.VRINDAVAN_API_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJrYWlsYXNAdnJpbmRhdmFubWlsay5jb20iLCJpYXQiOjE3NTAzNzIyOTUsImV4cCI6MTc1MDM3NTg5NX0.6Xts_xqvakcMjnO64Veg9llIujH38BnDotUTH1eC6jk";

          const response = await fetch('https://app.vrindavanmilk.com/api/orders/oneTimeOrder', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          const success = response.ok;
          results.push({
            customer_id: customer.customer_id,
            customer_name: customer.customer_name,
            success: success,
            message: result.message || (success ? 'Order placed successfully' : 'Failed to place order'),
            error: success ? null : (result.error || result.message || 'Unknown error'),
            order_id: result.order_id || result.data?.order_id || null
          });
          
          // Update sampling_scheduled flag if order was successfully placed
          if (success && !dry_run) {
            await opsPool.query(
              `UPDATE marketing_sampling_customers 
               SET sampling_scheduled = TRUE 
               WHERE campaign_id = ? AND customer_id = ?`,
              [campaignId, customer.customer_id]
            );
          }
        }

      } catch (error) {
        results.push({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          success: false,
          message: 'Failed to place order',
          error: error.message,
          order_id: null
        });
      }
    }

    // Calculate summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Order placement completed: ${successCount} succeeded, ${failureCount} failed`,
      summary: {
        total: customersToProcess.length,
        succeeded: successCount,
        failed: failureCount,
        product_name: product.name,
        product_id: product.id,
        test_mode: test_mode || false
      },
      results: results
    });

  } catch (error) {
    console.error("Error placing orders:", error);
    res.status(500).json({ success: false, error: "Failed to place orders" });
  }
});

// Delete customer from campaign
router.delete("/campaigns/:id/customers/:customerId", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);
    const customerId = parseInt(req.params.customerId);

    await opsPool.query(
      "DELETE FROM marketing_sampling_customers WHERE campaign_id = ? AND customer_id = ?",
      [campaignId, customerId]
    );

    res.json({
      success: true,
      message: "Customer removed from campaign",
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({ success: false, error: "Failed to delete customer" });
  }
});

// Delete campaign (and all related data)
router.delete("/campaigns/:id", async (req, res) => {
  try {
    if (!opsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);

    // Verify campaign exists
    const [campaigns] = await opsPool.query(
      "SELECT id, campaign_name FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    // Delete related data first (tracking, then customers, then campaign)
    // Note: Order matters due to foreign key constraints if any exist
    
    // Delete tracking data
    await opsPool.query(
      "DELETE FROM marketing_sampling_tracking WHERE campaign_id = ?",
      [campaignId]
    );

    // Delete customers
    await opsPool.query(
      "DELETE FROM marketing_sampling_customers WHERE campaign_id = ?",
      [campaignId]
    );

    // Delete the campaign
    await opsPool.query(
      "DELETE FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    res.json({
      success: true,
      message: "Campaign and all related data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ success: false, error: "Failed to delete campaign" });
  }
});

// Run tracking for a campaign (scan for new orders)
router.post("/campaigns/:id/track", async (req, res) => {
  try {
    if (!opsPool || !analyticsPool) {
      return res.status(503).json({ success: false, error: "Database unavailable" });
    }

    const campaignId = parseInt(req.params.id);

    // Get campaign details
    const [campaigns] = await opsPool.query(
      "SELECT * FROM marketing_sampling_campaigns WHERE id = ?",
      [campaignId]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    // Get tracked customers for this campaign
    const [trackedCustomers] = await opsPool.query(
      "SELECT customer_id FROM marketing_sampling_customers WHERE campaign_id = ?",
      [campaignId]
    );

    if (trackedCustomers.length === 0) {
      return res.json({
        success: true,
        message: "No tracked customers found",
        new_orders: 0,
      });
    }

    const customerIds = trackedCustomers.map((c) => c.customer_id);

    // Get existing tracked orders for this campaign
    const [existingOrders] = await opsPool.query(
      "SELECT DISTINCT order_id FROM marketing_sampling_tracking WHERE campaign_id = ? AND order_id IS NOT NULL",
      [campaignId]
    );

    const existingOrderIds = existingOrders.map((o) => o.order_id || 0);

    // Query for new orders
    let placeholders = customerIds.map(() => "?").join(",");
    let placeholders2 = existingOrderIds.length > 0 
      ? existingOrderIds.map(() => "?").join(",")
      : "0";

    const trackQuery = `
      SELECT 
        o.id AS order_id,
        o.user_id AS customer_id,
        o.order_date,
        fo.quantity,
        (fo.price * fo.quantity) AS order_amount
      FROM orders o
      INNER JOIN food_orders fo ON o.id = fo.order_id
      WHERE o.user_id IN (${placeholders})
        AND fo.food_id = ?
        AND o.order_status_id NOT IN (6, 7) -- Exclude cancelled
        ${existingOrderIds.length > 0 ? `AND o.id NOT IN (${placeholders2})` : ""}
    `;

    const params = [...customerIds, campaign.product_id, ...existingOrderIds];

    const [newOrders] = await analyticsPool.query(trackQuery, params);

    // Insert tracking records
    if (newOrders.length > 0) {
      const values = newOrders.map((order) => [
        campaignId,
        order.customer_id,
        order.order_id,
        order.order_date,
        order.quantity,
        parseFloat(order.order_amount || 0),
      ]);

      await opsPool.query(
        `INSERT INTO marketing_sampling_tracking 
         (campaign_id, customer_id, order_id, order_date, quantity, order_amount) 
         VALUES ?`,
        [values]
      );
    }

    res.json({
      success: true,
      message: `Tracking completed`,
      new_orders: newOrders.length,
    });
  } catch (error) {
    console.error("Error running tracking:", error);
    res.status(500).json({ success: false, error: "Failed to run tracking" });
  }
});

export default router;

