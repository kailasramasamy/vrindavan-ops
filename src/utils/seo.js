import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadSEOConfig() {
  try {
    const p = path.resolve(__dirname, '../../public/data/seo.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const json = JSON.parse(raw);
    return json && typeof json === 'object' ? json : {};
  } catch (_) {
    return {};
  }
}

export function buildSEO(overrides = {}) {
  const cfg = loadSEOConfig();
  const siteUrl = cfg.siteUrl || 'https://www.vrindavan.farm';
  const defaults = cfg.defaults || {
    title: 'Vrindavan Farm — A2 Desi Cow Milk, Ghee & Fresh Dairy',
    description: 'Premium A2 Desi Cow Milk and dairy essentials in Bengaluru. Fresh, natural, and delivered daily.',
    image: '/assets/img/og.jpg'
  };

  // If a path (like "/download") is provided, merge that page's defaults
  const pages = cfg.pages || {};
  const key = (overrides.url || '').split('?')[0];
  let pageDefaults = {};
  if (key && pages[key]) {
    pageDefaults = pages[key];
  } else if (key) {
    // Fallback: longest prefix match (e.g., /products/:slug -> /products)
    const match = Object.keys(pages || {})
      .filter(k => key.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (match) pageDefaults = pages[match] || {};
  }

  // Compose fields with precedence: defaults -> pageDefaults -> overrides
  let title = overrides.title || pageDefaults.title || defaults.title;
  let description = overrides.description || pageDefaults.description || defaults.description;
  let image = overrides.image || pageDefaults.image || defaults.image;

  // Build absolute URL if override/pageDefault provides a path
  let url = overrides.url || pageDefaults.url || '';
  if (!url) {
    // Fallback to site root
    url = siteUrl;
  } else if (!/^https?:\/\//i.test(url)) {
    // Treat as path and prefix siteUrl
    url = siteUrl.replace(/\/$/, '') + (url.startsWith('/') ? url : `/${url}`);
  }

  // Ensure OG image is absolute for crawlers if it's a path
  if (image && !/^https?:\/\//i.test(image)) {
    image = siteUrl.replace(/\/$/, '') + (image.startsWith('/') ? image : `/${image}`);
  }

  return { title, description, url, image };
}
