# How the Geoapify proxy and Cloudflare Worker work (GPX Maker)

This guide explains the pattern used in GPX Maker so you can reuse it on your next project. It is written for someone who has built static web pages before but has not used a proxy or Cloudflare Workers yet.

---

## The problem we solved

GPX Maker is a **static site** (one `index.html` file on GitHub Pages). Anyone can view its source and network traffic.

Geoapify (like Google Maps, Stripe, etc.) needs an **API key** on every request. If you put that key in `index.html`:

```javascript
// BAD for a public app — anyone can copy this and burn your quota
fetch('https://api.geoapify.com/v2/places?...&apiKey=YOUR_SECRET_KEY')
```

Anyone could copy the key from DevTools → Network and use it from their own scripts. You pay (or hit the free limit) for their traffic.

**Famous landmarks** in GPX Maker avoid this entirely: they use Wikidata, which is free and needs no key.

**Local gems** need richer place data, so we use Geoapify — but only through a **proxy** that holds the key on the server.

---

## Big picture: three pieces

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  Browser            │         │  Your Cloudflare     │         │  Geoapify       │
│  (GitHub Pages)     │         │  Worker (proxy)      │         │  API            │
│                     │         │                      │         │                 │
│  index.html         │  GET    │  gpx-poi-proxy       │  GET    │  api.geoapify   │
│  no API key         │ ──────► │  + GEOAPIFY_KEY      │ ──────► │  .com/v2/places │
│                     │ /places │  (secret)            │ + key   │                 │
└─────────────────────┘         └──────────────────────┘         └─────────────────┘
     Origin:                         Checks Origin is              Never talks to
     https://fishese.github.io        on allowlist                  the browser
```

| Piece | What it is | In this project |
|-------|------------|-----------------|
| **Frontend** | HTML/JS in the user's browser | `gpxmaker/index.html` on GitHub Pages |
| **Proxy** | A small server that forwards requests and adds the secret | Cloudflare Worker at `gpx-poi-proxy.fishese.workers.dev` |
| **Upstream API** | The real data provider | Geoapify Places API |

The browser never sees `GEOAPIFY_KEY`. It only knows your Worker URL.

---

## What is a “proxy”?

A **proxy** sits between the client and the real API:

1. The browser asks **your** server: “give me places near Tokyo.”
2. Your server asks **Geoapify**: same question, plus your API key.
3. Your server returns Geoapify’s JSON to the browser.

You control the proxy, so you can:

- **Hide secrets** — key stays in Cloudflare, not in git or HTML.
- **Restrict who can call it** — only your GitHub Pages origin.
- **Limit abuse** — cap requests per day, allow only certain query parameters.
- **Change providers later** — swap Geoapify for something else without changing the whole app.

---

## What is a Cloudflare Worker?

A **Worker** is a tiny JavaScript program that runs on Cloudflare’s edge network (data centres worldwide), not on your laptop or a VPS.

- **No server to manage** — you upload `index.js`, Cloudflare runs it.
- **Free tier** is generous for small tools (100k requests/day on Workers free plan).
- **Fast cold starts** — good for “one `fetch` and return JSON” proxies like ours.
- **Secrets** — `wrangler secret put GEOAPIFY_KEY` stores the key encrypted; it appears as `env.GEOAPIFY_KEY` in code.

Config file: `gpxmaker/worker/wrangler.toml`

```toml
name = "gpx-poi-proxy"          # → https://gpx-poi-proxy.fishese.workers.dev
main = "src/index.js"
compatibility_date = "2024-11-01"
```

Deploy from the `worker/` folder:

```bash
npx wrangler login
npx wrangler secret put GEOAPIFY_KEY   # paste key once; never commit it
npx wrangler deploy
```

Local dev uses `worker/.dev.vars` (gitignored):

```
GEOAPIFY_KEY=your_key_here
```

```bash
npx wrangler dev --port 8787
```

---

## Request flow (step by step)

When a user clicks **Find POIs** with **Local gems** selected:

### 1. Frontend builds a safe URL (no key)

From `index.html` — the app only talks to **your** Worker:

```javascript
const GEOAPIFY_PROXY = 'https://gpx-poi-proxy.fishese.workers.dev';

async function geoapifyPlaces(place, cats, limit) {
  const proxy = geoapifyProxy();  // constant or localStorage override
  if (!proxy) return null;

  const radM = Math.max(1, Math.min(10, radiusKmFromBbox(place.bbox))) * 1000;
  const gcats = [...new Set(cats.flatMap(c => (GEOAPIFY_CATS[c] || '').split(',')).filter(Boolean))];
  const filter = `circle:${place.lon},${place.lat},${radM}`;
  const bias = `proximity:${place.lon},${place.lat}`;

  const url = `${proxy}/places?categories=${encodeURIComponent(gcats.join(','))}`
    + `&filter=${encodeURIComponent(filter)}`
    + `&bias=${encodeURIComponent(bias)}`
    + `&limit=${Math.min(100, limit)}`;

  const r = await fetch(url);   // browser sends Origin: https://fishese.github.io
  // ... handle 403, 429, parse JSON into POI list
}
```

Example request the browser actually makes:

```
GET https://gpx-poi-proxy.fishese.workers.dev/places
  ?categories=tourism.sights,catering.restaurant,catering.cafe
  &filter=circle:139.77,35.68,5000
  &bias=proximity:139.77,35.68
  &limit=60
Origin: https://fishese.github.io
```

Note: **no `apiKey` parameter** in the browser request.

### 2. Worker validates and forwards

From `worker/src/index.js`:

```javascript
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight (browser sends OPTIONS before GET from another domain)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // Only your site may use this proxy
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'origin_not_allowed' }, 403, corsHeaders(origin));
    }

    const url = new URL(request.url);
    if (url.pathname !== '/places') return json({ error: 'not_found' }, 404, corsHeaders(origin));

    // Read only parameters we expect (whitelist — stops ?apiKey=evil or random junk)
    const categories = url.searchParams.get('categories') || '';
    const filter = url.searchParams.get('filter') || '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10), 1), 100);

    // Build the real Geoapify URL and inject the secret here
    const gu = new URL('https://api.geoapify.com/v2/places');
    gu.searchParams.set('categories', categories);
    gu.searchParams.set('filter', filter);
    gu.searchParams.set('limit', String(limit));
    gu.searchParams.set('apiKey', env.GEOAPIFY_KEY);   // ← only exists on the server

    const upstream = await fetch(gu.toString());
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  },
};
```

### 3. Frontend turns JSON into map points

Geoapify returns GeoJSON (`features[]`). The app maps each feature to `{ name, lat, lon, category }` and shows checkboxes. Selected rows are pushed into the same `points` array used for jump routes and walking paths.

Orchestration when **Local gems** is selected:

```javascript
if (useGeo) {
  setDiscStatus('Searching Geoapify…');
  const gp = await geoapifyPlaces(place, cats, count * 4);
  if (gp) { pois = gp; usedGeoapify = true; }
}
// OpenStreetMap only as fallback or for custom comma-separated terms
if (!usedGeoapify || customTerms.length) {
  const osm = await gemsViaOverpass(place, cats, customTerms);
  pois = usedGeoapify ? dedupePois(pois.concat(osm)) : osm;
}
ranked = rankGems(pois);
```

---

## CORS — why the Worker mentions `Origin`

Browsers enforce **CORS**: JavaScript on `https://fishese.github.io` cannot read responses from `https://gpx-poi-proxy.fishese.workers.dev` unless that server explicitly allows it.

The Worker returns:

```http
Access-Control-Allow-Origin: https://fishese.github.io
Access-Control-Allow-Methods: GET,OPTIONS
```

Important details:

- Use the **origin only** in `ALLOWED_ORIGINS` — no path, no trailing slash.
  - Correct: `https://fishese.github.io`
  - Wrong: `https://fishese.github.io/tools/gpxmaker/`
- The path `/tools/gpxmaker/` is only where the HTML file lives; the browser’s `Origin` header is still just the host.

Before a `GET`, the browser may send **OPTIONS** (a “preflight”). The Worker answers `204` with the same CORS headers so the real `GET` is allowed.

---

## Security layers in this project

| Layer | What it does |
|-------|----------------|
| **Secret, not in git** | `GEOAPIFY_KEY` via `wrangler secret put`; `geoapify_key.txt` and `.dev.vars` in `.gitignore` |
| **Origin allowlist** | `ALLOWED_ORIGINS` — random sites get `403 origin_not_allowed` |
| **Path allowlist** | Only `/places` is implemented; everything else is `404` |
| **Parameter whitelist** | Worker forwards `categories`, `filter`, `bias`, `limit` only — not arbitrary Geoapify params |
| **Limit cap** | `limit` clamped to 1–100 per request |
| **Optional daily cap** | Commented KV block in `wrangler.toml` can stop at 2,500 requests/day |
| **Graceful fallback** | If proxy fails or returns 429, the app falls back to OpenStreetMap |

This does **not** stop a determined attacker from calling your Worker if they spoof `Origin` (that header can be faked outside a browser). For a personal tools site, origin checking + daily cap is usually enough. For high-value APIs, add rate limiting per IP or require signed tokens.

---

## What lives where (file map)

```
tools/                          ← GitHub repo (fishese/tools)
├── gpxmaker/
│   ├── index.html              ← App; GEOAPIFY_PROXY points at Worker
│   ├── .gitignore              ← Ignores keys, .dev.vars, .wrangler
│   └── worker/
│       ├── wrangler.toml       ← Worker name & config
│       ├── README.md           ← Deploy cheat sheet
│       ├── .dev.vars           ← Local only (NOT in git)
│       └── src/
│           └── index.js        ← Proxy logic
```

**Live URLs**

| URL | Role |
|-----|------|
| `https://fishese.github.io/tools/gpxmaker/` | Static app (GitHub Pages) |
| `https://gpx-poi-proxy.fishese.workers.dev/places?...` | Proxy endpoint |

---

## Commands cheat sheet

```bash
# One-time setup
cd gpxmaker/worker
npx wrangler login
npx wrangler secret put GEOAPIFY_KEY

# Deploy after editing worker/src/index.js (e.g. new ALLOWED_ORIGINS)
npx wrangler deploy

# Local test: Worker on :8787, static site on :8765
npx wrangler dev --port 8787
# In another terminal:
python -m http.server 8765
# Open http://localhost:8765/gpxmaker/index.html
# (localhost:8765 is already in ALLOWED_ORIGINS)
```

---

## Adapting this pattern next time

1. **Pick an upstream API** (Geoapify, OpenWeather, etc.).
2. **Write a thin Worker** that:
   - Accepts only the query shape your frontend needs.
   - Adds the API key from `env.YOUR_SECRET`.
   - Returns JSON with CORS headers for your site’s origin.
3. **Frontend** calls `https://your-worker.workers.dev/your-route?...` — never the upstream URL with a key.
4. **Store secrets** with `wrangler secret put`, never in git or HTML.
5. **Deploy** with `wrangler deploy`; put the Worker URL in your app config.

Minimal Worker template:

```javascript
const ALLOWED_ORIGINS = ['https://yourname.github.io'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });

    const upstream = await fetch('https://api.example.com/data?key=' + env.API_KEY);
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
```

---

## Related reading

- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Geoapify Places API](https://apidocs.geoapify.com/docs/places/)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

*This document describes the GPX Maker setup as of the initial Cloudflare deploy to `gpx-poi-proxy.fishese.workers.dev`.*
