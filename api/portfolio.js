import { getPortfolio, seedIfNeeded } from './lib/market.js';
import { getDiscordSession } from './lib/discord-session.js';

export default async function handler(req, res) {
  try {
    seedIfNeeded();

    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, message: 'Only GET is allowed.' });
    }

    const session = getDiscordSession(req);
    if (!session) {
      return res.status(401).json({ ok: false, message: 'Log in with Discord to view your portfolio.' });
    }

    return res.status(200).json(getPortfolio(session.discordUserId));
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || 'Unable to load portfolio.' });
  }
}
