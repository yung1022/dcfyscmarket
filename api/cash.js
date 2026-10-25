import { getDiscordSession } from './lib/discord-session.js';
import { addCashToDb } from './lib/realtime-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
  }

  const session = getDiscordSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, message: 'Log in with Discord to add cash.' });
  }

  try {
    const result = await addCashToDb({
      discordUserId: session.discordUserId,
      discordUsername: session.discordUsername,
      amount: req.body?.amount
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message || 'Unable to add cash.' });
  }
}