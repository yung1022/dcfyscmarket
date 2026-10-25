import { tickMarket, getMarketSnapshot, seedIfNeeded } from './lib/market.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method === 'GET' && req.query.update !== '1') {
      return res.status(200).json(getMarketSnapshot());
    }

    if ((req.method === 'GET' && req.query.update === '1') || req.method === 'POST') {
      return res.status(200).json({ ok: true, ...tickMarket() });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Market update failed.' });
  }
}
