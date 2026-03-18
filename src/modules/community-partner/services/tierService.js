// CP Tier Service
// Handles tier calculation, progress tracking, and commission multipliers

import pool from "../config/database.js";

/**
 * Get tier configuration from database
 * @returns {Promise<Object>} Tier configuration object
 */
async function getTierConfigFromDB() {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM cp_tier_settings WHERE is_active = TRUE ORDER BY min_sales ASC"
    );

    const config = {};
    rows.forEach((row) => {
      config[row.tier_name] = {
        name: row.tier_name,
        minSales: parseFloat(row.min_sales),
        maxSales: row.max_sales ? parseFloat(row.max_sales) : Infinity,
        commissionMultiplier: parseFloat(row.commission_multiplier),
        commissionRatePercentage: row.commission_rate_percentage ? parseFloat(row.commission_rate_percentage) : null,
        benefits: row.benefits ? row.benefits.split(',').map(b => b.trim()) : [],
        isActive: row.is_active
      };
    });

    // Fallback to default if no settings found
    if (Object.keys(config).length === 0) {
      return getDefaultTierConfig();
    }

    return config;
  } catch (error) {
    console.error("Error loading tier config from database:", error);
    // Fallback to default config
    return getDefaultTierConfig();
  }
}

/**
 * Default tier configuration (fallback)
 */
function getDefaultTierConfig() {
  return {
    Silver: {
      name: "Silver",
      minSales: 0,
      maxSales: 50000,
      commissionMultiplier: 1.0,
      commissionRatePercentage: 2.5,
      benefits: ["Standard 2-3% commission"],
      isActive: true
    },
    Gold: {
      name: "Gold",
      minSales: 50000,
      maxSales: 100000,
      commissionMultiplier: 1.33,
      commissionRatePercentage: 4.0,
      benefits: ["4% commission", "Priority Support badge"],
      isActive: true
    },
    Platinum: {
      name: "Platinum",
      minSales: 100000,
      maxSales: Infinity,
      commissionMultiplier: 1.67,
      commissionRatePercentage: 5.0,
      benefits: ["5% commission", "Quarterly Bonus"],
      isActive: true
    }
  };
}

/**
 * Calculate monthly sales for a CP
 * @param {number} cpId - Community Partner ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<number>} Total sales amount
 */
export async function calculateMonthlySales(cpId, year, month) {
  try {
    // Get all approved commissions for the month
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(eligible_amount), 0) as total_sales
       FROM cp_commission_ledger
       WHERE cp_id = ?
       AND YEAR(order_date) = ?
       AND MONTH(order_date) = ?
       AND status = 'Approved'`,
      [cpId, year, month]
    );

    const totalSales = parseFloat(rows[0]?.total_sales || 0);
    
    // Update or insert monthly sales record
    await pool.execute(
      `INSERT INTO cp_monthly_sales (cp_id, year, month, total_sales, calculated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         total_sales = VALUES(total_sales),
         updated_at = NOW()`,
      [cpId, year, month, totalSales]
    );

    return totalSales;
  } catch (error) {
    console.error("Error calculating monthly sales:", error);
    return 0;
  }
}

/**
 * Determine tier based on monthly sales
 * @param {number} monthlySales - Monthly sales amount
 * @param {Object} tierConfig - Tier configuration object
 * @returns {string} Tier name (Silver, Gold, Platinum)
 */
export function getTierForSales(monthlySales, tierConfig) {
  // Sort tiers by minSales descending to check highest first
  const tiers = Object.values(tierConfig).sort((a, b) => b.minSales - a.minSales);
  
  for (const tier of tiers) {
    if (monthlySales >= tier.minSales && (tier.maxSales === null || tier.maxSales === Infinity || monthlySales < tier.maxSales)) {
      return tier.name;
    }
  }
  
  // Default to lowest tier
  return tiers[tiers.length - 1]?.name || "Silver";
}

/**
 * Get current tier for a CP based on current month's sales
 * @param {number} cpId - Community Partner ID
 * @returns {Promise<Object>} Tier information
 */
export async function getCurrentTier(cpId) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get tier configuration from database
    const tierConfig = await getTierConfigFromDB();

    // Calculate current month sales
    const monthlySales = await calculateMonthlySales(cpId, year, month);
    
    // Determine tier
    const tierName = getTierForSales(monthlySales, tierConfig);
    const currentTierConfig = tierConfig[tierName];

    // Get next tier info
    let nextTier = null;
    let progressToNext = null;
    
    // Find next tier (tier with higher minSales)
    const sortedTiers = Object.values(tierConfig)
      .filter(t => t.isActive)
      .sort((a, b) => a.minSales - b.minSales);
    
    const currentTierIndex = sortedTiers.findIndex(t => t.name === tierName);
    if (currentTierIndex >= 0 && currentTierIndex < sortedTiers.length - 1) {
      nextTier = sortedTiers[currentTierIndex + 1];
      progressToNext = {
        current: monthlySales,
        target: nextTier.minSales,
        remaining: Math.max(0, nextTier.minSales - monthlySales),
        percentage: Math.min(100, (monthlySales / nextTier.minSales) * 100)
      };
    }

    // Update CP's tier if changed
    const [cpRows] = await pool.execute(
      "SELECT current_tier FROM community_partners WHERE id = ?",
      [cpId]
    );

    const currentTierInDb = cpRows[0]?.current_tier || "Silver";
    
    if (currentTierInDb !== tierName) {
      // Tier changed - update and log
      await pool.execute(
        `UPDATE community_partners 
         SET current_tier = ?, tier_updated_at = NOW() 
         WHERE id = ?`,
        [tierName, cpId]
      );

      // Log tier change
      await pool.execute(
        `INSERT INTO cp_tier_history 
         (cp_id, previous_tier, new_tier, monthly_sales, year, month)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cpId, currentTierInDb, tierName, monthlySales, year, month]
      );
    }

    return {
      tier: tierName,
      config: currentTierConfig,
      monthlySales,
      nextTier,
      progressToNext
    };
  } catch (error) {
    console.error("Error getting current tier:", error);
    const defaultConfig = getDefaultTierConfig();
    return {
      tier: "Silver",
      config: defaultConfig.Silver,
      monthlySales: 0,
      nextTier: defaultConfig.Gold,
      progressToNext: {
        current: 0,
        target: defaultConfig.Gold.minSales,
        remaining: defaultConfig.Gold.minSales,
        percentage: 0
      }
    };
  }
}

/**
 * Get commission multiplier for a tier
 * @param {string} tierName - Tier name
 * @returns {Promise<number>} Commission multiplier
 */
export async function getCommissionMultiplier(tierName) {
  try {
    const tierConfig = await getTierConfigFromDB();
    return tierConfig[tierName]?.commissionMultiplier || 1.0;
  } catch (error) {
    console.error("Error getting commission multiplier:", error);
    const defaultConfig = getDefaultTierConfig();
    return defaultConfig[tierName]?.commissionMultiplier || 1.0;
  }
}

/**
 * Apply tier-based commission multiplier to a base commission
 * @param {number} baseCommission - Base commission amount
 * @param {string} tierName - Current tier
 * @returns {Promise<number>} Adjusted commission amount
 */
export async function applyTierMultiplier(baseCommission, tierName) {
  const multiplier = await getCommissionMultiplier(tierName);
  return baseCommission * multiplier;
}

/**
 * Get tier configuration
 * @returns {Promise<Object>} Tier configuration object
 */
export async function getTierConfig() {
  return await getTierConfigFromDB();
}

