import { marketingPool } from "../db/marketingPool.js";

class AdPlatformPublishingModel {
  // Convert ISO datetime string to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
  static formatDateTimeForMySQL(datetime) {
    if (!datetime) {
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    
    // If it's already a Date object
    if (datetime instanceof Date) {
      return datetime.toISOString().slice(0, 19).replace('T', ' ');
    }
    
    // If it's an ISO string (e.g., '2025-11-20T08:17:00.000Z')
    if (typeof datetime === 'string') {
      // Remove timezone and milliseconds, replace T with space
      return datetime.replace('T', ' ').slice(0, 19);
    }
    
    // Fallback: try to parse and format
    try {
      const date = new Date(datetime);
      return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch (error) {
      console.error('Error formatting datetime:', error);
      return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  // Create a publishing record
  static async create(publishingData) {
    const {
      ad_id,
      platform_id,
      placement = "feed",
      published_at,
      external_campaign_id,
      external_ad_id,
      link_used,
      budget,
      audience_target,
      notes,
      published_by,
    } = publishingData;

    const query = `
      INSERT INTO ad_platform_publishings (
        ad_id, platform_id, placement, published_at, external_campaign_id,
        external_ad_id, link_used, budget, audience_target, notes, published_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      ad_id,
      platform_id,
      placement,
      this.formatDateTimeForMySQL(published_at),
      external_campaign_id || null,
      external_ad_id || null,
      link_used || null,
      budget || null,
      audience_target || null,
      notes || null,
      published_by,
    ];

    try {
      const [result] = await marketingPool.execute(query, values);
      
      // Update ad status to published if not already
      await marketingPool.execute(
        `UPDATE ads SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [ad_id]
      );

      return result.insertId;
    } catch (error) {
      console.error("Error creating publishing record:", error);
      throw error;
    }
  }

  // Get all publishings with optional filters
  static async getAll(filters = {}) {
    let query = `
      SELECT 
        apt.*,
        a.name as ad_name,
        a.status as ad_status,
        ap.name as platform_name,
        ap.code as platform_code,
        u.name as published_by_name
      FROM ad_platform_publishings apt
      INNER JOIN ads a ON apt.ad_id = a.id
      INNER JOIN ad_platforms ap ON apt.platform_id = ap.id
      LEFT JOIN users u ON apt.published_by = u.id
    `;

    const conditions = [];
    const values = [];

    if (filters.ad_id) {
      conditions.push("apt.ad_id = ?");
      values.push(filters.ad_id);
    }

    if (filters.platform_id) {
      conditions.push("apt.platform_id = ?");
      values.push(filters.platform_id);
    }

    if (filters.placement) {
      conditions.push("apt.placement = ?");
      values.push(filters.placement);
    }

    if (filters.date_from) {
      conditions.push("apt.published_at >= ?");
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push("apt.published_at <= ?");
      values.push(filters.date_to);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY apt.published_at DESC";

    if (filters.limit) {
      query += ` LIMIT ${parseInt(filters.limit)}`;
    }

    if (filters.offset) {
      query += ` OFFSET ${parseInt(filters.offset)}`;
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows;
    } catch (error) {
      console.error("Error getting publishings:", error);
      throw error;
    }
  }

  // Get publishing by ID
  static async getById(id) {
    const query = `
      SELECT 
        apt.*,
        a.name as ad_name,
        a.status as ad_status,
        ap.name as platform_name,
        ap.code as platform_code,
        u.name as published_by_name,
        u.email as published_by_email
      FROM ad_platform_publishings apt
      INNER JOIN ads a ON apt.ad_id = a.id
      INNER JOIN ad_platforms ap ON apt.platform_id = ap.id
      LEFT JOIN users u ON apt.published_by = u.id
      WHERE apt.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting publishing by ID:", error);
      throw error;
    }
  }

  // Get publishings by ad ID
  static async getByAdId(adId) {
    return this.getAll({ ad_id: adId });
  }

  // Update publishing
  static async update(id, updateData) {
    const allowedFields = [
      "platform_id",
      "placement",
      "published_at",
      "external_campaign_id",
      "external_ad_id",
      "link_used",
      "budget",
      "audience_target",
      "notes",
    ];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        // Format datetime if it's the published_at field
        if (key === 'published_at') {
          values.push(this.formatDateTimeForMySQL(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);

    const query = `
      UPDATE ad_platform_publishings 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating publishing:", error);
      throw error;
    }
  }

  // Delete publishing
  static async delete(id) {
    const query = "DELETE FROM ad_platform_publishings WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting publishing:", error);
      throw error;
    }
  }
}

export default AdPlatformPublishingModel;

