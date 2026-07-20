/**
 * Cartulator pricing + promo math (Approach 2 layers).
 * Spec: docs/superpowers/specs/2026-07-13-discounts-bxgy-offline-pwa-design.md
 */
(function (root) {
  'use strict';

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function normalizeSetQty(q) {
    var n = parseFloat(q);
    if (isNaN(n) || n < 1) return 1;
    return n;
  }

  /**
   * Read a quick-entry price from the beginning of one line. Supports notes
   * after the expression, and +, -, *, and x with normal multiplication
   * precedence. A later pack size such as "20 2x500ml" is not treated as math.
   */
  function parseLineValue(line) {
    if (line == null) return null;
    var s = String(line).trim();
    if (!s) return null;

    var pos = 0;
    function readNumber() {
      var m = s.slice(pos).match(/^\d+(?:\.\d+)?/);
      if (!m) return null;
      pos += m[0].length;
      return parseFloat(m[0]);
    }
    function skipSpace() {
      while (pos < s.length && /\s/.test(s.charAt(pos))) pos++;
    }

    var first = readNumber();
    if (first == null) return null;

    var total = 0;
    var term = first;
    var sign = 1;
    while (pos < s.length) {
      skipSpace();
      var op = s.charAt(pos);
      if (op !== '+' && op !== '-' && op !== '*' && op.toLowerCase() !== 'x') break;
      pos++;
      skipSpace();
      var next = readNumber();
      if (next == null) break;

      if (op === '*' || op.toLowerCase() === 'x') {
        term *= next;
      } else {
        total += sign * term;
        term = next;
        sign = op === '+' ? 1 : -1;
      }
    }
    return total + sign * term;
  }

  function sumItems(text) {
    var total = 0;
    var count = 0;
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (line) {
      var value = parseLineValue(line);
      if (value !== null && !isNaN(value)) {
        total += value;
        count++;
      }
    });
    return { total: total, count: count };
  }

  /**
   * Pricing layer: items sum S × setQty, then BXGY.
   * setQty = number of sets paid for.
   */
  function computePricing(opts) {
    var S = opts.itemsTotal || 0;
    if (S < 0) S = 0;
    var setQty = normalizeSetQty(opts.setQty);
    var bxgyOn = !!opts.bxgyOn;
    var buy = parseFloat(opts.bxgyBuy);
    var get = parseFloat(opts.bxgyGet);
    var freeSets = 0;
    var bxgyWarn = false;

    if (bxgyOn && !isNaN(buy) && buy > 0 && !isNaN(get) && get > 0) {
      freeSets = Math.floor(setQty / buy) * get;
      if (setQty % buy !== 0) bxgyWarn = true;
    }

    var goodsValue = round2((setQty + freeSets) * S);
    var payBeforePromo = round2(setQty * S);
    var bxgySaved = round2(freeSets * S);

    return {
      S: S,
      setQty: setQty,
      freeSets: freeSets,
      goodsValue: goodsValue,
      payBeforePromo: payBeforePromo,
      bxgySaved: bxgySaved,
      bxgyWarn: bxgyWarn
    };
  }

  /**
   * Zhe / % pay → fraction paid.
   * ≤10 = 成 (7 → 0.7, 8.5 → 0.85); >10 up to 100 = already percent (85 → 0.85).
   */
  function zhePayFraction(val) {
    if (isNaN(val) || val <= 0) return null;
    if (val <= 10) return val / 10;
    if (val <= 100) return val / 100;
    return null;
  }

  /**
   * Promo layer: threshold deal on pay-before-promo amount.
   * type: 'percent' | 'fixed' | 'zhe'
   */
  function computePromo(amount, g) {
    var th = parseFloat(g.threshold);
    var val = parseFloat(g.value);
    var type = g.type === 'fixed' ? 'fixed' : (g.type === 'zhe' ? 'zhe' : 'percent');
    var res = {
      saved: 0,
      final: amount,
      qualified: false,
      milestones: 0,
      towardNext: 0,
      leftNext: 0,
      threshold: th
    };

    if (isNaN(th) || th <= 0 || isNaN(val) || val <= 0 || amount <= 0) return res;

    var zheFrac = type === 'zhe' ? zhePayFraction(val) : null;
    if (type === 'zhe' && zheFrac == null) return res;

    if (g.recurring && type === 'fixed') {
      var milestones = Math.floor(amount / th);
      res.milestones = milestones;
      res.qualified = milestones >= 1;
      res.saved = milestones * val;
      res.towardNext = amount - milestones * th;
      res.leftNext = th - res.towardNext;
    } else if (g.recurring && type === 'percent') {
      // legacy: percent was never recurring in UI; keep safe no-op path like old code allowed math
      var ms = Math.floor(amount / th);
      res.milestones = ms;
      res.qualified = ms >= 1;
      res.saved = ms * th * (val / 100);
      res.towardNext = amount - ms * th;
      res.leftNext = th - res.towardNext;
    } else {
      res.qualified = amount >= th;
      if (res.qualified) {
        if (type === 'percent') res.saved = amount * (val / 100);
        else if (type === 'fixed') res.saved = val;
        else if (type === 'zhe') res.saved = amount * (1 - zheFrac);
      }
    }

    if (res.saved > amount) res.saved = amount;
    res.saved = round2(res.saved);
    res.final = round2(amount - res.saved);
    return res;
  }

  function computeCategory(itemsTotal, g) {
    var pricing = computePricing({
      itemsTotal: itemsTotal,
      setQty: g.setQty,
      bxgyOn: g.bxgyOn,
      bxgyBuy: g.bxgyBuy,
      bxgyGet: g.bxgyGet
    });
    var promo = computePromo(pricing.payBeforePromo, g);
    return {
      pricing: pricing,
      promo: promo,
      original: pricing.goodsValue,
      bxgySaved: pricing.bxgySaved,
      promoSaved: promo.saved,
      saved: round2(pricing.bxgySaved + promo.saved),
      final: promo.final,
      qualified: promo.qualified || pricing.bxgySaved > 0,
      bxgyWarn: pricing.bxgyWarn
    };
  }

  function computeExtra(afterCat, opts) {
    var type = opts.extraType === 'zhe' ? 'zhe' : 'percent';
    var val = parseFloat(opts.extraValue);
    if (isNaN(val) || val <= 0 || afterCat <= 0) {
      return { extraSaved: 0, extraValueUsed: 0, final: round2(afterCat) };
    }
    var extraSaved = 0;
    if (type === 'percent') {
      val = Math.max(0, Math.min(100, val));
      extraSaved = round2(afterCat * (val / 100));
    } else {
      var frac = zhePayFraction(val);
      if (frac == null) {
        return { extraSaved: 0, extraValueUsed: val, final: round2(afterCat) };
      }
      extraSaved = round2(afterCat * (1 - frac));
    }
    return {
      extraSaved: extraSaved,
      extraValueUsed: val,
      final: round2(afterCat - extraSaved)
    };
  }

  function migrateGroup(g) {
    if (!g || typeof g !== 'object') g = {};
    var type = g.type;
    if (type !== 'fixed' && type !== 'zhe') type = 'percent';
    var setQty = g.setQty;
    if (setQty == null || setQty === '') setQty = 1;
    return {
      id: g.id,
      name: g.name || '',
      items: g.items || '',
      setQty: setQty,
      bxgyOn: !!g.bxgyOn,
      bxgyBuy: g.bxgyBuy == null ? '' : g.bxgyBuy,
      bxgyGet: g.bxgyGet == null ? '' : g.bxgyGet,
      threshold: g.threshold == null ? '' : g.threshold,
      type: type,
      value: g.value == null ? '' : g.value,
      recurring: !!g.recurring && type === 'fixed',
      dealOpen: !!g.dealOpen
    };
  }

  function migrateData(d) {
    if (!d || typeof d !== 'object') return { state: [], seq: 0, extraType: 'zhe', extraValue: '', extraEnabled: false };
    var extraType = d.extraType === 'percent' ? 'percent' : (d.extraType === 'zhe' ? 'zhe' : (d.extraPct != null ? 'percent' : 'zhe'));
    var extraValue = d.extraValue;
    if (extraValue == null && d.extraPct != null) extraValue = d.extraPct;
    if (extraValue == null) extraValue = '';
    var extraEnabled = typeof d.extraEnabled === 'boolean' ? d.extraEnabled : parseFloat(extraValue) > 0;
    var state = Array.isArray(d.state) ? d.state.map(migrateGroup) : [];
    var seq = d.seq || state.reduce(function (m, g) { return Math.max(m, g.id || 0); }, 0);
    return { state: state, seq: seq, extraType: extraType, extraValue: extraValue, extraEnabled: extraEnabled };
  }

  var api = {
    round2: round2,
    normalizeSetQty: normalizeSetQty,
    parseLineValue: parseLineValue,
    sumItems: sumItems,
    zhePayFraction: zhePayFraction,
    computePricing: computePricing,
    computePromo: computePromo,
    computeCategory: computeCategory,
    computeExtra: computeExtra,
    migrateGroup: migrateGroup,
    migrateData: migrateData
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.CartulatorCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
