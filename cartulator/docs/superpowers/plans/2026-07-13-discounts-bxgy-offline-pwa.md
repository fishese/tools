# Cartulator Discounts / BXGY / Offline PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 折 (% pay), set quantity, buy-X-get-Y (stacked under items), and harden offline PWA caching per the approved design spec.

**Architecture:** Extract pure pricing/promo math into `cartulator/calc.js` (Approach 2 layers). `index.html` owns UI/i18n/persistence and calls calc. Harden `cartulator/sw.js` and stop root `sw.js` from deleting foreign caches.

**Tech Stack:** Vanilla HTML/CSS/JS, service workers, Node assert tests (no build step).

**Spec:** `cartulator/docs/superpowers/specs/2026-07-13-discounts-bxgy-offline-pwa-design.md`

---

## File map

| File | Role |
|------|------|
| `cartulator/calc.js` | Pure math: setQty, BXGY, percent/fixed/zhe deals, whole-order extra, migrate helpers |
| `cartulator/calc.test.js` | Node assert tests for calc |
| `cartulator/index.html` | UI, i18n, persistence, wire calc |
| `cartulator/sw.js` | Precache calc.js + hardened offline navigation |
| `sw.js` (repo root) | Only delete own cache prefix; do not wipe cartulator |
| `cartulator/README.md` | Document new behaviors |

---

### Task 1: Pricing / promo calc module + failing tests

**Files:**
- Create: `cartulator/calc.js`
- Create: `cartulator/calc.test.js`

- [x] **Step 1: Write failing tests** covering zhe, setQty, BXGY beer/chips, non-multiple freeSets, stack order, migrateDefaults
- [x] **Step 2: Run tests — expect FAIL** (`node cartulator/calc.test.js`)
- [x] **Step 3: Implement `calc.js`**
- [x] **Step 4: Run tests — expect PASS**

---

### Task 2: Wire calc into index.html UI

**Files:**
- Modify: `cartulator/index.html`

- [ ] **Step 1:** `<script src="calc.js"></script>` before main IIFE; use `CartulatorCalc` globals
- [ ] **Step 2:** State + load/save migration for setQty, bxgy*, type `zhe`, extraType/extraValue
- [ ] **Step 3:** Header set-qty control; items-column collapsed BXGY; deal dropdown + zhe; top-bar extra type
- [ ] **Step 4:** Tally / grand / export / copy use computeCategory + computeExtra
- [ ] **Step 5:** i18n strings en / zh-HK / ja
- [ ] **Step 6:** Manual smoke in browser (or jsdom render if already used)

---

### Task 3: Service workers + README

**Files:**
- Modify: `cartulator/sw.js`
- Modify: `sw.js`
- Modify: `cartulator/README.md`

- [ ] **Step 1:** Cartulator SW `sdc-v3`, precache `./calc.js` + `./index.html` + icons/manifest; navigation fallback never undefined
- [ ] **Step 2:** Root SW only deletes keys starting with `sushi-split-` (keep current cache name)
- [ ] **Step 3:** Update README deal/BXGY/set qty / offline notes

---

### Task 4: Verification

- [ ] **Step 1:** `node cartulator/calc.test.js` PASS
- [ ] **Step 2:** Confirm no JS syntax errors in index.html (node parse or quick load)
