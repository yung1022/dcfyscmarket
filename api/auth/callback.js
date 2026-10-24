export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const { token } = req.query;
  const returnUrl = req.query.returnTo || '/';

  if (!token) {
    return res.redirect(returnUrl || '/');
  }

  res.setHeader('Set-Cookie', [
    `auth_token=${encodeURIComponent(String(token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
    `app_return=${encodeURIComponent(String(returnUrl))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  ]);

  return res.redirect(String(returnUrl));
}
