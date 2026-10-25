import { getDiscordSession } from './lib/discord-session.js';
import { placeTradeInDb } from './lib/realtime-db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
    }

    const session = getDiscordSession(req);
    if (!session) {
      return res.status(401).json({ ok: false, message: 'Log in with Discord to trade.' });
    }

    const trade = await placeTradeInDb({
      discordUserId: session.discordUserId,
      action: req.body?.action,
      symbol: req.body?.symbol,
      quantity: req.body?.quantity
    });

    if (!trade.ok) {
      return res.status(400).json(trade);
    }

    return res.status(200).json(trade);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Trade failed.' });
  }
}
