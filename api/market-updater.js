import { getMarketDataFromDb, tickMarketInDb } from './lib/stock-db.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, message: 'Only GET and POST are allowed.' });
  }

  try {
    const snapshot = req.method === 'POST'
      ? await tickMarketInDb()
      : await getMarketDataFromDb();
    if (!snapshot.stocks.length) {
      return res.status(503).json({
        ok: false,
        message: 'No stock quotes found in Firebase collection "stocks".'
      });
    }

    return res.status(200).json(snapshot);
  } catch (error) {
    return res.status(503).json({
      ok: false,
      message: error.message || 'Unable to load market data from Firebase.'
    });
  }
}
