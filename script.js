import { getPortfolio, seedIfNeeded } from './lib/market.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, message: 'Only GET is allowed.' });
    }

    const userId = req.query.userId || 'demo';
    return res.status(200).json(getPortfolio(userId));
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Unable to load portfolio.' });
  }
}
