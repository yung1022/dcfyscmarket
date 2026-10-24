import { tickMarket, getMarketSnapshot, seedIfNeeded } from './lib/market.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method === 'GET' && req.query.read === '1') {
      return res.status(200).json(getMarketSnapshot());
    }

    if (req.method === 'GET' || req.method === 'POST') {
      const snapshot = tickMarket();
      return res.status(200).json({ ok: true, ...snapshot });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Unable to update market.' });
  }
}
