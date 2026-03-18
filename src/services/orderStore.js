import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store orders under public/data as requested
const PUBLIC_DATA_DIR = path.resolve(__dirname, '../../public/data');
const ORDERS_PATH = path.join(PUBLIC_DATA_DIR, 'orders.json');
// Legacy path support (for migration)
const LEGACY_PATH = path.resolve(__dirname, '../../data/orders.json');

async function ensureStore() {
  await mkdir(PUBLIC_DATA_DIR, { recursive: true });
  try {
    await readFile(ORDERS_PATH, 'utf-8');
    return;
  } catch {}

  // Try to migrate from legacy location if present
  try {
    const legacyRaw = await readFile(LEGACY_PATH, 'utf-8');
    // If legacy file exists and is valid JSON, copy it over
    JSON.parse(legacyRaw); // will throw if invalid
    await writeFile(ORDERS_PATH, legacyRaw, 'utf-8');
    return;
  } catch {}

  // Otherwise initialize a fresh store
  await writeFile(ORDERS_PATH, JSON.stringify({ orders: {} }, null, 2), 'utf-8');
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(ORDERS_PATH, 'utf-8');
  try {
    const json = JSON.parse(raw);
    return json && typeof json === 'object' ? json : { orders: {} };
  } catch {
    return { orders: {} };
  }
}

async function writeStore(data) {
  await writeFile(ORDERS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function newOrderId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `ORD-${t}-${r}`.toUpperCase();
}

export const orderStore = {
  async list() {
    const data = await readStore();
    return data.orders || {};
  },
  async get(id) {
    const data = await readStore();
    return (data.orders || {})[id] || null;
  },
  async create(payload) {
    const data = await readStore();
    const id = newOrderId();
    const now = new Date().toISOString();
    const order = { id, createdAt: now, status: 'pending', ...payload };
    data.orders = data.orders || {};
    data.orders[id] = order;
    await writeStore(data);
    return order;
  },
  async updateStatus(id, status) {
    const data = await readStore();
    if (!data.orders?.[id]) return null;
    data.orders[id].status = status;
    data.orders[id].updatedAt = new Date().toISOString();
    await writeStore(data);
    return data.orders[id];
  },
  async updateDeliveryDate(id, deliveryDateISO) {
    const data = await readStore();
    if (!data.orders?.[id]) return null;
    data.orders[id].deliveryDate = deliveryDateISO;
    data.orders[id].updatedAt = new Date().toISOString();
    await writeStore(data);
    return data.orders[id];
  },
  async delete(id) {
    const data = await readStore();
    if (!data.orders?.[id]) return false;
    delete data.orders[id];
    await writeStore(data);
    return true;
  }
};
