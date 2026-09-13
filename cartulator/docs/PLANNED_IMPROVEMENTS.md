# Planned Improvements

This note captures the next useful expansion for Cartulator while keeping its current fast, offline, in-store workflow.

## Goal

Extend Cartulator beyond simple threshold discounts so it can answer two common shopping questions:

1. **What does this awkward promotion actually cost me?**
2. **Is it worth adding more items just to trigger the next discount?**

The app should continue to work fully offline and keep the current quick-entry workflow.

## Phase 1 — Threshold value / “should I add more?” guidance

Cartulator already knows the current spend, the next threshold, and the discount. Use that information to show the *net cost of reaching the deal*.

### Example

Current eligible spend: `$188`

Promotion: `$10 off at $200`

Cartulator should be able to say something equivalent to:

> Spend $12 more to unlock $10 off. Your extra $12 of goods effectively costs $2.

For percentage or pay-rate discounts, calculate the same idea using the incremental discount created by crossing the threshold.

### Suggested values to calculate

For the next applicable threshold:

- amount still required;
- discount before adding anything;
- discount after reaching the threshold;
- incremental discount unlocked;
- effective net cost of the required extra spend;
- effective percentage saved on those additional goods.

For recurring fixed discounts, calculate against the **next milestone**, not only the first one.

### Important cases

The guidance should distinguish between:

- **profitable / effectively free threshold crossing** — incremental discount is equal to or greater than the extra spend;
- **cheap add-on** — e.g. spend $12 more and effectively pay $2;
- **ordinary threshold** — useful but not exceptional;
- **not applicable** — percentage deals that are already active with no further threshold benefit, or configurations where there is no next milestone.

It should never tell the user they are “saving” money by buying something unnecessary. Wording should stay mathematical, e.g. `If you planned to buy more, reaching the next threshold would...`.

### Interaction with whole-order discount

The first implementation can calculate threshold value using the category promotion alone.

A later enhancement may optionally include the whole-order discount, but only if the UI clearly explains that the extra item also receives that discount. Avoid making the basic result hard to understand.

## Phase 2 — More real-world promotion types

Add promotion types one at a time to the shared calculation module (`calc.js`) with tests before adding UI controls.

### Second item X% off

Examples:

- second item 50% off;
- second item 30% off;
- second item free.

Recommended rule: group eligible items into pairs and apply the discount to the cheaper item in each pair unless the user explicitly chooses another rule.

The UI should make the “cheaper item” assumption visible.

### N for $X

Examples:

- 3 for $20;
- 2 for $15.

For each complete group of N eligible items, charge the bundle price. Leftover items use normal prices.

If individual item prices differ, the first implementation should either:

- group in entered order; or
- explicitly offer a `best price` mode.

Do not silently choose an optimization rule without showing it.

### Cheapest item free

Examples:

- buy 2 get the cheapest free;
- buy 3, cheapest item free.

Unlike the current set-based BXGY behavior, this should work on individual entered item prices and identify the cheapest eligible item in each group.

### Mix-and-match bundle

Potential later variant:

- any 3 selected items for $X;
- buy any 4, save $Y.

This is useful but can wait until the simpler bundle logic is stable.

## Suggested data-model direction

Avoid continuing to add unrelated fields directly to a category object for every promotion.

Consider a promotion structure such as:

```js
{
  type: "threshold-fixed",
  threshold: 200,
  value: 10,
  recurring: true
}
```

Other examples could use types such as:

- `threshold-percent`
- `threshold-pay-rate`
- `second-item-percent`
- `bundle-price`
- `cheapest-free`

Existing saved data should migrate automatically and preserve current behavior.

The calculation module should remain independent from the UI so every promotion can be regression-tested directly.

## UI principles

Cartulator is useful because it is quick while standing in a shop. New promotion support should not turn each category into a form full of controls.

Suggested approach:

- keep one compact `Deal type` selector;
- reveal only fields required by that deal;
- hide advanced assumptions under a small expandable section;
- keep the current item-entry box as the main interaction;
- show threshold-value guidance near the existing progress / “$X to go” display.

## Suggested implementation order

1. Add threshold-value calculation to `calc.js` with tests.
2. Add the “effective cost to reach next deal” UI.
3. Add `second item X% off`.
4. Add `N for $X`.
5. Add individual-item `cheapest free` promotion.
6. Revisit the promotion data model and migrate old saves if needed before adding more deal types.

If the data-model refactor is clearly necessary, it can move before steps 3–5, but Phase 1 should remain small enough to implement without a broad rewrite.

## Acceptance criteria

### Threshold guidance

Tests should cover at least:

- `$188` toward `$10 off $200` → `$12` required, `$10` incremental discount, `$2` net extra cost;
- recurring `$10 off every $100` at `$250` → guidance targets `$300`, not `$100`;
- already-active one-time percentage discount → no misleading “next threshold” result;
- exact-threshold spend → zero amount required;
- whole-order discount does not silently alter Phase 1 guidance;
- values never become negative because of rounding errors.

### Promotion types

Each new type should test:

- exact complete groups;
- leftover items;
- different item prices;
- decimal prices;
- interaction with category quantity / sets where applicable;
- interaction with the existing whole-order discount;
- save/load migration and restored totals.

## Non-goals for this update

- retailer-specific promotion scraping;
- barcode/product databases;
- online price lookup;
- automatically recommending unnecessary purchases;
- trying to optimize an entire basket across multiple overlapping retailer promotions in the first version.

The intended product remains a fast offline calculator, not a supermarket pricing engine.
