import { addCashToDb } from './lib/realtime-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
  }

  const discordUserId = String(req.body?.discordUserId || '').trim();
  if (!/^\d{17,20}$/.test(discordUserId)) {
    return res.status(400).json({ ok: false, message: 'A valid discordUserId is required in the body.' });
  }

  try {
    const result = await addCashToDb({
      discordUserId,
      amount: req.body?.amount
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message || 'Unable to add cash.' });
  }
}