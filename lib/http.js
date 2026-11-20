export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Raw body, needed to verify webhook signatures.
 * On Vercel the Node helpers buffer the request body BEFORE the handler runs and replay it only
 * through req.on('data' | 'end') (req.read is swapped too), so `for await (const c of req)` sees an
 * already-ended stream and returns an EMPTY body. Listening for data/end works both there and on a
 * plain Node IncomingMessage. (`config.api.bodyParser` is a Next.js option; plain functions ignore it.)
 */
export function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Read req.body safely. Vercel parses it lazily on first access and THROWS (ApiError 400
 * "Invalid JSON") for a malformed application/json body; without this the route answers 500.
 * Returns { ok: true, body } or { ok: false }.
 */
export function safeBody(req) {
  try {
    return { ok: true, body: req.body };
  } catch {
    return { ok: false };
  }
}
