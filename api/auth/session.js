import { getDiscordSession } from '../lib/discord-session.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const user = getDiscordSession(req);
  if (!user) {
    return res.status(401).json({ ok: false, message: 'Not logged in.' });
  }

  return res.status(200).json({ ok: true, user });
}