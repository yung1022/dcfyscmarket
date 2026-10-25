function readCookies(request) {
  const header = request.headers?.cookie || '';
  const cookies = {};

  header.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = '';
    }
  });

  return cookies;
}

export function getDiscordSession(request) {
  const cookies = readCookies(request);
  const discordUserId = cookies.discord_user_id || '';

  if (!/^\d{17,20}$/.test(discordUserId)) {
    return null;
  }

  return {
    discordUserId,
    discordUsername: cookies.discord_username || '',
    avatar: cookies.discord_avatar || '',
    connectedAt: cookies.discord_connected_at || ''
  };
}