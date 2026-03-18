import { marketingPool } from "../db/marketingPool.js";

class AdTextModel {
  // Create or update ad text
  static async upsert(adId, textData) {
    const { platform_id, text_type, content } = textData;

    // Check if text already exists
    const checkQuery = `
      SELECT id FROM ad_texts 
      WHERE ad_id = ? AND platform_id = ? AND text_type = ?
    `;

    const [existing] = await marketingPool.execute(checkQuery, [
      adId,
      platform_id,
      text_type,
    ]);

    if (existing.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE ad_texts 
        SET content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      const [result] = await marketingPool.execute(updateQuery, [
        content,
        existing[0].id,
      ]);
      return existing[0].id;
    } else {
      // Create new
      const insertQuery = `
        INSERT INTO ad_texts (ad_id, platform_id, text_type, content)
        VALUES (?, ?, ?, ?)
      `;
      const [result] = await marketingPool.execute(insertQuery, [
        adId,
        platform_id,
        text_type,
        content,
      ]);
      return result.insertId;
    }
  }

  // Get texts by ad ID
  static async getByAdId(adId) {
    const query = `
      SELECT 
        at.*,
        ap.name as platform_name,
        ap.code as platform_code
      FROM ad_texts at
      LEFT JOIN ad_platforms ap ON at.platform_id = ap.id
      WHERE at.ad_id = ?
      ORDER BY at.platform_id, at.text_type
    `;

    try {
      const [rows] = await marketingPool.execute(query, [adId]);
      return rows;
    } catch (error) {
      console.error("Error getting texts by ad ID:", error);
      throw error;
    }
  }

  // Get text by ID
  static async getById(id) {
    const query = `
      SELECT 
        at.*,
        ap.name as platform_name,
        ap.code as platform_code
      FROM ad_texts at
      LEFT JOIN ad_platforms ap ON at.platform_id = ap.id
      WHERE at.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error("Error getting text by ID:", error);
      throw error;
    }
  }

  // Update text by ID
  static async update(id, textData) {
    const { platform_id, text_type, content } = textData;
    const query = `
      UPDATE ad_texts 
      SET platform_id = ?, text_type = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    try {
      const [result] = await marketingPool.execute(query, [
        platform_id,
        text_type,
        content,
        id,
      ]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating text:", error);
      throw error;
    }
  }

  // Delete text
  static async delete(id) {
    const query = "DELETE FROM ad_texts WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting text:", error);
      throw error;
    }
  }

  // Delete texts by ad ID
  static async deleteByAdId(adId) {
    const query = "DELETE FROM ad_texts WHERE ad_id = ?";
    try {
      const [result] = await marketingPool.execute(query, [adId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting texts by ad ID:", error);
      throw error;
    }
  }

  // Bulk upsert texts
  static async bulkUpsert(adId, texts) {
    const results = [];
    for (const text of texts) {
      const id = await this.upsert(adId, text);
      results.push(id);
    }
    return results;
  }
}

export default AdTextModel;

