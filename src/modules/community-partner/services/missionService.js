import pool from "../../../db/pool.js";
import { analyticsPool } from "../../../db/pool.js";

/**
 * Get current active mission for a CP
 */
export async function getCurrentMission(cpId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const [missions] = await pool.execute(
      `SELECT * FROM cp_missions 
       WHERE is_active = TRUE 
       AND start_date <= ? 
       AND end_date >= ?
       ORDER BY start_date DESC
       LIMIT 1`,
      [today, today]
    );
    
    if (missions.length === 0) {
      return null;
    }
    
    const mission = missions[0];
    
    // Get progress for this CP
    const [progress] = await pool.execute(
      `SELECT * FROM cp_mission_progress 
       WHERE mission_id = ? AND cp_id = ?`,
      [mission.id, cpId]
    );
    
    let missionProgress = progress[0];
    
    // If no progress record exists, create one
    if (!missionProgress) {
      await pool.execute(
        `INSERT INTO cp_mission_progress (mission_id, cp_id, current_value, is_completed)
         VALUES (?, ?, 0, FALSE)`,
        [mission.id, cpId]
      );
      
      const [newProgress] = await pool.execute(
        `SELECT * FROM cp_mission_progress 
         WHERE mission_id = ? AND cp_id = ?`,
        [mission.id, cpId]
      );
      missionProgress = newProgress[0];
    }
    
    // Calculate current progress based on mission type
    const currentValue = await calculateMissionProgress(mission, cpId);
    
    // Update progress if it changed
    if (currentValue !== missionProgress.current_value) {
      const isCompleted = currentValue >= mission.target_value;
      
      await pool.execute(
        `UPDATE cp_mission_progress 
         SET current_value = ?, 
             is_completed = ?,
             completed_at = CASE WHEN ? AND completed_at IS NULL THEN NOW() ELSE completed_at END
         WHERE id = ?`,
        [currentValue, isCompleted, isCompleted, missionProgress.id]
      );
      
      missionProgress.current_value = currentValue;
      missionProgress.is_completed = isCompleted;
      
      // If mission just completed, award bonus (if not already awarded)
      if (isCompleted && !missionProgress.bonus_awarded) {
        await awardMissionBonus(mission.id, cpId, mission.bonus_amount);
      }
    }
    
    return {
      ...mission,
      progress: missionProgress,
      progressPercentage: Math.min(100, Math.round((currentValue / mission.target_value) * 100))
    };
  } catch (error) {
    console.error("Error getting current mission:", error);
    return null;
  }
}

/**
 * Calculate mission progress based on mission type
 */
async function calculateMissionProgress(mission, cpId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = mission.start_date;
    const endDate = mission.end_date;
    
    switch (mission.mission_type) {
      case 'new_customers':
      case 'customer_activation':
        // Count new active customers in the mission period
        // This counts customers who became active during the mission period
        const [activations] = await pool.execute(
          `SELECT COUNT(DISTINCT cma.customer_mapping_id) as count
           FROM cp_mission_activations cma
           WHERE cma.mission_id = ?
           AND cma.cp_id = ?
           AND cma.activation_date BETWEEN ? AND ?
           AND cma.counted = TRUE`,
          [mission.id, cpId, startDate, endDate]
        );
        return activations[0]?.count || 0;
        
      case 'sales_target':
        // Calculate total sales in the mission period
        if (!analyticsPool) return 0;
        
        const [customerMappings] = await pool.execute(
          `SELECT DISTINCT user_id 
           FROM cp_customer_mappings 
           WHERE cp_id = ? 
           AND is_active = TRUE 
           AND user_id IS NOT NULL`,
          [cpId]
        );
        
        if (customerMappings.length === 0) return 0;
        
        const customerUserIds = customerMappings.map(cm => cm.user_id);
        const [sales] = await analyticsPool.execute(
          `SELECT COALESCE(SUM(fo.price * fo.quantity), 0) as total_sales
           FROM orders o
           JOIN food_orders fo ON o.id = fo.order_id
           WHERE o.user_id IN (${customerUserIds.map(() => '?').join(',')})
           AND o.active = 1
           AND DATE(o.order_date) BETWEEN ? AND ?`,
          [...customerUserIds, startDate, endDate]
        );
        
        return Math.round(sales[0]?.total_sales || 0);
        
      case 'order_count':
        // Count orders in the mission period
        if (!analyticsPool) return 0;
        
        const [customerMappings2] = await pool.execute(
          `SELECT DISTINCT user_id 
           FROM cp_customer_mappings 
           WHERE cp_id = ? 
           AND is_active = TRUE 
           AND user_id IS NOT NULL`,
          [cpId]
        );
        
        if (customerMappings2.length === 0) return 0;
        
        const customerUserIds2 = customerMappings2.map(cm => cm.user_id);
        const [orders] = await analyticsPool.execute(
          `SELECT COUNT(*) as order_count
           FROM orders o
           WHERE o.user_id IN (${customerUserIds2.map(() => '?').join(',')})
           AND o.active = 1
           AND DATE(o.order_date) BETWEEN ? AND ?`,
          [...customerUserIds2, startDate, endDate]
        );
        
        return orders[0]?.order_count || 0;
        
      default:
        return 0;
    }
  } catch (error) {
    console.error("Error calculating mission progress:", error);
    return 0;
  }
}

/**
 * Track customer activation for missions
 * This should be called when a customer becomes active (places first order)
 */
export async function trackCustomerActivation(cpId, customerMappingId, activationDate = null) {
  try {
    const today = activationDate || new Date().toISOString().split('T')[0];
    
    // Get all active missions that include this date
    const [activeMissions] = await pool.execute(
      `SELECT * FROM cp_missions 
       WHERE is_active = TRUE 
       AND mission_type IN ('new_customers', 'customer_activation')
       AND start_date <= ? 
       AND end_date >= ?`,
      [today, today]
    );
    
    for (const mission of activeMissions) {
      // Check if this activation was already counted
      const [existing] = await pool.execute(
        `SELECT * FROM cp_mission_activations 
         WHERE mission_id = ? 
         AND cp_id = ? 
         AND customer_mapping_id = ?`,
        [mission.id, cpId, customerMappingId]
      );
      
      if (existing.length === 0) {
        // Record this activation
        await pool.execute(
          `INSERT INTO cp_mission_activations 
           (mission_id, cp_id, customer_mapping_id, activation_date, counted)
           VALUES (?, ?, ?, ?, TRUE)`,
          [mission.id, cpId, customerMappingId, today]
        );
        
        // Update progress
        await updateMissionProgress(mission.id, cpId);
      }
    }
  } catch (error) {
    console.error("Error tracking customer activation:", error);
  }
}

/**
 * Update mission progress for a CP
 */
async function updateMissionProgress(missionId, cpId) {
  try {
    const [mission] = await pool.execute(
      `SELECT * FROM cp_missions WHERE id = ?`,
      [missionId]
    );
    
    if (mission.length === 0) return;
    
    const currentValue = await calculateMissionProgress(mission[0], cpId);
    const isCompleted = currentValue >= mission[0].target_value;
    
    await pool.execute(
      `UPDATE cp_mission_progress 
       SET current_value = ?, 
           is_completed = ?,
           completed_at = CASE WHEN ? AND completed_at IS NULL THEN NOW() ELSE completed_at END
       WHERE mission_id = ? AND cp_id = ?`,
      [currentValue, isCompleted, isCompleted, missionId, cpId]
    );
    
    // If mission just completed, award bonus
    if (isCompleted) {
      const [progress] = await pool.execute(
        `SELECT * FROM cp_mission_progress 
         WHERE mission_id = ? AND cp_id = ?`,
        [missionId, cpId]
      );
      
      if (progress[0] && !progress[0].bonus_awarded) {
        await awardMissionBonus(missionId, cpId, mission[0].bonus_amount);
      }
    }
  } catch (error) {
    console.error("Error updating mission progress:", error);
  }
}

/**
 * Award mission bonus to CP's monthly payout
 * Note: The bonus will be included in the monthly payout calculation
 */
async function awardMissionBonus(missionId, cpId, bonusAmount) {
  try {
    // Mark bonus as awarded in progress
    // The actual bonus amount will be calculated when payouts are synced
    await pool.execute(
      `UPDATE cp_mission_progress 
       SET bonus_awarded = TRUE, bonus_awarded_at = NOW()
       WHERE mission_id = ? AND cp_id = ?`,
      [missionId, cpId]
    );
    
    console.log(`Mission bonus of ₹${bonusAmount} marked as awarded for CP ${cpId} for mission ${missionId}`);
  } catch (error) {
    console.error("Error awarding mission bonus:", error);
  }
}

