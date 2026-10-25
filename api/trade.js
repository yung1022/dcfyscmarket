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

    const { action, symbol, quantity } = req.body || {};
    const trade = placeTrade({
      userId: session.discordUserId,
      action,
      symbol,
      quantity
    });

    if (!trade.ok) {
      return res.status(400).json(trade);
    }

    return res.status(200).json({
      ok: true,
      ...trade,
      portfolio: getPortfolio(session.discordUserId)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Trade failed.' });
  }
}
