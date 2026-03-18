import pool from "../db/pool.js";

const sampleProducts = [
  { id: 1, name: "A2 Desi Cow Milk (1L)", price: 89, unit: "1L", imageUrl: "/assets/img/og.jpg", tags: ["milk", "A2"], active: true },
  { id: 2, name: "A2 Ghee (500ml)", price: 799, unit: "500ml", imageUrl: "/assets/img/og.jpg", tags: ["ghee", "A2"], active: true },
  { id: 3, name: "Paneer (200g)", price: 149, unit: "200g", imageUrl: "/assets/img/og.jpg", tags: ["paneer"], active: true },
];

export const ProductModel = {
  async all() {
    if (!pool) return sampleProducts;
    const [rows] = await pool.query(`SELECT id, name, price, unit, image_url AS imageUrl FROM products ORDER BY id DESC LIMIT 200`);
    return rows;
  },
  async byId(id) {
    if (!pool) return sampleProducts.find((p) => p.id === Number(id)) || null;
    const [rows] = await pool.query(`SELECT id, name, price, unit, image_url AS imageUrl FROM products WHERE id = ?`, [id]);
    return rows[0] || null;
  },
  async getTotalProductsCount() {
    if (!pool) return { success: true, count: sampleProducts.length };
    try {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM products`);
      return { success: true, count: rows[0].count };
    } catch (error) {
      console.error("Error getting products count:", error);
      return { success: false, count: 0 };
    }
  },
};
