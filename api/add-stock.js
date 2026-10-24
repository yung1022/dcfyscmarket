import { saveStockToDb } from './lib/stock-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
  }

  try {
    const payload = req.body || {};
    const symbol = String(payload.symbol || '').trim().toUpperCase();
    const company = String(payload.company || '').trim();
    const price = Number(payload.price ?? 0);

    if (!symbol || !company || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'Invalid payload. Expected { symbol, company, price, change, volume, marketCap, dayRange, yearRange, history }'
      });
    }

    const stock = {
      symbol,
      company,
      price: Number(price.toFixed(2)),
      change: Number(payload.change ?? 0),
      volume: payload.volume || 'N/A',
      marketCap: payload.marketCap || 'N/A',
      dayRange: payload.dayRange || 'N/A',
      yearRange: payload.yearRange || 'N/A',
      history: Array.isArray(payload.history) ? payload.history.map(Number) : [price],
      updatedAt: new Date().toISOString()
    };

    const result = await saveStockToDb(symbol, stock);

    return res.status(200).json({
      ok: true,
      message: 'Stock saved successfully.',
      symbol,
      data: result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'Failed to add stock.'
    });
  }
}
