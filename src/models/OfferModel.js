import pool from '../db/pool.js';

const sampleOffers = [
  { id: 101, title: "Ganesh Chaturthi Khoa Offer", slug: "ganesh-chaturthi-khoa", description: "A2 Khoa on sale for the festive season.", href: "/offers", active: true, badge: "Limited" },
  { id: 102, title: "Try A2 Milk FREE 5 Days", slug: "a2-free-trial", description: "Experience A2 goodness with a 5‑day trial.", href: "/offers", active: true, badge: "Hot" }
];

export const OfferModel = {
  async all() {
    if (!pool) return sampleOffers;
    const [rows] = await pool.query(`SELECT id, title, slug, description, href, active FROM offers WHERE active=1 ORDER BY id DESC LIMIT 100`);
    return rows;
  }
};
