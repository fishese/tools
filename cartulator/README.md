# Cartulator — Details

*Shopping discount calculator. Names by language: Cartulator (EN) · 篤數機 (繁/HK) · カゴ計 (JA).*

The app is `index.html` — a self-contained page (all logic, styling, and translations inline, no build step). It works fully offline if you just open it in any browser. For an **installable** offline web app (home-screen icon, runs standalone), it ships with a few companion files and must be served over HTTPS:

```
index.html              the app
calc.js                 pricing + promo math (shared with tests)
calc.test.js            node assert tests for calc.js
manifest.webmanifest    PWA metadata (name, icons, theme)
sw.js                   service worker (offline caching)
icons/                  app icons (192/512 + maskable, apple-touch, favicon)
```

Put the folder in a static host (e.g. GitHub Pages: `yourrepo/tools/discount-calculator/`) and the folder URL serves `index.html` directly. "Add to Home Screen" on a phone then installs it for offline use.

## What it does

Lets you tally a shopping trip quickly while standing in the store, and see in real time how much a supermarket deal saves you. You type prices into a big text box, describe the deal, and the totals update as you go. You can track several deals at once (e.g. a fruit deal and a separate personal-care deal), each in its own category.

## How to use it

1. Open `index.html` in a browser (or visit the hosted URL).
2. In a category's **Items** box, type one price per line.
3. Optionally open **Buy X get Y** under the items box, and set **Sets** in the category header.
4. Fill in **the deal** for that category (where it starts, % off / $ off / 折, and whether $ off repeats).
5. Read the live tally for that category, and the grand total across all categories at the top.
6. Optionally add an **Extra off whole order** (% off or 折) in the top bar, add more categories, export to Excel, or copy a summary.

## Price parsing rules

Each line is read independently:

- Uses the **first number** on the line. Item names and extra words are ignored.
- If a multiplication **leads the line** (`a * b`, also accepts `a x b`), it multiplies the two numbers. It must be at the start, so pack sizes / dimensions that appear after the price (e.g. `20 2x500ml water`, `15 5x7 frame`) are *not* multiplied — those read as 20 and 15.
- Blank lines and lines with no number are skipped.

Examples (each counts as 20):

```
20
20 cookies
10 * 2
10 * 2 cola
20 for two kiwi
```

Decimals work too (`3.50 milk` = 3.50).

## Deal types and math

Each category has a **set quantity** (default 1) that multiplies the items sum, optional **buy X get Y free** under the items box, and exactly one threshold deal.

Discount types in the deal dropdown:

- **% off** — a percentage off. Non-recurring (recurrence toggle hidden).
- **$ off** — a fixed amount off. Can be one-time or recurring.
- **折 / % pay** — Chinese/Japanese 成-scale pay rate: enter `7` for 7折 (pay 70%), `8.8` for 88折 (pay 88%). Non-recurring.

**Set quantity:** always multiplies the category items total (`S × sets`).

**Buy X get Y free** (collapsed under items): treats the category line items as one set’s contents. `sets` = how many sets you pay for. Enabling BXGY sets set count to X once (manual edits stick; warns if set count is not a multiple of X). Free sets = `floor(sets / X) × Y`. Pay before other deals = `sets × S`; goods value = `(sets + free) × S`.

**Stacking order:** set qty → BXGY → category threshold deal → whole-order extra (% off or 折).

**Non-recurring** (`Deal starts at`): once the post-BXGY pay amount reaches the threshold, the discount applies once.
- % off: `saved = amount × value%`
- $ off: `saved = value`
- 折: `saved = amount × (1 − value/10)`

**Recurring $ off** (`Spend per discount`): the discount applies once for every full bracket of spend on the post-BXGY pay amount.
- `milestones = floor(amount / threshold)`
- `saved = milestones × value`
- Example: "$10 off every $200" at $650 → 3 milestones → saved $30.
- The "amount over" shown is measured from the **previous milestone**, not the first threshold (at $250 with a $100 bracket it shows +$50, not +$150).

**Extra off whole order** (grand-total level): applied *after* each category’s own discount, to the combined remaining total. Type can be **% off** or **折 / % pay**.
- Grand "Total saved" = category savings (including BXGY) + extraSaved.
- Example: $60 of items with a 10% category deal → $6 saved, $54 remaining; a 5% whole-order extra → $2.70 more → total saved $8.70, total to pay $51.30.

## The tally (per category)

- Original total
- Distance to the deal start point ("$X to go" if short; "reached" + amount over once met)
  - For % deals, no "amount over" is shown — just "reached".
- Discount applied and total after discount (once the deal is met)
- For recurring deals: how much is left toward the next milestone, a progress bar, and milestones reached so far

## Features

- **Multiple categories** — "+ Add another deal / category" creates an independent box + deal + tally. Removing a category that still has items asks for confirmation.
- **Auto-expanding item box** — grows as you type. When focus leaves a category, it collapses to the first **15 rows** with a fading "+ N more" overlay, and expands again when you click back in.
- **Export to Excel** — downloads a UTF-8 CSV (opens directly in Excel) with one row per category, the full list of items entered, and grand-total rows including any whole-order extra discount.
- **Copy summary** — copies a plain-text summary (per-category and grand totals: total spend, total saved, total to pay) to the clipboard.
- **Languages** — English, 繁體中文（香港）, and 日本語, switched from a small `EN | 繁 | 日` segmented control in the top-right corner. The whole UI, tally, toasts, confirmation dialog, and export/summary headers translate. The choice is remembered via `localStorage`.
- **Dark / light theme** — a sun/moon toggle in the top-right corner. Defaults to the system preference (`prefers-color-scheme`); once you pick one it's saved and overrides the system. Resolved before paint to avoid a flash.
- **Saved automatically** — all categories, deals, and the extra % are persisted to `localStorage`, so a refresh or reopen restores your trip. A **Clear all** button wipes it and starts fresh (with confirmation).
- **Accessible** — inputs are linked to labels, the toast is an `aria-live` region, keyboard focus rings are visible, and the toggle is fully labelled.

## Conventions / notes

- Currency is shown as `$` in all languages by design (deals are dollar-based; the meaning is clear regardless of language).
- Persisted in `localStorage`: the shopping data (`sdc_data`), language (`sdc_lang`), and theme (`sdc_theme`). Nothing is uploaded.
- The export filename is `shopping-tally.csv`.

## Implementation notes (for future edits)

- `index.html` is HTML + CSS + vanilla JS; `calc.js` holds pricing/promo math; `manifest.webmanifest` + `sw.js` + `icons/` make it an installable PWA.
- Translations live in the `I18N` object (`en`, `zh-HK`, `ja`); dynamic strings are functions. Add a language by adding a key there plus a `<button data-lang="…">` in `#langSeg`.
- `parseLineValue` / `sumItems` handle parsing; `CartulatorCalc.computeCategory` / `computeExtra` handle deals; UI `totals()` aggregates.
- `t(key, ...args)` is the translation lookup; `applyStatic()` sets the static chrome; `render()` rebuilds the category cards; `save()` / `load()` persist state (with migration for older saves).
- Theme: CSS custom properties on `:root`, with a light palette under `:root[data-theme="light"]` and `@media (prefers-color-scheme: light) :root:not([data-theme="dark"])`. `setTheme()` flips `data-theme`, the `themeColor` meta, and the icon.
- Collapse threshold is the `COLLAPSE_ROWS` constant (currently 15).
- Offline: cartulator SW cache `sdc-v3` precaches `index.html` + `calc.js` and falls back to `index.html` on navigate when offline. The repo-root sushi-split SW must not delete non-`sushi-split-*` caches.
- **Editing note:** the in-app file editors truncate very large writes on this file; append/repair via the shell instead, and keep the `<script>` blocks balanced.
- Verified with `node calc.test.js` for pricing/promo math (zhe, set qty, BXGY, stacking, migration).
