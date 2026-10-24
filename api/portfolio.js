import { getPortfolio, placeTrade, seedIfNeeded } from './lib/market.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
    }

    const { userId = 'demo', symbol, action, quantity } = req.body || {};
    const tradeResult = placeTrade({ userId, symbol, action, quantity });

    if (!tradeResult.ok) {
      return res.status(400).json(tradeResult);
    }

    return res.status(200).json({
      ok: true,
      ...tradeResult,
      portfolio: getPortfolio(userId)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Trade failed.' });
  }
}
