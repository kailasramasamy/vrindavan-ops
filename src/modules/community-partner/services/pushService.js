import pool from "../config/database.js";

function getVapidConfig() {
  const publicKey = process.env.CP_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.CP_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.CP_VAPID_SUBJECT || process.env.VAPID_SUBJECT || "mailto:support@vrindavan.farm";

  if (!publicKey || !privateKey) {
    throw new Error(
      "Missing VAPID keys. Set CP_VAPID_PUBLIC_KEY and CP_VAPID_PRIVATE_KEY (or VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)."
    );
  }
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey() {
  return getVapidConfig().publicKey;
}

async function getWebPush() {
  // web-push is not currently in dependencies; we import dynamically to keep runtime flexible.
  const mod = await import("web-push");
  return mod.default || mod;
}

export async function sendPushToSubscriptions({ subscriptions, payload }) {
  const webPush = await getWebPush();
  const { publicKey, privateKey, subject } = getVapidConfig();

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const results = [];
  for (const sub of subscriptions) {
    try {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      await webPush.sendNotification(pushSub, JSON.stringify(payload));
      results.push({ id: sub.id, ok: true });
    } catch (e) {
      results.push({ id: sub.id, ok: false, error: String(e?.message || e) });
    }
  }
  return results;
}

export async function upsertSubscription({ cpId, endpoint, p256dh, auth, userAgent }) {
  await pool.execute(
    `INSERT INTO cp_push_subscriptions (cp_id, endpoint, p256dh, auth, user_agent, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       p256dh = VALUES(p256dh),
       auth = VALUES(auth),
       user_agent = VALUES(user_agent),
       is_active = 1,
       updated_at = NOW()`,
    [cpId, endpoint, p256dh, auth, userAgent || null],
  );
}

export async function deactivateSubscription({ cpId, endpoint }) {
  await pool.execute(
    `UPDATE cp_push_subscriptions
     SET is_active = 0, updated_at = NOW()
     WHERE cp_id = ? AND endpoint = ?`,
    [cpId, endpoint],
  );
}

export async function listActiveSubscriptions({ cpIds = null }) {
  if (Array.isArray(cpIds) && cpIds.length > 0) {
    const placeholders = cpIds.map(() => "?").join(",");
    const [rows] = await pool.execute(
      `SELECT id, cp_id, endpoint, p256dh, auth
       FROM cp_push_subscriptions
       WHERE is_active = 1 AND cp_id IN (${placeholders})`,
      cpIds,
    );
    return rows || [];
  }
  const [rows] = await pool.execute(
    `SELECT id, cp_id, endpoint, p256dh, auth
     FROM cp_push_subscriptions
     WHERE is_active = 1`,
  );
  return rows || [];
}


