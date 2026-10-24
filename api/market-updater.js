import { tickMarket, getMarketSnapshot, placeTrade, getPortfolio, seedIfNeeded } from '../lib/market.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method === 'GET') {
      const snapshot = getMarketSnapshot();
      return res.status(200).json(snapshot);
    }

    if (req.method === 'POST') {
      const { action, symbol, quantity } = req.body || {};
      const result = placeTrade({
        userId: req.body?.userId || 'demo',
        action,
        symbol,
        quantity
      });

      return res.status(result.ok ? 200 : 400).json(result);
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Market update failed.' });
  }
}
