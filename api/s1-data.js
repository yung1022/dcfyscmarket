import { forwardRequest, setCorsHeaders } from '../RequestLink.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, message: 'Only GET is allowed.' });
  }

  return forwardRequest(req, res, 'public/s1_data');
}
