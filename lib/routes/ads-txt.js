// GET /ads.txt (rewritten to /api/ads-txt in vercel.json).
// Served only once ADSENSE_PUBLISHER_ID is set in the environment (e.g. "pub-1234567890123456"
// or "ca-pub-1234567890123456"). Until then it answers 404, so no placeholder or fake seller
// line is ever published. f08c47fec0942fa0 is Google's public TAG certification id.
export function adsTxtBody(raw = process.env.ADSENSE_PUBLISHER_ID) {
  const id = String(raw || '').trim().replace(/^ca-/, '');
  if (!/^pub-\d{10,20}$/.test(id)) return null;
  return `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`;
}

export default function adsTxt(req, res) {
  const body = adsTxtBody();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (!body) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).end('');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.status(200).end(body);
}
