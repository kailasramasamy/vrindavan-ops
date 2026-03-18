import AdModel from "../../../models/AdModel.js";
import AssetModel from "../../../models/AssetModel.js";
import AdTextModel from "../../../models/AdTextModel.js";
import AdPlatformPublishingModel from "../../../models/AdPlatformPublishingModel.js";
import PlatformModel from "../../../models/PlatformModel.js";
import { marketingPool } from "../../../db/marketingPool.js";
import fs from "fs/promises";
import path from "path";

// Helper function to get image dimensions (optional, requires image-size package)
async function getImageDimensions(filePath) {
  try {
    const imageSizeModule = await import("image-size");
    const sizeOf = imageSizeModule.default || imageSizeModule.sizeOf;
    const dimensions = sizeOf(filePath);
    return { width: dimensions.width, height: dimensions.height };
  } catch (err) {
    // image-size not available or error reading file
    return { width: null, height: null };
  }
}

// Get video duration using ffprobe (optional, requires ffmpeg)
// For now, we'll skip video duration extraction as it requires additional dependencies

// Ad Management Controllers
export const adController = {
  // Get all ads
  getAll: async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        approval_status: req.query.approval_status,
        campaign_id: req.query.campaign_id,
        platform_id: req.query.platform_id,
        search: req.query.search,
        limit: req.query.limit,
        offset: req.query.offset,
      };

      const ads = await AdModel.getAll(filters);
      res.json({ success: true, data: ads });
    } catch (error) {
      console.error("Error getting ads:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get ad by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const ad = await AdModel.getFullDetails(id);

      if (!ad) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true, data: ad });
    } catch (error) {
      console.error("Error getting ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Create ad
  create: async (req, res) => {
    try {
      const { name, description, campaign_id, status } = req.body;

      if (!name) {
        return res
          .status(400)
          .json({ success: false, error: "Ad name is required" });
      }

      const adId = await AdModel.create({
        name,
        description,
        campaign_id: campaign_id || null,
        status: status || "draft",
        created_by: req.user.id,
      });

      res.json({ success: true, data: { id: adId } });
    } catch (error) {
      console.error("Error creating ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Update ad
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const updated = await AdModel.update(id, updateData);

      if (!updated) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true, data: { id } });
    } catch (error) {
      console.error("Error updating ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Delete ad
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AdModel.delete(id);

      if (!deleted) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Submit for review
  submitForReview: async (req, res) => {
    try {
      const { id } = req.params;
      const submitted = await AdModel.submitForReview(id);

      if (!submitted) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error submitting ad for review:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Approve ad
  approve: async (req, res) => {
    try {
      const { id } = req.params;
      const approved = await AdModel.approve(id, req.user.id);

      if (!approved) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error approving ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Reject ad
  reject: async (req, res) => {
    try {
      const { id } = req.params;
      const { rejection_reason } = req.body;

      if (!rejection_reason) {
        return res
          .status(400)
          .json({ success: false, error: "Rejection reason is required" });
      }

      const rejected = await AdModel.reject(id, rejection_reason, req.user.id);

      if (!rejected) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error rejecting ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Archive ad
  archive: async (req, res) => {
    try {
      const { id } = req.params;
      const archived = await AdModel.archive(id);

      if (!archived) {
        return res.status(404).json({ success: false, error: "Ad not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get statistics
  getStatistics: async (req, res) => {
    try {
      const filters = {
        campaign_id: req.query.campaign_id,
      };
      const stats = await AdModel.getStatistics(filters);
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error("Error getting ad statistics:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

// Asset Management Controllers
export const assetController = {
  // Upload assets
  upload: async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No files uploaded" });
      }

      const uploadedAssets = [];

      for (const file of req.files) {
        // Determine file type
        const isImage = file.mimetype.startsWith("image/");
        const isVideo = file.mimetype.startsWith("video/");
        const fileType = isImage ? "image" : isVideo ? "video" : null;

        if (!fileType) {
          continue; // Skip unsupported files
        }

        // Get file dimensions for images
        let width = null;
        let height = null;
        let duration = null;

        if (isImage) {
          try {
            const dimensions = await getImageDimensions(file.path);
            width = dimensions.width;
            height = dimensions.height;
          } catch (dimError) {
            console.warn(`Could not get dimensions for ${file.originalname}:`, dimError.message);
            // Continue without dimensions
          }
        }

        // For videos, duration extraction would require ffmpeg/ffprobe
        // Skipping for now

        const assetId = await AssetModel.create({
          filename: file.filename,
          original_filename: file.originalname,
          file_path: `/uploads/ad-assets/${file.filename}`,
          file_type: fileType,
          mime_type: file.mimetype,
          file_size: file.size,
          width,
          height,
          duration,
          metadata: null,
          uploaded_by: req.user.id,
        });

        uploadedAssets.push({
          id: assetId,
          filename: file.filename,
          original_filename: file.originalname,
          file_path: `/uploads/ad-assets/${file.filename}`,
          file_type: fileType,
          width,
          height,
        });
      }

      if (uploadedAssets.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid files were uploaded. Please upload image or video files only.",
        });
      }

      res.json({ success: true, data: uploadedAssets });
    } catch (error) {
      console.error("Error uploading assets:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to upload assets. Please try again." 
      });
    }
  },

  // Get all assets
  getAll: async (req, res) => {
    try {
      const filters = {
        file_type: req.query.file_type,
        search: req.query.search,
        limit: req.query.limit,
        offset: req.query.offset,
      };

      const assets = await AssetModel.getAll(filters);
      res.json({ success: true, data: assets });
    } catch (error) {
      console.error("Error getting assets:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get asset by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const asset = await AssetModel.getById(id);

      if (!asset) {
        return res
          .status(404)
          .json({ success: false, error: "Asset not found" });
      }

      res.json({ success: true, data: asset });
    } catch (error) {
      console.error("Error getting asset:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Delete asset
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      // Get asset to delete file
      const asset = await AssetModel.getById(id);
      if (!asset) {
        return res
          .status(404)
          .json({ success: false, error: "Asset not found" });
      }

      // Delete file from filesystem
      try {
        const filePath = path.join(process.cwd(), "public", asset.file_path);
        await fs.unlink(filePath);
      } catch (err) {
        console.error("Error deleting file:", err);
        // Continue with database deletion even if file deletion fails
      }

      // Delete from database
      const deleted = await AssetModel.delete(id);

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: "Asset not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting asset:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

// Ad-Asset Mapping Controllers
export const adAssetMappingController = {
  // Add assets to ad
  addAssets: async (req, res) => {
    try {
      const { ad_id } = req.params;
      const { asset_ids, display_orders, primary_asset_id, replace_existing = false } = req.body;

      if (!asset_ids || !Array.isArray(asset_ids) || asset_ids.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "Asset IDs are required" });
      }

      // Get existing asset IDs if not replacing
      let existingAssetIds = [];
      if (!replace_existing) {
        const [existing] = await marketingPool.execute(
          "SELECT asset_id FROM ad_assets_mapping WHERE ad_id = ?",
          [ad_id]
        );
        existingAssetIds = existing.map(row => row.asset_id);
      }

      // Filter out assets that already exist (to avoid duplicates)
      const newAssetIds = asset_ids.filter(id => !existingAssetIds.includes(id));

      if (newAssetIds.length === 0 && !replace_existing) {
        return res.json({ 
          success: true, 
          message: "All selected assets are already assigned to this ad" 
        });
      }

      // Remove existing mappings only if replace_existing is true
      if (replace_existing) {
        await marketingPool.execute(
          "DELETE FROM ad_assets_mapping WHERE ad_id = ?",
          [ad_id]
        );
      }

      // Get current max display order if appending
      let currentMaxOrder = 0;
      if (!replace_existing && existingAssetIds.length > 0) {
        const [maxOrder] = await marketingPool.execute(
          "SELECT MAX(display_order) as max_order FROM ad_assets_mapping WHERE ad_id = ?",
          [ad_id]
        );
        currentMaxOrder = (maxOrder[0]?.max_order ?? -1) + 1;
      }

      // Add new mappings
      const assetsToAdd = replace_existing ? asset_ids : newAssetIds;
      for (let i = 0; i < assetsToAdd.length; i++) {
        const assetId = assetsToAdd[i];
        const displayOrder = display_orders?.[i] !== undefined 
          ? display_orders[i] 
          : (replace_existing ? i : currentMaxOrder + i);
        const isPrimary = primary_asset_id === assetId ? 1 : 0;

        // Check if this asset is already mapped (when appending)
        if (!replace_existing) {
          const [existing] = await marketingPool.execute(
            "SELECT id FROM ad_assets_mapping WHERE ad_id = ? AND asset_id = ?",
            [ad_id, assetId]
          );
          if (existing.length > 0) {
            continue; // Skip if already exists
          }
        }

        await marketingPool.execute(
          `INSERT INTO ad_assets_mapping (ad_id, asset_id, display_order, is_primary)
           VALUES (?, ?, ?, ?)`,
          [ad_id, assetId, displayOrder, isPrimary]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error adding assets to ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Remove asset from ad
  removeAsset: async (req, res) => {
    try {
      const { ad_id, asset_id } = req.params;

      await marketingPool.execute(
        "DELETE FROM ad_assets_mapping WHERE ad_id = ? AND asset_id = ?",
        [ad_id, asset_id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing asset from ad:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

// Ad Text Controllers
export const adTextController = {
  // Save texts for ad
  saveTexts: async (req, res) => {
    try {
      const { ad_id } = req.params;
      const { texts } = req.body;

      if (!texts || !Array.isArray(texts)) {
        return res
          .status(400)
          .json({ success: false, error: "Texts array is required" });
      }

      const results = await AdTextModel.bulkUpsert(ad_id, texts);

      res.json({ success: true, data: { text_ids: results } });
    } catch (error) {
      console.error("Error saving texts:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get texts for ad
  getTexts: async (req, res) => {
    try {
      const { ad_id } = req.params;
      const texts = await AdTextModel.getByAdId(ad_id);

      res.json({ success: true, data: texts });
    } catch (error) {
      console.error("Error getting texts:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Update text
  updateText: async (req, res) => {
    try {
      const { ad_id, id } = req.params;
      const { platform_id, text_type, content } = req.body;

      if (!platform_id || !text_type || !content) {
        return res
          .status(400)
          .json({ success: false, error: "platform_id, text_type, and content are required" });
      }

      const updated = await AdTextModel.update(id, {
        platform_id,
        text_type,
        content,
      });

      if (!updated) {
        return res
          .status(404)
          .json({ success: false, error: "Text not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating text:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Delete text
  deleteText: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AdTextModel.delete(id);

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: "Text not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting text:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

// Publishing Controllers
export const publishingController = {
  // Create publishing record
  create: async (req, res) => {
    try {
      const {
        ad_id,
        platform_id,
        placement,
        published_at,
        external_campaign_id,
        external_ad_id,
        link_used,
        budget,
        audience_target,
        notes,
      } = req.body;

      if (!ad_id || !platform_id || !published_at) {
        return res.status(400).json({
          success: false,
          error: "ad_id, platform_id, and published_at are required",
        });
      }

      const publishingId = await AdPlatformPublishingModel.create({
        ad_id,
        platform_id,
        placement: placement || "feed",
        published_at,
        external_campaign_id,
        external_ad_id,
        link_used,
        budget,
        audience_target,
        notes,
        published_by: req.user.id,
      });

      res.json({ success: true, data: { id: publishingId } });
    } catch (error) {
      console.error("Error creating publishing record:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get all publishings
  getAll: async (req, res) => {
    try {
      const filters = {
        ad_id: req.query.ad_id,
        platform_id: req.query.platform_id,
        placement: req.query.placement,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        limit: req.query.limit,
        offset: req.query.offset,
      };

      const publishings = await AdPlatformPublishingModel.getAll(filters);
      res.json({ success: true, data: publishings });
    } catch (error) {
      console.error("Error getting publishings:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get publishing by ID
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const publishing = await AdPlatformPublishingModel.getById(id);

      if (!publishing) {
        return res
          .status(404)
          .json({ success: false, error: "Publishing not found" });
      }

      res.json({ success: true, data: publishing });
    } catch (error) {
      console.error("Error getting publishing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Update publishing
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const updated = await AdPlatformPublishingModel.update(id, updateData);

      if (!updated) {
        return res
          .status(404)
          .json({ success: false, error: "Publishing not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating publishing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Delete publishing
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await AdPlatformPublishingModel.delete(id);

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: "Publishing not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting publishing:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

// Platform Controllers
export const platformController = {
  // Get all platforms
  getAll: async (req, res) => {
    try {
      const filters = {
        is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      };

      const platforms = await PlatformModel.getAll(filters);
      res.json({ success: true, data: platforms });
    } catch (error) {
      console.error("Error getting platforms:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
};

