# Hose Retainer Name Engraver — self-hosted package

A small client-side tool: type a name, get a live 3D preview, download a
print-ready STL with that name engraved on the nameplate. Everything runs
in the browser — no server-side code, no build step, no external network
calls once the page is loaded (Three.js is bundled locally).

## Files

- `index.html` — the page itself (structure, styling, all the logic)
- `carrier-data.js` — the precomputed base part, embedded as a base64 STL
  (this is the big file — ~1.1MB)
- `three.min.js` — Three.js r128, used for the 3D preview only

All three files must stay together in the same folder. `index.html` loads
the other two via plain `<script src="...">` tags.

## Hosting it

**Any static file host works** — this has no server-side dependency at all:

- Drop the folder on any static host: GitHub Pages, Netlify, Vercel,
  Cloudflare Pages, S3 + CloudFront, an nginx/Apache document root, etc.
- Or run it locally for testing: `python3 -m http.server` from inside the
  folder, then open `http://localhost:8000`.
- Or just double-click `index.html` to open it directly from disk — this
  works in most browsers for this setup, since all three files load as
  plain scripts (no `fetch()`, no ES modules, nothing that triggers the
  stricter `file://` restrictions some tools run into).

## Editing

- **Appearance settings are now built into the page.** Click "Appearance
  settings" to adjust:
  - **Font** — a curated cross-platform list, auto-filtered down to fonts
    actually detected as installed via a canvas-metrics check. There's also
    a "Try my installed fonts" button that uses the real Local Font Access
    API (Chrome/Edge only, asks permission) for your exact system font list
    where supported.
  - **Bold** toggle
  - **Engrave depth** (0.2–3mm)
  - **Edge margin** (1–8mm, how far text stays from the reserved rectangle's
    edge)

  These are all safe to change freely — none of them touch the carrier's
  geometry, only how the nameplate patch is generated on top of it.

- **The reserved nameplate rectangle itself (position/size) and the grid
  resolution are NOT exposed in the UI**, and shouldn't be hand-edited in
  the constants at the top of `index.html` either. The carrier has that
  exact rectangle boundary pre-cut into it at that exact grid spacing —
  changing either in the page without regenerating `carrier-data.js` to
  match will misalign the two and produce a non-watertight model. If you
  want a different reserved area, ask Claude to regenerate the carrier
  with new bounds (a real CAD step, not something this page can do alone).
- **Change the font list**: edit the `CURATED_FONTS` array near the top of
  the `<script>` block.
- **Swap Three.js for a CDN copy**: replace the `three.min.js` script tag
  with e.g. `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
  if you'd rather not vendor it.

## How it works, briefly

`carrier-data.js` holds the full part — fillets, serration, slot, correct
length — as a binary STL, base64-encoded, with one rectangular window left
open on the nameplate face (built with a real CAD boolean, not a hack, so
its boundary is a clean, precise rectangle). On every keystroke, the page:

1. Rasterizes the typed name onto an offscreen canvas with the browser's
   own bold sans-serif rendering.
2. Walks a fine grid across the reserved rectangle, sampling that raster to
   decide, per grid point, whether it's inside a letter (recessed 0.9mm)
   or background (flush with the surface).
3. Triangulates that grid and stitches it into the carrier's window —
   vertex-for-vertex exact, since both were built against the same
   rectangle bounds and grid spacing.
4. Hands the combined mesh to Three.js for the live preview, and writes it
   out as a binary STL on download.

The camera in the preview is deliberately pinned to a specific up-vector —
this isn't arbitrary; it's the orientation that keeps the engraving reading
correctly (not mirrored) when viewed from the part's outward-facing side.
If you fork this and add free camera rotation beyond the built-in
drag-to-orbit, keep in mind the *exported STL* is unaffected either way —
only the on-screen camera angle can make correctly-engraved text look wrong
at a glance.

## Attribution

The base geometry this tool customizes is modified from
[Scuba Long Hose Retainer](https://www.thingiverse.com/thing:5394977) by
henryci on Thingiverse. The attribution is also shown in the page footer.
