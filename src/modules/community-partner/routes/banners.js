import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";
import bannerUpload from "../../../middleware/bannerUpload.js";
import { stageCopyPool } from "../../../db/pool.js";

const router = express.Router();

// Helpers
const normalizeField = (value) => {
  if (Array.isArray(value)) {
    const pick = value.find((v) => String(v || "").trim());
    return pick ? String(pick) : null;
  }
  return value !== undefined && value !== null && String(value).trim() !== "" ? String(value) : null;
};

// Get all banners (Admin) or active banners (CP)
router.get("/", authenticate, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const [banners] = await pool.execute(
        "SELECT * FROM cp_banners ORDER BY position ASC, created_at DESC"
      );
      return res.json(banners);
    }

    // For CP: get active banners only
    const [banners] = await pool.execute(
      `SELECT * FROM cp_banners 
       WHERE is_active = TRUE 
       ORDER BY position ASC, created_at DESC`
    );

    res.json(banners);
  } catch (error) {
    console.error("Get banners error:", error);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

// Get single banner
router.get("/:id", authenticate, async (req, res) => {
  try {
    const [banners] = await pool.execute("SELECT * FROM cp_banners WHERE id = ?", [req.params.id]);

    if (!banners.length) {
      return res.status(404).json({ error: "Banner not found" });
    }

    const banner = banners[0];

    const normalizeMaybeArrayString = (value) => {
      if (Array.isArray(value)) {
        const pick = value.find((v) => String(v || "").trim());
        return pick ? String(pick) : null;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              const pick = parsed.find((v) => String(v || "").trim());
              return pick ? String(pick) : null;
            }
          } catch {
            // ignore
          }
        }
        return value;
      }
      return value ?? null;
    };

    banner.target_title = normalizeMaybeArrayString(banner.target_title);
    banner.target_description = normalizeMaybeArrayString(banner.target_description);

    // If banner target is product_listing, fetch product details
    if (banner.banner_target === 'product_listing' && banner.target_products && stageCopyPool) {
      try {
        let productIds = [];
        if (typeof banner.target_products === 'string') {
          productIds = JSON.parse(banner.target_products);
        } else if (Array.isArray(banner.target_products)) {
          productIds = banner.target_products;
        }

        if (productIds.length > 0) {
          // Batch process in chunks to avoid packet size issues
          const batchSize = 100;
          const allProducts = [];
          const baseImagePath = 'https://media-image-upload.s3.ap-south-1.amazonaws.com/foods';

          for (let i = 0; i < productIds.length; i += batchSize) {
            const batch = productIds.slice(i, i + batchSize);
            const placeholders = batch.map(() => '?').join(',');

            const [products] = await stageCopyPool.execute(
              `SELECT f.id, f.name, f.unit, f.price, f.discount_price,
               (SELECT m.file_name FROM media m 
                WHERE m.model_id = f.id AND m.model_type = 'App\\\\Models\\\\Food'
                ORDER BY m.order_column ASC, m.id ASC LIMIT 1) as image_file
               FROM foods f
               WHERE f.id IN (${placeholders}) AND f.status = '1'`,
              batch
            );

            // Add image URL to products
            products.forEach(product => {
              if (product.image_file) {
                product.image_url = `${baseImagePath}/${product.image_file}`;
              }
              allProducts.push(product);
            });
          }

          banner.products = allProducts;
        }
      } catch (error) {
        console.error("Error fetching product details:", error);
        banner.products = [];
      }
    }

    res.json(banner);
  } catch (error) {
    console.error("Get banner error:", error);
    res.status(500).json({ error: "Failed to fetch banner" });
  }
});

// Create banner (Admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  bannerUpload.single("file"),
  [
    body("title").notEmpty().trim(),
    body("banner_type").isIn(["text", "image", "video", "document"]),
    body("banner_target").custom((value, { req }) => {
      // Video/Document banners don't require a target (we handle them separately in CP UI).
      if (req.body?.banner_type === "video" || req.body?.banner_type === "document") return true;
      return ["content", "open_link", "product_listing", "category_listing"].includes(value);
    }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        title,
        position,
        banner_type,
        banner_target,
        target_title,
        target_description,
        // Text type fields
        text_title,
        text_subtitle,
        text_description,
        theme_color,
        main_icon,
        // Image/Video/Document fields
        video_link,
        // Target fields
        content_title,
        content_subtitle,
        content_details,
        content_button_text,
        content_button_link,
        open_link_url,
        target_products,
        target_categories,
        is_active,
      } = req.body;

      // normalizeField is defined at module level

      // Convert is_active to boolean (checkbox sends "on" when checked, undefined/null when unchecked)
      const isActive = is_active === "on" || is_active === true || is_active === "true";

      // Handle file upload
      let file_url = null;
      if (req.file) {
        file_url = `/uploads/banners/${req.file.mimetype.startsWith("image/") ? "images" : "documents"}/${req.file.filename}`;
      }

      // Validate banner type specific fields
      if (banner_type === "text") {
        if (!text_title) {
          return res.status(400).json({ error: "Text title is required for text banners" });
        }
      } else if (banner_type === "image") {
        if (!file_url) {
          return res.status(400).json({ error: "Image file is required for image banners" });
        }
      } else if (banner_type === "video") {
        if (!video_link) {
          return res.status(400).json({ error: "Video link is required for video banners" });
        }
      } else if (banner_type === "document") {
        if (!file_url) {
          return res.status(400).json({ error: "Document file is required for document banners" });
        }
      }

      // For video banners, target is irrelevant. Store a safe default and skip target validation.
      const effectiveTarget = (banner_type === "video" || banner_type === "document") ? "open_link" : banner_target;

      // Validate target specific fields (non-video)
      if (banner_type !== "video" && banner_type !== "document") {
        if (effectiveTarget === "content") {
          if (!content_title || !content_button_text || !content_button_link) {
            return res.status(400).json({ error: "Content title, button text, and button link are required for content target" });
          }
        } else if (effectiveTarget === "open_link") {
          if (!open_link_url) {
            return res.status(400).json({ error: "Link URL is required for open link target" });
          }
        } else if (effectiveTarget === "product_listing") {
          if (!target_products || (Array.isArray(target_products) && target_products.length === 0)) {
            return res.status(400).json({ error: "At least one product is required for product listing target" });
          }
        } else if (effectiveTarget === "category_listing") {
          if (!target_categories || (Array.isArray(target_categories) && target_categories.length === 0)) {
            return res.status(400).json({ error: "At least one category is required for category listing target" });
          }
        }
      }

      // For document banners, auto-set open_link_url to the uploaded file
      const effectiveOpenLinkUrl =
        banner_type === "document" ? (open_link_url || file_url || null) : (open_link_url || null);

      const [result] = await pool.execute(
        `INSERT INTO cp_banners 
         (title, position, banner_type, banner_target, target_title, target_description, text_title, text_subtitle, text_description, 
          theme_color, main_icon, file_url, video_link, content_title, content_subtitle, content_details, 
          content_button_text, content_button_link, open_link_url, target_products, target_categories, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          position || 0,
          banner_type,
          effectiveTarget,
          normalizeField(target_title),
          normalizeField(target_description),
          text_title || null,
          text_subtitle || null,
          text_description || null,
          theme_color || null,
          main_icon || null,
          file_url,
          video_link || null,
          content_title || null,
          content_subtitle || null,
          content_details || null,
          content_button_text || null,
          content_button_link || null,
          effectiveOpenLinkUrl,
          target_products ? JSON.stringify(Array.isArray(target_products) ? target_products : JSON.parse(target_products)) : null,
          target_categories ? JSON.stringify(Array.isArray(target_categories) ? target_categories : JSON.parse(target_categories)) : null,
          isActive,
        ]
      );

      await auditLog(req, "CREATE_BANNER", "banner", result.insertId, null, req.body);

      const [banner] = await pool.execute("SELECT * FROM cp_banners WHERE id = ?", [result.insertId]);
      res.status(201).json(banner[0]);
    } catch (error) {
      console.error("Create banner error:", error);
      res.status(500).json({ error: "Failed to create banner" });
    }
  }
);

// Update banner (Admin only)
router.put(
  "/:id",
  authenticate,
  requireAdmin,
  bannerUpload.single("file"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const [existing] = await pool.execute("SELECT * FROM cp_banners WHERE id = ?", [id]);

      if (!existing.length) {
        return res.status(404).json({ error: "Banner not found" });
      }

      const {
        title,
        position,
        banner_type,
        banner_target,
        target_title,
        target_description,
        text_title,
        text_subtitle,
        text_description,
        theme_color,
        main_icon,
        video_link,
        content_title,
        content_subtitle,
        content_details,
        content_button_text,
        content_button_link,
        open_link_url,
        target_products,
        target_categories,
        is_active,
      } = req.body;

      const nextBannerType = banner_type || existing[0].banner_type;
      const nextBannerTarget =
        (nextBannerType === "video" || nextBannerType === "document")
          ? "open_link"
          : (banner_target || existing[0].banner_target);

      // Handle file upload - only update if new file is provided
      let file_url = existing[0].file_url;
      if (req.file) {
        file_url = `/uploads/banners/${req.file.mimetype.startsWith("image/") ? "images" : "documents"}/${req.file.filename}`;
      }

      // Convert is_active to boolean (checkbox sends "on" when checked, undefined when unchecked)
      let isActive = existing[0].is_active;
      if (is_active !== undefined) {
        isActive = is_active === "on" || is_active === true || is_active === "true";
      }

      // For document banners, ensure open_link_url points to the uploaded file
      const nextOpenLinkUrl =
        nextBannerType === "document"
          ? (open_link_url !== undefined ? open_link_url : (file_url || existing[0].open_link_url))
          : (open_link_url !== undefined ? open_link_url : existing[0].open_link_url);

      await pool.execute(
        `UPDATE cp_banners 
         SET title = ?, position = ?, banner_type = ?, banner_target = ?, 
             target_title = ?, target_description = ?,
             text_title = ?, text_subtitle = ?, text_description = ?, 
             theme_color = ?, main_icon = ?, file_url = ?, video_link = ?, 
             content_title = ?, content_subtitle = ?, content_details = ?, 
             content_button_text = ?, content_button_link = ?, open_link_url = ?, 
             target_products = ?, target_categories = ?, is_active = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          title || existing[0].title,
          position !== undefined ? position : existing[0].position,
          nextBannerType,
          nextBannerTarget,
          target_title !== undefined ? normalizeField(target_title) : existing[0].target_title,
          target_description !== undefined ? normalizeField(target_description) : existing[0].target_description,
          text_title !== undefined ? text_title : existing[0].text_title,
          text_subtitle !== undefined ? text_subtitle : existing[0].text_subtitle,
          text_description !== undefined ? text_description : existing[0].text_description,
          theme_color !== undefined ? theme_color : existing[0].theme_color,
          main_icon !== undefined ? main_icon : existing[0].main_icon,
          file_url,
          video_link !== undefined ? video_link : existing[0].video_link,
          content_title !== undefined ? content_title : existing[0].content_title,
          content_subtitle !== undefined ? content_subtitle : existing[0].content_subtitle,
          content_details !== undefined ? content_details : existing[0].content_details,
          content_button_text !== undefined ? content_button_text : existing[0].content_button_text,
          content_button_link !== undefined ? content_button_link : existing[0].content_button_link,
          nextOpenLinkUrl,
          target_products ? JSON.stringify(Array.isArray(target_products) ? target_products : JSON.parse(target_products)) : existing[0].target_products,
          target_categories ? JSON.stringify(Array.isArray(target_categories) ? target_categories : JSON.parse(target_categories)) : existing[0].target_categories,
          isActive,
          id,
        ]
      );

      await auditLog(req, "UPDATE_BANNER", "banner", id, existing[0], req.body);

      const [banner] = await pool.execute("SELECT * FROM cp_banners WHERE id = ?", [id]);
      res.json(banner[0]);
    } catch (error) {
      console.error("Update banner error:", error);
      res.status(500).json({ error: "Failed to update banner" });
    }
  }
);

// Delete banner (Admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute("SELECT * FROM cp_banners WHERE id = ?", [id]);

    if (!existing.length) {
      return res.status(404).json({ error: "Banner not found" });
    }

    await pool.execute("DELETE FROM cp_banners WHERE id = ?", [id]);
    await auditLog(req, "DELETE_BANNER", "banner", id, existing[0], null);

    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Delete banner error:", error);
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

// Get products for product listing (Admin only)
router.get("/products/list", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!stageCopyPool) {
      return res.status(500).json({ error: "Database connection not available" });
    }

    const [products] = await stageCopyPool.execute(
      "SELECT id, name, unit, category_id, subcategory_id FROM foods WHERE status = '1' ORDER BY name ASC"
    );

    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Get categories for category listing (Admin only)
router.get("/categories/list", authenticate, requireAdmin, async (req, res) => {
  try {
    if (!stageCopyPool) {
      return res.status(500).json({ error: "Database connection not available" });
    }

    const [categories] = await stageCopyPool.execute(
      "SELECT id, name FROM categories ORDER BY name ASC"
    );

    res.json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export default router;

