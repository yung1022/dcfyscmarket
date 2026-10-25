import { upsertDiscordUser } from '../lib/stock-db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const { token } = req.query;
  const returnUrl = req.query.returnTo || '/';
  const discordUserId = String(req.query.discordUserId || '').trim();
  const discordUsername = String(req.query.discordUsername || '').trim();

  if (!token) {
    return res.redirect(returnUrl || '/');
  }

  if (!/^\d{17,20}$/.test(discordUserId) || !discordUsername) {
    return res.status(400).json({
      ok: false,
      message: 'Login response must include a valid Discord user ID and username.'
    });
  }

  try {
    await upsertDiscordUser(discordUserId, discordUsername);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'Unable to save Discord user.'
    });
  }

  res.setHeader('Set-Cookie', [
    `auth_token=${encodeURIComponent(String(token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    `discord_user_id=${encodeURIComponent(discordUserId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    `discord_username=${encodeURIComponent(discordUsername)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    `app_return=${encodeURIComponent(String(returnUrl))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  ]);

  return res.redirect(String(returnUrl));
}
