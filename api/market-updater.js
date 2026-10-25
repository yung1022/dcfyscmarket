import { getMarketDataFromDb, tickMarketInDb } from './lib/realtime-db.js';

function classifyError(error) {
  const message = error?.message || 'Unable to load market data from Firebase.';
  if (/not configured/i.test(message)) return { status: 500, message };
  if (/permission denied|permission_denied|unauthenticated|invalid.*credential|authenticat/i.test(message)) {
    return { status: 500, message };
  }
  if (/No stocks? found|no stock quotes/i.test(message)) return { status: 503, message };
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|fetch/i.test(message)) return { status: 503, message };
  return { status: 500, message };
}

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
        message: 'No stock quotes found in Firebase Realtime Database at /stocks. Add one via POST /api/add-stock or Firebase Console.'
      });
    }

    return res.status(200).json(snapshot);
  } catch (error) {
    const { status, message } = classifyError(error);
    return res.status(status).json({ ok: false, message });
  }
}
