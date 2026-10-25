import { upsertDiscordUser } from '../lib/stock-db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const payload = req.body || {};
  const discordUserId = String(payload.discordUserId || '').trim();
  const discordUsername = String(payload.discordUsername || '').trim();
  const avatar = String(payload.avatar || '').trim();
  const connectedAt = String(payload.connectedAt || '').trim();

  if (!/^\d{17,20}$/.test(discordUserId) || !discordUsername || discordUsername.length > 128) {
    return res.status(400).json({
      ok: false,
      message: 'Login response must include a valid Discord user ID and username.'
    });
  }

  const profile = {};
  if (avatar && avatar.length <= 256) profile.avatar = avatar;
  if (connectedAt && Number.isFinite(Date.parse(connectedAt))) profile.connectedAt = connectedAt;

  try {
    await upsertDiscordUser(discordUserId, discordUsername, profile);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'Unable to save Discord user.'
    });
  }

  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL === '1' ? '; Secure' : '';
  const cookieOptions = `Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
  const cookies = [
    `discord_user_id=${encodeURIComponent(discordUserId)}; ${cookieOptions}`,
    `discord_username=${encodeURIComponent(discordUsername)}; ${cookieOptions}`,
    `discord_avatar=${encodeURIComponent(profile.avatar || '')}; ${cookieOptions}`,
    `discord_connected_at=${encodeURIComponent(profile.connectedAt || '')}; ${cookieOptions}`
  ];
  res.setHeader('Set-Cookie', cookies);

  return res.status(200).json({
    ok: true,
    user: { discordUserId, discordUsername, ...profile }
  });
}
