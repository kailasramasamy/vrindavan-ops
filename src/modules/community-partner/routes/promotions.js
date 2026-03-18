import express from "express";
import { body, validationResult } from "express-validator";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/auditLog.js";
import promotionUpload from "../../../middleware/promotionUpload.js";
import { createNotificationsForCPs } from "./notifications.js";
import { notifyCPNewPromotion } from "../../../services/interaktService.js";

const router = express.Router();

// Get all promotions (Admin) or applicable promotions (CP)
router.get("/", authenticate, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const [promos] = await pool.execute("SELECT * FROM promotional_materials ORDER BY created_at DESC");
      return res.json(promos);
    }

    // For CP: get promotions applicable to them
    const cpId = req.user.cp_id;
    if (!cpId) {
      return res.json([]);
    }

    // Get CP's localities
    const [localities] = await pool.execute(
      "SELECT locality_id FROM cp_locality_mappings WHERE cp_id = ? AND is_active = TRUE",
      [cpId]
    );
    const localityIds = localities.map((l) => l.locality_id);

    const [promos] = await pool.execute(
      `SELECT * FROM promotional_materials 
       WHERE is_active = TRUE 
       AND (valid_from IS NULL OR valid_from <= CURDATE())
       AND (valid_to IS NULL OR valid_to >= CURDATE())
       AND (
         target_type = 'All' 
         OR (target_type = 'Specific CPs' AND JSON_CONTAINS(target_cp_ids, ?))
         OR (target_type = 'By Locality' AND JSON_OVERLAPS(target_locality_ids, ?))
       )
       ORDER BY created_at DESC`,
      [JSON.stringify([cpId]), JSON.stringify(localityIds)]
    );

    res.json(promos);
  } catch (error) {
    console.error("Get promotions error:", error);
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

// Get single promotion
router.get("/:id", authenticate, async (req, res) => {
  try {
    const [promos] = await pool.execute("SELECT * FROM promotional_materials WHERE id = ?", [req.params.id]);

    if (!promos.length) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    res.json(promos[0]);
  } catch (error) {
    console.error("Get promotion error:", error);
    res.status(500).json({ error: "Failed to fetch promotion" });
  }
});

// Create promotion (Admin only)
router.post(
  "/",
  authenticate,
  requireAdmin,
  [
    body("title").notEmpty().trim(),
    body("target_type").isIn(["All", "Specific CPs", "By Locality"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        title,
        description,
        product_ids,
        image_url,
        whatsapp_caption,
        deep_link_url,
        offer_link,
        valid_from,
        valid_to,
        target_type,
        target_cp_ids,
        target_locality_ids,
        tags,
        is_active = true,
      } = req.body;

      const [result] = await pool.execute(
        `INSERT INTO promotional_materials 
         (title, description, product_ids, image_url, whatsapp_caption, deep_link_url, 
          offer_link, valid_from, valid_to, target_type, target_cp_ids, target_locality_ids, tags, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          description || null,
          product_ids ? JSON.stringify(product_ids) : null,
          image_url || null,
          whatsapp_caption || null,
          deep_link_url || null,
          offer_link || null,
          valid_from || null,
          valid_to || null,
          target_type,
          target_cp_ids ? JSON.stringify(target_cp_ids) : null,
          target_locality_ids ? JSON.stringify(target_locality_ids) : null,
          tags ? JSON.stringify(tags) : null,
          is_active,
        ]
      );

      await auditLog(req, "CREATE_PROMOTION", "promotion", result.insertId, null, req.body);

      const [promo] = await pool.execute("SELECT * FROM promotional_materials WHERE id = ?", [result.insertId]);
      const promotion = promo[0];

      // Create notifications for applicable CPs
      if (is_active && promotion) {
        try {
          let cpIds = [];

          if (target_type === "All") {
            // Get all active CPs (Active or Pending status - exclude On Hold and Terminated)
            const [allCPs] = await pool.execute(
              "SELECT id FROM community_partners WHERE status IN ('Active', 'Pending')"
            );
            cpIds = allCPs.map(cp => cp.id);
          } else if (target_type === "Specific CPs" && target_cp_ids) {
            cpIds = Array.isArray(target_cp_ids) ? target_cp_ids : JSON.parse(target_cp_ids);
          } else if (target_type === "By Locality" && target_locality_ids) {
            const localityIds = Array.isArray(target_locality_ids) 
              ? target_locality_ids 
              : JSON.parse(target_locality_ids);
            
            // Get CPs mapped to these localities
            const placeholders = localityIds.map(() => "?").join(",");
            const [cpMappings] = await pool.execute(
              `SELECT DISTINCT cpm.cp_id 
               FROM cp_locality_mappings cpm
               INNER JOIN community_partners cp ON cp.id = cpm.cp_id
               WHERE cpm.is_active = TRUE 
               AND cp.status IN ('Active', 'Pending')
               AND cpm.locality_id IN (${placeholders})`,
              localityIds
            );
            cpIds = cpMappings.map(m => m.cp_id);
          }

          if (cpIds.length > 0) {
            // Create in-app notifications
            await createNotificationsForCPs({
              cpIds,
              notificationType: "promotion",
              title: title,
              message: description || `New promotional material: ${title}`,
              actionUrl: `/cp/promotions/${result.insertId}`,
              referenceId: result.insertId,
              referenceType: "promotion",
              metadata: {
                image_url: image_url,
                tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : null
              }
            });

            // Send WhatsApp notifications to all applicable CPs
            try {
              // Get CP details (name and phone) for WhatsApp
              const [cpDetails] = await pool.execute(
                `SELECT id, name, phone FROM community_partners 
                 WHERE id IN (${cpIds.map(() => "?").join(",")}) 
                 AND phone IS NOT NULL 
                 AND phone != ''`,
                cpIds
              );

              // Send WhatsApp message to each CP
              for (const cp of cpDetails) {
                try {
                  await notifyCPNewPromotion(cp.phone, {
                    cp_name: cp.name,
                    title: title,
                    promotion_title: title
                  });
                } catch (whatsappError) {
                  console.error(`Failed to send WhatsApp notification to CP ${cp.id} (${cp.phone}):`, whatsappError);
                  // Continue with other CPs even if one fails
                }
              }
            } catch (whatsappError) {
              console.error("Error sending WhatsApp notifications for promotion:", whatsappError);
              // Don't fail the promotion creation if WhatsApp sending fails
            }
          }
        } catch (notifError) {
          console.error("Error creating notifications for promotion:", notifError);
          // Don't fail the promotion creation if notification creation fails
        }
      }

      res.status(201).json(promotion);
    } catch (error) {
      console.error("Create promotion error:", error);
      res.status(500).json({ error: "Failed to create promotion" });
    }
  }
);

// Update promotion (Admin only)
router.put("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get existing promotion
    const [existing] = await pool.execute("SELECT * FROM promotional_materials WHERE id = ?", [id]);

    if (!existing.length) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const oldValues = existing[0];

    const allowedFields = [
      "title",
      "description",
      "product_ids",
      "image_url",
      "whatsapp_caption",
      "deep_link_url",
      "offer_link",
      "valid_from",
      "valid_to",
      "target_type",
      "target_cp_ids",
      "target_locality_ids",
      "tags",
      "is_active",
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (["product_ids", "target_cp_ids", "target_locality_ids", "tags"].includes(field)) {
          updates.push(`${field} = ?`);
          values.push(req.body[field] ? JSON.stringify(req.body[field]) : null);
        } else {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    values.push(id);

    await pool.execute(`UPDATE promotional_materials SET ${updates.join(", ")} WHERE id = ?`, values);

    await auditLog(req, "UPDATE_PROMOTION", "promotion", id, oldValues, req.body);

    const [updated] = await pool.execute("SELECT * FROM promotional_materials WHERE id = ?", [id]);

    res.json(updated[0]);
  } catch (error) {
    console.error("Update promotion error:", error);
    res.status(500).json({ error: "Failed to update promotion" });
  }
});

// Delete promotion (Admin only)
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute("UPDATE promotional_materials SET is_active = FALSE WHERE id = ?", [id]);

    await auditLog(req, "DELETE_PROMOTION", "promotion", id, null, null);

    res.json({ message: "Promotion deleted" });
  } catch (error) {
    console.error("Delete promotion error:", error);
    res.status(500).json({ error: "Failed to delete promotion" });
  }
});

// Upload promotion image (Admin only)
router.post("/upload-image", authenticate, requireAdmin, promotionUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

    const imageUrl = `/uploads/promotions/${req.file.filename}`;

    res.json({
      success: true,
      data: {
        imageUrl: imageUrl,
        filename: req.file.filename,
      },
    });
  } catch (error) {
    console.error("Error uploading promotion image:", error);
    res.status(500).json({ success: false, error: "Failed to upload image" });
  }
});

export default router;


