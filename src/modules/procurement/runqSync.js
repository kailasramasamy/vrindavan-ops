// Sync CPP bills to runq via the bill-sync push API.
//
// Env config (.env):
//   RUNQ_BASE_URL       e.g. https://runq.example.com
//   RUNQ_BILL_SYNC_SLUG e.g. vrindavan-ops
//   RUNQ_BILL_SYNC_KEY  the API key issued by runq

import { Router } from "express";
import pool from "../../db/pool.js";

const router = Router();

function endpoint() {
  const base = process.env.RUNQ_BASE_URL;
  if (!base) throw new Error("RUNQ_BASE_URL not configured");
  return `${base.replace(/\/$/, "")}/api/v1/bill-sync/bills`;
}

function authHeaders() {
  const slug = process.env.RUNQ_BILL_SYNC_SLUG;
  const key = process.env.RUNQ_BILL_SYNC_KEY;
  if (!slug || !key) throw new Error("RUNQ_BILL_SYNC_SLUG / RUNQ_BILL_SYNC_KEY not configured");
  return { "X-Source-Slug": slug, "X-API-Key": key, "Content-Type": "application/json" };
}

async function loadCppBill(billId) {
  const [rows] = await pool.query(
    `SELECT cb.*, c.name AS cpp_name
       FROM cpp_billing cb
       JOIN cpp c ON c.id = cb.cpp_id
      WHERE cb.id = ?
      LIMIT 1`,
    [billId],
  );
  return rows[0] || null;
}

function toIsoDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    // Use local-time YYYY-MM-DD, not UTC — DATE columns have no timezone
    // and JS' toISOString() can shift the day backward across midnight UTC.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const s = String(d);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function buildPayload(bill, version) {
  // CPP bills are a single-line ingest: milk procurement total + (optional)
  // CPP salary. We collapse them into one line for now since runq treats
  // these as expense bills against the CPP vendor; a future enhancement
  // can split into two lines if needed.
  const externalId = `cpp_billing:${bill.id}`;
  const periodStart = toIsoDate(bill.billing_period_start);
  const periodEnd = toIsoDate(bill.billing_period_end);
  const periodLabel = `${periodStart} → ${periodEnd}`;
  const invoiceNumber = `VRD-${bill.period_type}-${periodStart}-CPP${bill.cpp_id}`;
  const total = Number(bill.total_amount);
  return {
    externalId,
    version,
    vendor: { externalRef: String(bill.cpp_id), name: bill.cpp_name },
    invoiceNumber,
    invoiceDate: toIsoDate(bill.billing_date),
    dueDate: toIsoDate(bill.due_date) || toIsoDate(bill.billing_date),
    lines: [{
      description: `Milk procurement (${periodLabel})${bill.salary_amount > 0 ? ` + CPP salary` : ""}`,
      quantity: Number(bill.total_quantity) || 1,
      unitPrice: total / (Number(bill.total_quantity) || 1),
      amount: total,
    }],
    subtotal: total,
    taxAmount: 0,
    totalAmount: total,
    notes: `cpp_id=${bill.cpp_id}; period=${bill.period_type}`,
  };
}

async function pushToRunq(payload) {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function persistSyncResult(billId, version, http) {
  const data = http.body && http.body.data ? http.body.data : {};
  const ok = http.status === 200 || http.status === 201;
  const status = ok ? data.status || "synced"
    : http.status === 409 ? `rejected:${data.reason || "conflict"}`
    : `error:${http.status}`;
  const errorText = ok ? null : JSON.stringify(http.body).slice(0, 1000);
  await pool.query(
    `UPDATE cpp_billing
        SET runq_bill_id      = COALESCE(?, runq_bill_id),
            runq_sync_version = ?,
            runq_sync_status  = ?,
            runq_sync_error   = ?,
            runq_synced_at    = NOW()
      WHERE id = ?`,
    [data.billId || null, ok ? version : 0, status, errorText, billId],
  );
  return { ok, status, billId: data.billId || null, reason: data.reason || null };
}

async function syncOne(billId, { resync }) {
  const bill = await loadCppBill(billId);
  if (!bill) return { ok: false, status: "not_found" };

  const isFirstTime = !bill.runq_bill_id;
  if (!isFirstTime && !resync) {
    return { ok: false, status: "already_synced", billId: bill.runq_bill_id };
  }
  const version = isFirstTime ? 1 : Number(bill.runq_sync_version || 1) + 1;
  const payload = buildPayload(bill, version);
  const http = await pushToRunq(payload);
  return persistSyncResult(billId, version, http);
}

router.post("/cpp/:billId/sync", async (req, res) => {
  try {
    const result = await syncOne(req.params.billId, { resync: false });
    res.json({ data: result });
  } catch (err) {
    console.error("[runq-sync] cpp sync failed:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.post("/cpp/:billId/resync", async (req, res) => {
  try {
    const result = await syncOne(req.params.billId, { resync: true });
    res.json({ data: result });
  } catch (err) {
    console.error("[runq-sync] cpp resync failed:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

export default router;
