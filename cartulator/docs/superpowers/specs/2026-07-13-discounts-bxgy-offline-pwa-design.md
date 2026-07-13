# Cartulator: 折 discount, set quantity, BXGY, offline PWA

**Date:** 2026-07-13  
**Status:** Approved for implementation planning  
**App:** `cartulator/` (vanilla `index.html` + PWA shell)

## Goal

1. Add Chinese/Japanese-style **折** (% pay) discount alongside existing `% off` and `$ off`, for both per-category deals and the whole-order extra.
2. Add a per-category **set quantity** (default 1) that always multiplies the items sum.
3. Add optional **buy X get Y free** per category, stacked under the items box, applied before the threshold deal.
4. Fix blank-page offline PWA behavior in basement / no-network conditions.

## Non-goals

- Per-item BXGY eligibility inside a category (user splits into another category if needed).
- Item-count “do I have a full set of SKUs?” checks.
- Recurring deals for `% off` or `折` (unchanged: recurring remains `$ off` only).
- Build tooling / framework migration.

## Architecture (Approach 2)

Split into two layers inside the existing single-file app (clear functions, not a new package structure):

| Layer | Responsibility |
|--------|----------------|
| **Pricing** | Parse items → `S`; apply `setQty`; apply BXGY |
| **Promo** | Threshold deal (`percent` / `fixed` / `zhe`) on post-BXGY pay amount; then whole-order extra |

Pipeline order (fixed):

1. `S = sum(parsed item prices)`
2. `basePay = S × setQty`
3. If BXGY on: compute free sets and BXGY savings (see Math)
4. Category threshold promo on **post-BXGY pay amount**
5. Whole-order extra on sum of category finals

## Data model

### Category

```js
{
  id, name, items,
  setQty: 1,                 // number ≥ 1 (UI default 1)
  bxgyOn: false,
  bxgyBuy: '',               // X when on
  bxgyGet: '',               // Y when on
  threshold: '',
  type: 'percent' | 'fixed' | 'zhe',
  value: '',
  recurring: false           // only meaningful when type === 'fixed'
}
```

### Whole-order extra

```js
{
  extraType: 'percent' | 'zhe',  // default 'percent'
  extraValue: ''                 // replaces bare “always % off” meaning of extraPct
}
```

**Persistence (`sdc_data`):** save the new fields. On load, migrate old saves:

- missing `setQty` → `1`
- missing BXGY fields → off / empty
- unknown / missing `type` → `'percent'` (existing behavior)
- old `extraPct` only → `extraType: 'percent'`, `extraValue: extraPct`

## Math

### 折 (`zhe` / `% pay`)

User enters **成** scale only (not `88` for 88折 — they enter `8.8`):

- Applies only when `0 < value ≤ 10`; otherwise no zhe discount
- Pay fraction = `value / 10` (e.g. `7` → pay 70%, `8.8` → pay 88%)
- Saved = `amount × (1 - value/10)` when the deal qualifies
- Placeholders/examples use `7` / `8.8`

### Set quantity

- Always active: paid-sets merchandise = `S × setQty`
- `setQty` defaults to `1`; treat empty/invalid as `1` for math

### Buy X get Y free

- Category line items describe **one set’s contents** (price `S`).
- `setQty` = number of sets the user **pays for**.
- On turning `bxgyOn` **on**: if `bxgyBuy` is already a valid positive number, set `setQty = bxgyBuy`. If buy is empty at enable time, leave `setQty` unchanged (user can enable after filling buy, or set qty manually).
- Editing `bxgyBuy` later does **not** reset `setQty`.
- `freeSets = floor(setQty / bxgyBuy) × bxgyGet` (0 if buy/get invalid)
- Goods value (pre-deal “sticker” for received sets) = `(setQty + freeSets) × S`
- Pay before promo = `setQty × S`
- BXGY saved = `freeSets × S`
- If `bxgyOn` and `bxgyBuy > 0` and `setQty % bxgyBuy !== 0`: show a **small warning** (non-blocking)

Example: items `$20` beer + `$10` chips → `S = 30`. Buy 2 get 1, `setQty = 2` → pay `$60`, get 3 sets worth (`$90` goods), BXGY saved `$30`, effective `$20`/set.

### Tally display amounts

- **Original total** (category): goods value = `(setQty + freeSets) × S` (when BXGY off, `freeSets = 0` → `setQty × S`)
- **Discount lines**: BXGY saved (if any), then category promo saved (if any)
- **Total after category deals**: `payBeforePromo − promoSaved` = `setQty × S − promoSaved`
- Grand “before” = sum of category goods values; grand saved = all BXGY + promo + whole-order savings

### Stacking

1. BXGY adjusts pay vs goods value as above  
2. Category promo (`percent` / `fixed` / `zhe` + threshold / recurring rules) applies to **pay before promo** (`setQty × S`)  
3. Whole-order `percent` or `zhe` applies to sum of category finals after step 2  

## UI

### Category header

`[ category name ………… ] [ set qty ] [ Remove ]`

- Compact number input for set quantity; labels: EN “Sets”, zh-HK 「套」, ja 「セット」

### Items column

1. Items textarea (unchanged)
2. Items-read hint
3. **Collapsed disclosure** under the item box for BXGY:
   - Title: EN “Buy X get Y free”, zh-HK 「買X送Y」, ja 「X個買ったらY個無料」
   - When expanded: enable checkbox, Buy / Get inputs
   - Warning if set qty not a multiple of X
   - Projection line when enabled and `S > 0` and buy/get valid (pay total, sets received, effective per-set)

### Deal card (right)

- Threshold + type + amount (existing row)
- Type dropdown adds **`% pay` / `折`** beside `% off` and `$ off`
- Zhe placeholder e.g. `7`; recurring control hidden for `percent` and `zhe`

### Top bar

- Whole-order control becomes **type** (`% off` | `% pay`/`折`) + **value** (not percent-only)

## Export & copy summary

- Include set qty, BXGY when on, and zhe deal text (`7折` / `7% pay` style via i18n)
- Totals must match on-screen pipeline

## Offline PWA fix

### Cartulator `sw.js`

- Bump cache name to `sdc-v3`
- Precache `index.html`, manifest, icons; do not rely on caching `./` alone for navigations
- Fetch strategy: cache-first for same-origin GETs; on miss try network; on failure for **navigations**, always return cached `index.html`
- Ensure `respondWith` never resolves to `undefined`

### Root repo `sw.js` (sushi-split at tools root)

- Today it uses a site-wide default scope and on activate **deletes all caches except `sushi-split-v2`**, which can wipe cartulator’s cache and leave offline navigations uncached → blank page
- Fix as part of this work: stop deleting unrelated caches (only delete own old versions), and/or register with a narrow scope / move SW under sushi-split so it cannot control `cartulator/`

## Testing

Assert (jsdom or small node script, consistent with prior cartulator verification style):

- Zhe: `7` on `$100` qualified → pay `$70`
- Set qty: `S=30`, qty `3` → `$90` before deals
- BXGY: beer+chips example pay `$60` for 3 sets
- Non-multiple warning path does not block math
- Stack: BXGY then category `%`/`$`/`zhe` then whole-order
- Old `sdc_data` without new fields still loads
- SW navigation fallback returns HTML offline (manual or smoke check)

## Files touched

- `cartulator/index.html` — UI, i18n, math, persistence
- `cartulator/sw.js` — offline hardening + cache bump
- `cartulator/README.md` — document new deal types / BXGY / set qty
- `sw.js` (repo root) — stop cross-app cache deletion / narrow impact

## Resolved product decisions

| Topic | Decision |
|--------|----------|
| BXGY vs category deal | Stack: BXGY first, then category promo |
| Mixed SKUs in one category | Whole category is one set; split categories if needed |
| Incomplete “item count” sets | Not used; set qty models paid sets |
| Set qty without BXGY | Always multiplies `S` |
| 折 input | Separate dropdown type; 成 scale only |
| `% off` vs 折 | Separate types; no auto-detect 7 vs 88 |
| BXGY enable → set qty | Auto-set to X once; manual edits stick; warn if not multiple of X |
| Approach | Pricing vs promo layers (Approach 2) |
| BXGY UI placement | Collapsed under items box |
| Zhe UI placement | In discount type dropdown with % off and $ off |
