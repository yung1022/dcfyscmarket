const S1_DATA_URL = 'https://netherlands-apiprox-fyscs1-private44.tnstats.dev/public/s1_data';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, message: 'Only GET is allowed.' });
  }

  try {
    const upstream = await fetch(S1_DATA_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type');

    if (contentType) res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error('Unable to fetch s1-data from upstream API:', error);
    const message = error?.name === 'TimeoutError'
      ? 'The s1-data upstream API request timed out.'
      : 'Unable to fetch s1-data from the upstream API.';
    return res.status(502).json({ ok: false, message });
  }
}
