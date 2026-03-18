import { marketingPool } from "../db/marketingPool.js";

class AdModel {
  // Create a new ad
  static async create(adData) {
    const {
      name,
      description,
      campaign_id,
      status = "draft",
      approval_status = "pending",
      created_by,
    } = adData;

    const query = `
      INSERT INTO ads (
        name, description, campaign_id, status, approval_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name || null,
      description || null,
      campaign_id || null,
      status,
      approval_status,
      created_by,
    ];

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Error creating ad:", error);
      throw error;
    }
  }

  // Get all ads with optional filters
  static async getAll(filters = {}) {
    let query = `
      SELECT 
        a.*,
        c.name as campaign_name,
        u.name as created_by_name,
        u.email as created_by_email,
        approver.name as approved_by_name,
        COUNT(DISTINCT aam.asset_id) as asset_count,
        COUNT(DISTINCT apt.id) as publishing_count
      FROM ads a
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN users approver ON a.approved_by = approver.id
      LEFT JOIN ad_assets_mapping aam ON a.id = aam.ad_id
      LEFT JOIN ad_platform_publishings apt ON a.id = apt.ad_id
    `;

    const conditions = [];
    const values = [];

    if (filters.status) {
      conditions.push("a.status = ?");
      values.push(filters.status);
    }

    if (filters.approval_status) {
      conditions.push("a.approval_status = ?");
      values.push(filters.approval_status);
    }

    if (filters.campaign_id) {
      conditions.push("a.campaign_id = ?");
      values.push(filters.campaign_id);
    }

    if (filters.platform_id) {
      conditions.push("EXISTS (SELECT 1 FROM ad_platform_publishings apt WHERE apt.ad_id = a.id AND apt.platform_id = ?)");
      values.push(filters.platform_id);
    }

    if (filters.search) {
      conditions.push("(a.name LIKE ? OR a.description LIKE ?)");
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY a.id ORDER BY a.created_at DESC";

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
      console.error("Error getting ads:", error);
      throw error;
    }
  }

  // Get ad by ID with full details
  static async getById(id) {
    const query = `
      SELECT 
        a.*,
        c.name as campaign_name,
        u.name as created_by_name,
        u.email as created_by_email,
        approver.name as approved_by_name,
        approver.email as approved_by_email
      FROM ads a
      LEFT JOIN campaigns c ON a.campaign_id = c.id
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN users approver ON a.approved_by = approver.id
      WHERE a.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      if (rows.length === 0) return null;
      return rows[0];
    } catch (error) {
      console.error("Error getting ad by ID:", error);
      throw error;
    }
  }

  // Get ad with assets
  static async getWithAssets(id) {
    const ad = await this.getById(id);
    if (!ad) return null;

    const assetsQuery = `
      SELECT 
        aa.*,
        aam.display_order,
        aam.is_primary
      FROM ad_assets aa
      INNER JOIN ad_assets_mapping aam ON aa.id = aam.asset_id
      WHERE aam.ad_id = ?
      ORDER BY aam.display_order ASC, aam.is_primary DESC
    `;

    const [assets] = await marketingPool.execute(assetsQuery, [id]);
    ad.assets = assets;

    return ad;
  }

  // Get ad with texts
  static async getWithTexts(id) {
    const ad = await this.getById(id);
    if (!ad) return null;

    const textsQuery = `
      SELECT 
        at.*,
        ap.name as platform_name,
        ap.code as platform_code
      FROM ad_texts at
      LEFT JOIN ad_platforms ap ON at.platform_id = ap.id
      WHERE at.ad_id = ?
      ORDER BY at.platform_id, at.text_type
    `;

    const [texts] = await marketingPool.execute(textsQuery, [id]);
    ad.texts = texts;

    return ad;
  }

  // Get ad with all related data
  static async getFullDetails(id) {
    const ad = await this.getWithAssets(id);
    if (!ad) return null;

    const textsQuery = `
      SELECT 
        at.*,
        ap.name as platform_name,
        ap.code as platform_code
      FROM ad_texts at
      LEFT JOIN ad_platforms ap ON at.platform_id = ap.id
      WHERE at.ad_id = ?
      ORDER BY at.platform_id, at.text_type
    `;

    const publishingsQuery = `
      SELECT 
        apt.*,
        ap.name as platform_name,
        ap.code as platform_code,
        u.name as published_by_name
      FROM ad_platform_publishings apt
      INNER JOIN ad_platforms ap ON apt.platform_id = ap.id
      LEFT JOIN users u ON apt.published_by = u.id
      WHERE apt.ad_id = ?
      ORDER BY apt.published_at DESC
    `;

    const [texts] = await marketingPool.execute(textsQuery, [id]);
    const [publishings] = await marketingPool.execute(publishingsQuery, [id]);

    ad.texts = texts;
    ad.publishings = publishings;

    return ad;
  }

  // Update ad
  static async update(id, updateData) {
    const allowedFields = [
      "name",
      "description",
      "campaign_id",
      "status",
      "approval_status",
      "rejection_reason",
    ];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(id);

    const query = `
      UPDATE ads 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating ad:", error);
      throw error;
    }
  }

  // Approve ad
  static async approve(id, approved_by) {
    const query = `
      UPDATE ads 
      SET 
        approval_status = 'approved',
        status = 'approved',
        approved_by = ?,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, [approved_by, id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error approving ad:", error);
      throw error;
    }
  }

  // Reject ad
  static async reject(id, rejection_reason, rejected_by) {
    const query = `
      UPDATE ads 
      SET 
        approval_status = 'rejected',
        status = 'draft',
        rejection_reason = ?,
        approved_by = ?,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, [
        rejection_reason,
        rejected_by,
        id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error rejecting ad:", error);
      throw error;
    }
  }

  // Submit for review
  static async submitForReview(id) {
    const query = `
      UPDATE ads 
      SET 
        status = 'in_review',
        approval_status = 'pending',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error submitting ad for review:", error);
      throw error;
    }
  }

  // Delete ad
  static async delete(id) {
    const query = "DELETE FROM ads WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting ad:", error);
      throw error;
    }
  }

  // Archive ad
  static async archive(id) {
    const query = `
      UPDATE ads 
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error archiving ad:", error);
      throw error;
    }
  }

  // Get statistics
  static async getStatistics(filters = {}) {
    let query = `
      SELECT 
        COUNT(*) as total_ads,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_ads,
        COUNT(CASE WHEN status = 'in_review' THEN 1 END) as in_review_ads,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_ads,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as published_ads,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_ads,
        COUNT(CASE WHEN approval_status = 'pending' THEN 1 END) as pending_approval_ads
      FROM ads
    `;

    const conditions = [];
    const values = [];

    if (filters.campaign_id) {
      conditions.push("campaign_id = ?");
      values.push(filters.campaign_id);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows[0];
    } catch (error) {
      console.error("Error getting ad statistics:", error);
      throw error;
    }
  }
}

export default AdModel;

