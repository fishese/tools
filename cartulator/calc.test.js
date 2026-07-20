'use strict';
var assert = require('assert');
var C = require('./calc.js');

function approx(a, b, msg) {
  assert.strictEqual(C.round2(a), C.round2(b), msg || (a + ' !== ' + b));
}

// --- quick item entry ---
(function () {
  assert.strictEqual(C.parseLineValue('20'), 20);
  assert.strictEqual(C.parseLineValue('20 cookies'), 20);
  assert.strictEqual(C.parseLineValue('10*2'), 20);
  assert.strictEqual(C.parseLineValue('10x2 cola'), 20);
  assert.strictEqual(C.parseLineValue('20 + 5 snacks'), 25);
  assert.strictEqual(C.parseLineValue('20 - 5 coupon'), 15);
  assert.strictEqual(C.parseLineValue('10 + 2 * 3'), 16);
  assert.strictEqual(C.parseLineValue('20 2x500ml water'), 20);
  var items = C.sumItems('20\n20 cookies\n10*2\n10x2 cola\n20 + 5 snacks\n20 - 5 coupon');
  assert.strictEqual(items.count, 6);
  assert.strictEqual(items.total, 120);
})();

// --- zhe ---
(function () {
  var p = C.computePromo(100, { threshold: 1, type: 'zhe', value: 7, recurring: false });
  assert.strictEqual(p.qualified, true);
  approx(p.saved, 30);
  approx(p.final, 70);
})();

(function () {
  var p = C.computePromo(100, { threshold: 1, type: 'zhe', value: 8.8, recurring: false });
  approx(p.final, 88);
})();

(function () {
  var p = C.computePromo(100, { threshold: 1, type: 'zhe', value: 88, recurring: false });
  assert.strictEqual(p.qualified, true);
  approx(p.final, 88);
})();

(function () {
  var p = C.computePromo(100, { threshold: 1, type: 'zhe', value: 85, recurring: false });
  approx(p.saved, 15);
  approx(p.final, 85);
})();

(function () {
  var p = C.computePromo(100, { threshold: 1, type: 'zhe', value: 150, recurring: false });
  assert.strictEqual(p.qualified, false);
  approx(p.final, 100);
})();

// --- percent / fixed still work ---
(function () {
  var p = C.computePromo(200, { threshold: 100, type: 'percent', value: 10, recurring: false });
  approx(p.saved, 20);
  approx(p.final, 180);
})();

(function () {
  var p = C.computePromo(200, { threshold: 100, type: 'fixed', value: 25, recurring: false });
  approx(p.saved, 25);
  approx(p.final, 175);
})();

// --- setQty ---
(function () {
  var pr = C.computePricing({ itemsTotal: 30, setQty: 3, bxgyOn: false });
  approx(pr.payBeforePromo, 90);
  approx(pr.goodsValue, 90);
})();

// --- BXGY beer + chips ---
(function () {
  var pr = C.computePricing({
    itemsTotal: 30, setQty: 2, bxgyOn: true, bxgyBuy: 2, bxgyGet: 1
  });
  approx(pr.payBeforePromo, 60);
  approx(pr.goodsValue, 90);
  approx(pr.bxgySaved, 30);
  assert.strictEqual(pr.freeSets, 1);
  assert.strictEqual(pr.bxgyWarn, false);
})();

// --- non-multiple warning, still computes floor ---
(function () {
  var pr = C.computePricing({
    itemsTotal: 20, setQty: 3, bxgyOn: true, bxgyBuy: 2, bxgyGet: 1
  });
  assert.strictEqual(pr.bxgyWarn, true);
  assert.strictEqual(pr.freeSets, 1);
  approx(pr.payBeforePromo, 60);
  approx(pr.goodsValue, 80);
})();

// --- shampoo example: $20, buy 2 get 1 ---
(function () {
  var cat = C.computeCategory(20, {
    setQty: 2, bxgyOn: true, bxgyBuy: 2, bxgyGet: 1,
    threshold: '', type: 'percent', value: '', recurring: false
  });
  approx(cat.original, 60);
  approx(cat.bxgySaved, 20);
  approx(cat.final, 40);
  approx(cat.final / 3, 13.3333333333); // effective ~13.33; use round2 of final/3
  approx(C.round2(cat.final / 3), 13.33);
})();

// --- stack: BXGY then 10% off on pay ---
(function () {
  var cat = C.computeCategory(30, {
    setQty: 2, bxgyOn: true, bxgyBuy: 2, bxgyGet: 1,
    threshold: 1, type: 'percent', value: 10, recurring: false
  });
  // pay before promo 60, 10% off → 6 saved, final 54; bxgy 30; total saved 36
  approx(cat.promoSaved, 6);
  approx(cat.bxgySaved, 30);
  approx(cat.saved, 36);
  approx(cat.final, 54);
})();

// --- whole-order zhe ---
(function () {
  var x = C.computeExtra(100, { extraType: 'zhe', extraValue: 7 });
  approx(x.extraSaved, 30);
  approx(x.final, 70);
})();

(function () {
  var x = C.computeExtra(100, { extraType: 'zhe', extraValue: 85 });
  approx(x.extraSaved, 15);
  approx(x.final, 85);
})();

(function () {
  var x = C.computeExtra(100, { extraType: 'percent', extraValue: 5 });
  approx(x.extraSaved, 5);
  approx(x.final, 95);
})();

// --- migrate old data ---
(function () {
  var d = C.migrateData({
    state: [{ id: 1, name: 'A', items: '10', threshold: 5, type: 'percent', value: 10, recurring: false }],
    seq: 1,
    extraPct: '5'
  });
  assert.strictEqual(d.extraType, 'percent');
  assert.strictEqual(d.extraValue, '5');
  assert.strictEqual(d.extraEnabled, true);
  assert.strictEqual(d.state[0].setQty, 1);
  assert.strictEqual(d.state[0].bxgyOn, false);
  assert.strictEqual(d.state[0].type, 'percent');
})();

(function () {
  var d = C.migrateData({ state: [{ id: 1 }] });
  assert.strictEqual(d.extraType, 'zhe');
  assert.strictEqual(d.extraEnabled, false);
})();

(function () {
  var g = C.migrateGroup({ id: 2, type: 'zhe', value: 7, setQty: 2, bxgyOn: true, bxgyBuy: 2, bxgyGet: 1 });
  assert.strictEqual(g.type, 'zhe');
  assert.strictEqual(g.setQty, 2);
  assert.strictEqual(g.bxgyOn, true);
})();

console.log('All calc tests passed.');
