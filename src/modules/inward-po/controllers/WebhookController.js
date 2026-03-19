import pool from "../../../db/pool.js";
import { InwardPoModel } from "../models/InwardPoModel.js";

export class WebhookController {
  static async receivePoWebhook(req, res) {
    try {
      // 1. Validate API key
      const apiKey =
        req.headers["x-api-key"] ||
        req.headers["x-webhook-signature"];

      if (!apiKey) {
        return res.status(401).json({ error: "Missing API key" });
      }

      const isValid = await WebhookController.validateApiKey(apiKey, "wms");
      if (!isValid) {
        return res.status(403).json({ error: "Invalid API key" });
      }

      // 2. Parse event type
      const { event, data } = req.body;
      if (!event || !data) {
        return res.status(400).json({ error: "Missing event or data" });
      }

      // 3. Update last_received_at
      await WebhookController.touchWebhookRegistration(apiKey, "wms");

      // 4. Route by event type
      switch (event) {
        case "po.sent": {
          const result = await InwardPoModel.createFromWebhook(data);
          if (!result.success) {
            console.error("Webhook po.sent failed:", result.error);
            return res.status(422).json({ error: result.error });
          }
          return res.json({ ok: true, id: result.data.id });
        }

        case "po.grn_completed": {
          const grnResult = await InwardPoModel.processGrn(data);
          if (!grnResult.success) {
            console.error("Webhook po.grn_completed failed:", grnResult.error);
            return res.status(422).json({ error: grnResult.error });
          }
          return res.json({ ok: true, invoiceId: grnResult.data?.invoiceId });
        }

        case "po.payment_done": {
          const { invoice_id, payment_date, payment_reference } = data;
          if (!invoice_id) {
            return res.status(400).json({ error: "Missing invoice_id" });
          }
          const result = await InwardPoModel.markAsPaid(invoice_id, {
            payment_date,
            payment_reference,
          });
          if (!result.success) {
            return res.status(422).json({ error: result.error });
          }
          return res.json({ ok: true });
        }

        default:
          console.warn("Unknown webhook event:", event);
          return res.json({ ok: true, message: "Event ignored" });
      }
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  static async validateApiKey(apiKey, source) {
    try {
      // Check against env-based key first (fast path)
      const envKey = process.env.WMS_WEBHOOK_API_KEY || "wms-ops-webhook-key-2024";
      if (apiKey === envKey) {
        return true;
      }

      // Check database registrations
      if (!pool) return false;
      const [rows] = await pool.execute(
        `SELECT id FROM webhook_registrations
         WHERE source = ? AND api_key = ? AND is_active = 1
         LIMIT 1`,
        [source, apiKey],
      );
      return rows.length > 0;
    } catch (error) {
      console.error("Error validating webhook API key:", error);
      return false;
    }
  }

  static async touchWebhookRegistration(apiKey, source) {
    try {
      if (!pool) return;
      await pool.execute(
        `UPDATE webhook_registrations SET last_received_at = NOW()
         WHERE source = ? AND api_key = ?`,
        [source, apiKey],
      );
    } catch {
      // Non-critical, ignore
    }
  }
}
