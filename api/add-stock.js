import { createStockForCompany } from './lib/stock-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
  }

  try {
    const payload = req.body || {};
    const company = String(payload.company || '').trim();
    const price = Number(payload.price ?? 0.01);
    const marketCap = Number(payload.marketCap ?? 0.01);
    const value = Number(payload.value ?? payload.marketValue ?? 0.01);

    if (!company || !Number.isFinite(price) || price <= 0 || !Number.isFinite(marketCap) || marketCap < 0 || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({
        ok: false,
        message: 'Provide a company name and valid optional price, marketCap, and value.'
      });
    }

    const stock = {
      company,
      price: Number(price.toFixed(2)),
      change: 0,
      volume: payload.volume || '0',
      marketCap: Number(marketCap.toFixed(2)),
      value: Number(value.toFixed(2)),
      dayRange: `${price.toFixed(2)} - ${price.toFixed(2)}`,
      yearRange: `${price.toFixed(2)} - ${price.toFixed(2)}`,
      history: [Number(price.toFixed(2))]
    };

    const result = await createStockForCompany(company, stock);

    return res.status(200).json({
      ok: true,
      message: 'Stock saved successfully.',
      symbol: result.data.symbol,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'Failed to add stock.'
    });
  }
}
