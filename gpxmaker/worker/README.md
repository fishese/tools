# GPX Maker — Geoapify proxy (Cloudflare Worker)

This tiny Worker lets "Find by place → Local gems" use Geoapify **without ever
putting the API key in the web page**. The key lives as a Cloudflare secret, the
Worker only answers requests from your own site, and it can hard-stop at a daily
cap so it never costs money.

Famous landmarks do **not** use this — they use free, keyless Wikidata.

## What you need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A free [Geoapify API key](https://www.geoapify.com/)
- Node.js installed (for the `wrangler` CLI)

## 1. Configure allowed origins

Edit `src/index.js` and add your GitHub Pages origin to `ALLOWED_ORIGINS`, e.g.:

```js
const ALLOWED_ORIGINS = [
  'http://localhost:8765',
  'https://YOURNAME.github.io',
];
```

Use just the origin (scheme + host), no path. If you use a custom domain, add that instead.

## 2. Deploy

From this `worker/` folder:

```bash
npx wrangler login              # opens a browser to authorize Cloudflare
npx wrangler secret put GEOAPIFY_KEY   # paste your Geoapify key when prompted
npx wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.
`https://gpx-poi-proxy.YOURNAME.workers.dev`.

## 3. Point the web app at it

In `index.html`, set the constant near the top of the discover script:

```js
const GEOAPIFY_PROXY = 'https://gpx-poi-proxy.YOURNAME.workers.dev';
```

That's it — everyone using your site now gets Geoapify-powered local gems, with
the key safely on the server. (Visitors can also paste a proxy URL in the app's
"Local gems source" settings instead of hardcoding it.)

## 4. (Optional) Hard daily cap

Geoapify's free tier already stops at 3,000 requests/day at no cost. To also cap
usage at the Worker itself (e.g. to protect against abuse of the Worker):

```bash
npx wrangler kv namespace create COUNTER
```

Uncomment the `[[kv_namespaces]]` block in `wrangler.toml`, paste the returned
`id`, adjust `DAILY_CAP` in `src/index.js` if you like, then `npx wrangler deploy`
again. When the cap is hit the Worker returns HTTP 429 and the app automatically
falls back to OpenStreetMap.

## Local testing

```bash
# put your key in worker/.dev.vars (gitignored):  GEOAPIFY_KEY=xxxxx
npx wrangler dev --port 8787
```

Then set the app's proxy URL to `http://127.0.0.1:8787` (in settings or the
constant) while serving `index.html` from `http://localhost:8765`.

## Endpoint

```
GET /places?categories=<csv>&filter=circle:<lon>,<lat>,<meters>&bias=proximity:<lon>,<lat>&limit=<n>
```

Only these parameters are forwarded; the Worker injects the API key. Any other
path returns 404.
