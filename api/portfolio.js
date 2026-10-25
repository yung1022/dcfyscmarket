import { getPortfolio, placeTrade, seedIfNeeded } from './lib/market.js';
import { getDiscordSession } from './lib/discord-session.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, message: 'Only POST is allowed.' });
    }

    const session = getDiscordSession(req);
    if (!session) {
      return res.status(401).json({ ok: false, message: 'Log in with Discord to trade.' });
    }

    const { symbol, action, quantity } = req.body || {};
    const userId = session.discordUserId;
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
