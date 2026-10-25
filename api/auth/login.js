export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const authServiceUrl = process.env.AUTH_SERVICE_URL || 'https://the-final-fysc.vercel.app';
  const returnUrl = process.env.APP_RETURN_URL || 'https://dcfyscmarket.vercel.app';
  const callbackUrl = new URL('/api/auth/callback', returnUrl);
  callbackUrl.searchParams.set('returnTo', returnUrl);

  const loginUrl = new URL('/api/discord/login', authServiceUrl);
  loginUrl.searchParams.set('authredirect', 'market');
  loginUrl.searchParams.set('returnTo', callbackUrl.toString());

  return res.redirect(loginUrl.toString());
}
