import express from "express";
import pool from "../config/database.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import {
  getVapidPublicKey,
  upsertSubscription,
  deactivateSubscription,
  listActiveSubscriptions,
  sendPushToSubscriptions,
} from "../services/pushService.js";

const router = express.Router();

// --- Web Push (PWA) ---
router.get("/push/vapid-public-key", authenticate, async (req, res) => {
  try {
    return res.json({ publicKey: getVapidPublicKey() });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "VAPID key not configured" });
  }
});

router.post("/push/subscribe", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;
    if (!cpId) return res.status(403).json({ error: "Unauthorized" });

    const { endpoint, keys } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }

    await upsertSubscription({
      cpId,
      endpoint,
      p256dh,
      auth,
      userAgent: req.get("user-agent"),
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.post("/push/unsubscribe", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;
    if (!cpId) return res.status(403).json({ error: "Unauthorized" });

    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    await deactivateSubscription({ cpId, endpoint });
    return res.json({ success: true });
  } catch (error) {
    console.error("Error deactivating push subscription:", error);
    return res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

// Admin: send push to all CPs by default, or selected CPs (cpIds)
router.post("/push/send", authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, message, action_url, cpIds } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required" });
    }

    const targetCpIds = Array.isArray(cpIds) ? cpIds.map((x) => parseInt(x)).filter(Boolean) : null;
    const subs = await listActiveSubscriptions({ cpIds: targetCpIds });

    // Create in-app notifications too (keeps UI + push in sync)
    const uniqueCpIds = [...new Set(subs.map((s) => s.cp_id))];
    if (uniqueCpIds.length) {
      await createNotificationsForCPs({
        cpIds: uniqueCpIds,
        notificationType: "push",
        title,
        message,
        actionUrl: action_url || null,
        metadata: { via: "push" },
      });
    }

    const payload = {
      title,
      body: message,
      url: action_url || "/cp/dashboard",
    };

    const results = await sendPushToSubscriptions({ subscriptions: subs, payload });

    // Clean up dead subscriptions (common for old devices)
    const dead = results.filter((r) => !r.ok && /410|404/i.test(r.error || ""));
    if (dead.length) {
      const deadIds = dead.map((d) => d.id);
      const placeholders = deadIds.map(() => "?").join(",");
      await pool.execute(
        `UPDATE cp_push_subscriptions SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders})`,
        deadIds,
      );
    }

    return res.json({
      success: true,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (error) {
    console.error("Error sending push:", error);
    return res.status(500).json({ error: error?.message || "Failed to send push" });
  }
});

// Get unread notification count
router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;
    if (!cpId) {
      return res.json({ count: 0 });
    }

    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count 
       FROM cp_notifications 
       WHERE cp_id = ? AND is_read = FALSE`,
      [cpId]
    );

    res.json({ count: rows[0]?.count || 0 });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.json({ count: 0 });
  }
});

// Get all notifications for CP
router.get("/", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;
    if (!cpId) {
      return res.json([]);
    }

    const notificationType = req.query.type; // Optional filter by type
    let query = `
      SELECT 
        id,
        notification_type,
        title,
        message,
        action_url,
        reference_id,
        reference_type,
        metadata,
        is_read,
        read_at,
        created_at
      FROM cp_notifications
      WHERE cp_id = ?
    `;
    const params = [cpId];

    if (notificationType) {
      query += ` AND notification_type = ?`;
      params.push(notificationType);
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const [notifications] = await pool.execute(query, params);

    // Parse metadata JSON if present
    const formattedNotifications = notifications.map(notif => {
      let metadata = null;
      if (notif.metadata) {
        try {
          // If it's already an object, use it directly; otherwise parse it
          if (typeof notif.metadata === 'string') {
            metadata = JSON.parse(notif.metadata);
          } else if (typeof notif.metadata === 'object') {
            metadata = notif.metadata;
          }
        } catch (e) {
          console.error('Error parsing notification metadata:', e);
          metadata = null;
        }
      }
      
      return {
        ...notif,
        metadata: metadata
      };
    });

    res.json(formattedNotifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
router.post("/:id/read", authenticate, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const cpId = req.user?.cp_id;

    if (!cpId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.execute(
      `UPDATE cp_notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE id = ? AND cp_id = ?`,
      [notificationId, cpId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all notifications as read
router.post("/mark-all-read", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;

    if (!cpId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await pool.execute(
      `UPDATE cp_notifications 
       SET is_read = TRUE, read_at = NOW() 
       WHERE cp_id = ? AND is_read = FALSE`,
      [cpId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// Get notification by type (for filtering)
router.get("/types", authenticate, async (req, res) => {
  try {
    const cpId = req.user?.cp_id;
    if (!cpId) {
      return res.json([]);
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT notification_type, COUNT(*) as count
       FROM cp_notifications
       WHERE cp_id = ? AND is_read = FALSE
       GROUP BY notification_type
       ORDER BY notification_type`,
      [cpId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching notification types:", error);
    res.status(500).json({ error: "Failed to fetch notification types" });
  }
});

export default router;

// Helper function to create notifications (can be imported by other modules)
export async function createNotification({
  cpId,
  notificationType,
  title,
  message = null,
  actionUrl = null,
  referenceId = null,
  referenceType = null,
  metadata = null
}) {
  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    
    const [result] = await pool.execute(
      `INSERT INTO cp_notifications 
       (cp_id, notification_type, title, message, action_url, reference_id, reference_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cpId, notificationType, title, message, actionUrl, referenceId, referenceType, metadataJson]
    );

    return { success: true, id: result.insertId };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: error.message };
  }
}

// Helper function to create notifications for multiple CPs
export async function createNotificationsForCPs({
  cpIds,
  notificationType,
  title,
  message = null,
  actionUrl = null,
  referenceId = null,
  referenceType = null,
  metadata = null
}) {
  try {
    if (!Array.isArray(cpIds) || cpIds.length === 0) {
      return { success: false, error: "No CP IDs provided" };
    }

    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const values = cpIds.map(cpId => [
      cpId,
      notificationType,
      title,
      message,
      actionUrl,
      referenceId,
      referenceType,
      metadataJson
    ]);

    const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const flatValues = values.flat();

    const [result] = await pool.execute(
      `INSERT INTO cp_notifications 
       (cp_id, notification_type, title, message, action_url, reference_id, reference_type, metadata)
       VALUES ${placeholders}`,
      flatValues
    );

    return { success: true, count: cpIds.length };
  } catch (error) {
    console.error("Error creating notifications for CPs:", error);
    return { success: false, error: error.message };
  }
}
