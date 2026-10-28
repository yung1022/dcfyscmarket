import { createStockForCompany } from './lib/realtime-db.js';

function formatVolume(shares) {
  const value = Number(shares) || 0;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return String(Math.round(value));
}

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
      price: Number(price.toFixed(4)),
      change: 0,
      volume: payload.volume || formatVolume(Math.round(marketCap / price * randomBetween(0.001, 0.01))),
      volumeShares: Number(payload.volumeShares) || Math.round(marketCap / price * randomBetween(0.001, 0.01)),
      marketCap: Number(marketCap.toFixed(4)),
      value: Number(value.toFixed(4)),
      dayRange: `${price.toFixed(4)} - ${price.toFixed(4)}`,
      yearRange: `${price.toFixed(4)} - ${price.toFixed(4)}`,
      history: [Number(price.toFixed(4))],
      history10: [Number(price.toFixed(4))],
      history50: [Number(price.toFixed(4))],
      history100: [Number(price.toFixed(4))],
      tickCount: 0,
      stockActivity: 0
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
