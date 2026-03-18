import { ProductModel } from '../models/ProductModel.js';

export const listProducts = async (req, res) => {
  const items = await ProductModel.all();
  res.json({ ok: true, count: items.length, items });
};

export const getProduct = async (req, res) => {
  const item = await ProductModel.byId(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, item });
};
