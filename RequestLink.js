export const S1_DATA_URL = 'https://netherlands-apiprox-fyscs1-private44.tnstats.dev';

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOW_METHODS_HEADER = `${ALLOWED_METHODS.join(', ')}, OPTIONS`;

export function setCorsHeaders(req, res, allowedMethods = ALLOW_METHODS_HEADER) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', allowedMethods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Accept, Content-Type, Authorization'
  );
}

async function readRequestBody(req) {
  if (req.body !== undefined) {
    return Buffer.isBuffer(req.body) || typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export async function forwardRequest(req, res, path) {
  const upstreamUrl = new URL(path, `${S1_DATA_URL}/`);
  if (upstreamUrl.origin !== S1_DATA_URL) {
    return res.status(400).json({ ok: false, message: 'Invalid upstream request path.' });
  }

  const incomingUrl = new URL(req.url, 'http://localhost');
  for (const [key, value] of incomingUrl.searchParams) {
    if (key !== 'path') upstreamUrl.searchParams.append(key, value);
  }

  const headers = {};
  for (const name of ['accept', 'content-type', 'authorization']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }

  try {
    const options = { method: req.method, headers, signal: AbortSignal.timeout(10000) };
    if (!['GET', 'HEAD'].includes(req.method)) {
      options.body = await readRequestBody(req);
    }

    const upstream = await fetch(upstreamUrl, options);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (req.method === 'HEAD' || [204, 304].includes(upstream.status)) {
      return res.status(upstream.status).end();
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(body);
  } catch (error) {
    console.error('Unable to forward request to the S1 data API:', error);
    const message = error?.name === 'TimeoutError'
      ? 'The S1 data API request timed out.'
      : 'Unable to forward the request to the S1 data API.';
    return res.status(502).json({ ok: false, message });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOW_METHODS_HEADER);
    return res.status(405).json({ ok: false, message: 'Unsupported request method.' });
  }

  const path = req.query?.path;
  if (typeof path !== 'string' || path.length === 0) {
    return res.status(400).json({ ok: false, message: 'An upstream request path is required.' });
  }

  return forwardRequest(req, res, path);
}
