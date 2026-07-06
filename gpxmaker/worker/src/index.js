// GPX Maker — Geoapify Places proxy (Cloudflare Worker)
//
// Keeps the Geoapify API key server-side, only answers requests from allowed
// origins, whitelists parameters, and (optionally) enforces a hard daily cap so
// the service simply stops instead of ever costing money.
//
// Config:
//   - Set the secret:            wrangler secret put GEOAPIFY_KEY
//   - Edit ALLOWED_ORIGINS below to include your GitHub Pages origin.
//   - (Optional) bind a KV namespace named COUNTER to enable the daily cap.

const ALLOWED_ORIGINS = [
  'http://localhost:8765',       // local testing (python http.server)
  'http://127.0.0.1:8765',
  'https://fishese.github.io',   // GitHub Pages (origin only — no path or trailing slash)
];

const DAILY_CAP = 2500;          // hard stop below Geoapify's 3000/day free tier
const GEOAPIFY_PLACES = 'https://api.geoapify.com/v2/places';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin_not_allowed' }, 403, cors);

    const url = new URL(request.url);
    if (url.pathname !== '/places') return json({ error: 'not_found' }, 404, cors);
    if (!env.GEOAPIFY_KEY) return json({ error: 'server_misconfigured' }, 500, cors);

    // Optional hard daily cap (requires a KV namespace bound as COUNTER).
    if (env.COUNTER) {
      const day = new Date().toISOString().slice(0, 10);
      const k = `count:${day}`;
      const n = parseInt((await env.COUNTER.get(k)) || '0', 10);
      if (n >= DAILY_CAP) return json({ error: 'daily_limit_reached' }, 429, cors);
      ctx.waitUntil(env.COUNTER.put(k, String(n + 1), { expirationTtl: 172800 }));
    }

    // Whitelist and forward only the parameters we expect.
    const categories = url.searchParams.get('categories') || '';
    const filter = url.searchParams.get('filter') || '';
    const bias = url.searchParams.get('bias') || '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
    if (!categories || !filter) return json({ error: 'missing_params' }, 400, cors);

    const gu = new URL(GEOAPIFY_PLACES);
    gu.searchParams.set('categories', categories);
    gu.searchParams.set('filter', filter);
    if (bias) gu.searchParams.set('bias', bias);
    gu.searchParams.set('limit', String(limit));
    gu.searchParams.set('apiKey', env.GEOAPIFY_KEY);

    let upstream;
    try {
      upstream = await fetch(gu.toString(), { headers: { Accept: 'application/json' } });
    } catch (e) {
      return json({ error: 'upstream_unreachable' }, 502, cors);
    }
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
