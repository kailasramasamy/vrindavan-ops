import { marketingPool } from "../db/marketingPool.js";

class AssetModel {
  // Create a new asset
  static async create(assetData) {
    const {
      filename,
      original_filename,
      file_path,
      file_type,
      mime_type,
      file_size,
      width,
      height,
      duration,
      metadata,
      uploaded_by,
    } = assetData;

    const query = `
      INSERT INTO ad_assets (
        filename, original_filename, file_path, file_type, mime_type,
        file_size, width, height, duration, metadata, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      filename,
      original_filename,
      file_path,
      file_type,
      mime_type || null,
      file_size || null,
      width || null,
      height || null,
      duration || null,
      metadata ? JSON.stringify(metadata) : null,
      uploaded_by,
    ];

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.insertId;
    } catch (error) {
      console.error("Error creating asset:", error);
      throw error;
    }
  }

  // Get all assets with optional filters
  static async getAll(filters = {}) {
    let query = `
      SELECT 
        aa.*,
        u.name as uploaded_by_name,
        COUNT(DISTINCT aam.ad_id) as usage_count
      FROM ad_assets aa
      LEFT JOIN users u ON aa.uploaded_by = u.id
      LEFT JOIN ad_assets_mapping aam ON aa.id = aam.asset_id
    `;

    const conditions = [];
    const values = [];

    if (filters.file_type) {
      conditions.push("aa.file_type = ?");
      values.push(filters.file_type);
    }

    if (filters.search) {
      conditions.push("(aa.filename LIKE ? OR aa.original_filename LIKE ?)");
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY aa.id ORDER BY aa.created_at DESC";

    if (filters.limit) {
      query += ` LIMIT ${parseInt(filters.limit)}`;
    }

    if (filters.offset) {
      query += ` OFFSET ${parseInt(filters.offset)}`;
    }

    try {
      const [rows] = await marketingPool.execute(query, values);
      return rows.map((row) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));
    } catch (error) {
      console.error("Error getting assets:", error);
      throw error;
    }
  }

  // Get asset by ID
  static async getById(id) {
    const query = `
      SELECT 
        aa.*,
        u.name as uploaded_by_name,
        u.email as uploaded_by_email
      FROM ad_assets aa
      LEFT JOIN users u ON aa.uploaded_by = u.id
      WHERE aa.id = ?
    `;

    try {
      const [rows] = await marketingPool.execute(query, [id]);
      if (rows.length === 0) return null;

      const asset = rows[0];
      asset.metadata = asset.metadata ? JSON.parse(asset.metadata) : null;

      // Get usage (which ads use this asset)
      const usageQuery = `
        SELECT 
          a.id,
          a.name,
          a.status,
          aam.is_primary,
          aam.display_order
        FROM ads a
        INNER JOIN ad_assets_mapping aam ON a.id = aam.ad_id
        WHERE aam.asset_id = ?
        ORDER BY a.created_at DESC
      `;

      const [usage] = await marketingPool.execute(usageQuery, [id]);
      asset.usage = usage;

      return asset;
    } catch (error) {
      console.error("Error getting asset by ID:", error);
      throw error;
    }
  }

  // Update asset
  static async update(id, updateData) {
    const allowedFields = [
      "filename",
      "original_filename",
      "file_path",
      "width",
      "height",
      "duration",
      "metadata",
    ];

    const updateFields = [];
    const values = [];

    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        if (key === "metadata") {
          values.push(
            updateData[key] ? JSON.stringify(updateData[key]) : null
          );
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
      UPDATE ad_assets 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    try {
      const [result] = await marketingPool.execute(query, values);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error updating asset:", error);
      throw error;
    }
  }

  // Delete asset
  static async delete(id) {
    const query = "DELETE FROM ad_assets WHERE id = ?";
    try {
      const [result] = await marketingPool.execute(query, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting asset:", error);
      throw error;
    }
  }

  // Get assets by ad ID
  static async getByAdId(adId) {
    const query = `
      SELECT 
        aa.*,
        aam.display_order,
        aam.is_primary
      FROM ad_assets aa
      INNER JOIN ad_assets_mapping aam ON aa.id = aam.asset_id
      WHERE aam.ad_id = ?
      ORDER BY aam.display_order ASC, aam.is_primary DESC
    `;

    try {
      const [rows] = await marketingPool.execute(query, [adId]);
      return rows.map((row) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));
    } catch (error) {
      console.error("Error getting assets by ad ID:", error);
      throw error;
    }
  }
}

export default AssetModel;

