import { OfferModel } from '../models/OfferModel.js';

export const listOffers = async (req, res) => {
  const items = await OfferModel.all();
  res.json({ ok: true, count: items.length, items });
};
