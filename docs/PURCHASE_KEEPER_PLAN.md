# Purchase Keeper — Product Plan

**Status:** concept / planned  
**Working title:** **Purchase Keeper**  
**Tagline idea:** *Receipts now. Returns and warranties when you actually need them.*

## Problem

Receipts and warranty documents are usually easy to ignore at purchase time and surprisingly difficult to find when something breaks or needs to go back.

The app should answer four questions quickly:

1. **Can I still return this?**
2. **Is it still covered by a warranty or other protection?**
3. **Where is the receipt / warranty / serial number / manual?**
4. **What happened the last time I repaired, returned or claimed this item?**

This is not intended to become a budgeting or expense-tracking app. The purchase price is useful context, but the product is about preserving proof and deadlines after a purchase.

## Naming

### Recommended working name: Purchase Keeper

Why it fits:

- broad enough for receipts, returns, warranties, repairs and documents;
- does not imply the app handles claims or refunds itself;
- fits the existing `PostKeeper`, `Coupon Keeper`, and `Cycle Keeper` naming family;
- understandable without explanation;
- leaves room for the product to expand beyond warranties.

Possible public subtitle:

> **Purchase Keeper — Returns, warranties & proof of purchase**

### Other candidates

- **Purchase File** — simple and document-focused, but less friendly.
- **Purchase Passport** — suggests one record that follows an item through its life; memorable, but may sound travel-related.
- **Proof Drawer** — playful and matches the real-world “drawer full of receipts” problem, but less immediately descriptive.
- **Claim Drawer** — fun, but too claim-focused and not every return/warranty event is a claim.
- **Keep Covered** — good for warranties, weaker for returns and receipts.
- **Aftercare** / **Purchase Aftercare** — describes the lifecycle well, but sounds like customer support or health care.

Names such as `ProofKeeper`, `Warranty Wallet`, `AfterBuy`, `ReturnKeeper`, and `Receipt Keeper` are already in active use by other apps and should be avoided.

The working repository/folder name can stay generic until the final title is chosen.

## Product principles

- **Local first.** Purchase records and documents should live on the user's device by default.
- **No account required.** Core use must work without sign-in or a backend.
- **Documents are first-class.** A record is only useful if the original receipt/warranty file is easy to retrieve.
- **Never invent coverage.** Do not guess a warranty or return period and present it as fact.
- **Deadlines should be visible, not noisy.** Prioritize expiring returns and coverage without turning the app into a notification machine.
- **Manual entry must always work.** OCR, barcode lookup or document parsing can assist, but should never be required.
- **Do not become a finance app.** No spending dashboard, budgeting, bank integration or automatic transaction import in the core product.
- **Portable data.** Users should be able to export and restore their own records and attachments.

## Core data model

Do not model one receipt as one product. A purchase/order can contain multiple items.

### Purchase / order

Suggested fields:

```text
id
merchant
purchase date
delivery date (optional)
order number (optional)
total amount (optional)
currency (optional)
payment note / card nickname (optional — never require full card data)
return policy note (optional)
store/order URL (optional)
notes
created / updated timestamps
```

A purchase can have one or more attached documents and one or more items.

### Item

Suggested fields:

```text
id
purchase id
item name
brand (optional)
model (optional)
serial number (optional)
SKU / barcode (optional)
quantity
item price (optional)
category (optional)
photo (optional)
notes
status
```

Possible statuses:

- owned;
- return planned;
- return in progress;
- returned;
- replaced;
- sold/given away;
- disposed;
- archived.

### Return record

Return details may apply to a whole order or to an individual item.

Fields:

```text
return-by date
return method / location (optional)
return authorization / RMA (optional)
shipping label / QR attachment (optional)
expected refund (optional)
return submitted date (optional)
refund received date (optional)
actual refund amount (optional)
status
notes
```

Suggested statuses:

```text
not planned
considering
ready to return
sent / dropped off
merchant received
refund pending
completed
cancelled
```

This lets the app track not only the deadline but also the common problem of **“I returned it three weeks ago — did I ever get the refund?”**

### Coverage / warranty

An item can have more than one coverage record.

Examples:

- manufacturer warranty;
- retailer warranty;
- paid extended warranty;
- credit-card extended warranty or purchase protection;
- optional insurance / protection plan.

Fields:

```text
coverage type
provider
start date
end date OR lifetime flag
policy / plan / registration number (optional)
claim/support URL (optional)
phone/email note (optional)
coverage summary
exclusions / notes
registration required? + registration deadline (optional)
```

Do not try to determine legal eligibility automatically. The app stores what the user was told/provided and reminds them to verify terms when needed.

### Service / repair / claim event

Keep a history under each item:

```text
date
type: repair / replacement / warranty claim / return / service / other
provider
reference number
cost (optional)
outcome
notes
attachments
```

This turns the app into a long-term record rather than a receipt graveyard.

### Documents / attachments

A document can belong to the whole purchase or a specific item/event.

Types could include:

- receipt;
- invoice;
- order confirmation;
- warranty certificate;
- extended warranty terms;
- manual;
- product registration confirmation;
- serial-number/product-label photo;
- return label / QR;
- return drop-off proof;
- refund confirmation;
- repair invoice;
- support transcript/screenshot;
- other.

Support multiple files per record rather than one receipt image.

## Phase 1 — Useful MVP

### Add a purchase quickly

The minimum fast-add flow should be:

1. merchant;
2. purchase date;
3. add one or more item names;
4. optional return deadline;
5. optional warranty end date;
6. attach receipt/photo/PDF;
7. save.

Everything else can be filled in later.

Provide **Save as draft** so the user can quickly capture a receipt at checkout without entering warranty details immediately.

### Dashboard

The home screen should answer what requires attention now.

Suggested sections:

- **Return soon** — return windows closing soon;
- **Refund pending** — returned but refund not recorded;
- **Coverage ending** — warranties/protection nearing expiry;
- **Needs details** — drafts or records with a receipt but no item name/date;
- **Recent purchases**.

Avoid generic spending charts.

### Search

Search across:

- item name;
- merchant;
- brand/model;
- serial number;
- order number;
- notes;
- document filename/type.

Filters:

- active return window;
- warranty active;
- warranty expiring;
- returned/refund pending;
- archived;
- category;
- merchant.

### Reminders

Default reminder suggestions:

**Returns**
- 7 days before;
- 2 days before;
- morning of deadline.

**Warranty / coverage**
- 60 days before;
- 30 days before;
- 7 days before.

These should be configurable globally and per record.

Also support:

- product registration deadline;
- expected refund follow-up date;
- optional maintenance/service reminder later.

On the web/PWA, where reliable background notifications are not available, show in-app deadline banners and optionally offer calendar (`.ics`) export. An Android wrapper can provide proper local notifications.

## Phase 2 — Document capture and assistance

### File/photo import

Support:

- camera/photo;
- image files;
- PDFs;
- screenshots;
- browser/PWA drag-and-drop;
- Android Share target in a wrapper so a receipt PDF/image can be shared directly into Purchase Keeper.

Incoming shares should open a **quick capture** screen rather than dumping the file into an unexplained inbox.

### OCR

OCR should be optional assistance, preferably on-device where practical.

Possible extracted suggestions:

- merchant;
- date;
- total;
- order/receipt number;
- obvious item descriptions;
- model/serial number from a product-label photo.

Rules:

- never silently save OCR values;
- clearly distinguish suggestions from confirmed fields;
- do not guess warranty duration from product category;
- manual correction always wins.

OCR can be postponed until after the manual workflow is solid.

### Barcode / QR

Useful later for:

- UPC/EAN product code capture;
- serial/model labels;
- return/RMA QR storage.

External product lookup should be optional rather than a requirement.

## Phase 3 — Claim / return pack

One of the most useful outputs should be **Prepare documents**.

For a selected item/event, generate a local shareable bundle or PDF containing only what the user chooses:

- item/product name;
- model and serial number;
- merchant and purchase date;
- order number;
- warranty/provider details;
- support/claim reference;
- selected notes;
- receipt/invoice pages;
- selected warranty certificate pages;
- selected repair/return proof.

Privacy defaults:

- do not include unrelated items from the same receipt unless needed;
- do not include private notes by default;
- do not include payment/card notes by default;
- preview exactly what will be exported.

This is not a claim-submission service; it simply prepares the user's own records.

## Phase 4 — Backup / multi-device

Follow the same philosophy as the other local-first apps:

### Portable backup

Export one versioned backup containing:

- structured records;
- attached files/images;
- reminder settings;
- categories/preferences.

Allow optional password encryption.

Restore should validate the backup before replacing current data.

### Optional Google Drive app-data backup

A later web/PWA version can use Drive `appDataFolder`, similar to other projects, so the app only accesses its own hidden backup rather than the user's normal Drive files.

Keep manual export/restore even if Drive backup exists.

## Security / privacy

Purchase records can expose spending, addresses on receipts, serial numbers and account/order information.

Default rules:

- no analytics containing purchase content;
- no server-side receipt storage;
- no automatic inbox/email access;
- no bank/card account connection;
- avoid storing full payment-card numbers;
- attachments live in IndexedDB / app-private storage;
- backup encryption available;
- optional app/PIN/biometric lock in Android later;
- thumbnails should not leak into a public/shared cache;
- clear all data must include attachments, OCR cache and thumbnails.

If OCR ever uses a network service, it must be opt-in and explicitly state that the document leaves the device. Prefer local OCR where feasible.

## PWA vs Android

### Web / PWA first

Good for:

- desktop receipt/document import;
- searchable archive;
- local backup/restore;
- planning the data model;
- claim-pack export.

### Android wrapper later

Adds meaningful native benefits:

- share target for receipt PDFs/images;
- camera capture;
- reliable local deadline notifications;
- biometric/device lock;
- native file share/save;
- optional document scanner integration.

Avoid creating a wrapper merely for an APK badge; add it when these native flows are ready.

## Suggested UI

Bottom/tab navigation on mobile:

```text
Home     Purchases     + Add     Deadlines     Settings
```

### Purchase detail

```text
Merchant · date · order number
Receipt / invoice attachments

Items
 ├─ Item A
 │   Return until …
 │   Warranty until …
 │   Documents
 │   Service history
 │
 └─ Item B
     …
```

This hierarchy is preferable to flattening every receipt into unrelated product cards.

### Item detail emphasis

At the top, show simple state chips such as:

```text
RETURN: 5 days left
WARRANTY: active until 14 Mar 2028
REFUND: pending 12 days
```

Use exact dates underneath. Do not rely only on relative countdowns.

## Categories

Start with a small editable set:

- Electronics
- Appliances
- Home
- Clothing
- Beauty / personal care
- Tools / outdoor
- Travel gear
- Hobby / sports
- Other

Do not require categories.

## Nice later features

Potential expansions after the core works:

- household/family export or shared encrypted vault;
- product maintenance history;
- manuals and firmware/support links;
- consumable filter/replacement reminders;
- insurance inventory export;
- loss/theft record pack with serial numbers and receipts;
- price-drop / price-protection deadline field;
- rebate deadline tracking;
- gift receipt / recipient field;
- archive items automatically after disposal/sale while retaining documents;
- import records from a simple CSV.

These should not delay the returns/warranty/document MVP.

## Explicit non-goals

For the initial product, do not add:

- bank transaction import;
- automatic Gmail/inbox scanning;
- spending/budget analytics;
- retailer account scraping;
- automatic return initiation;
- automatic warranty claims;
- AI-generated legal advice;
- guessed warranty eligibility;
- mandatory cloud accounts;
- ads or affiliate shopping links.

## Differentiation

Many receipt/warranty apps already exist. Purchase Keeper should not compete by adding more AI or more cloud services.

Its useful distinction should be:

1. **purchase/order + multiple-item model** rather than assuming one receipt equals one product;
2. **return tracking through refund completion**, not only a return deadline;
3. **multiple layers of coverage per item**;
4. **documents and service history kept together**;
5. **local-first and portable by design**;
6. **claim/return pack export with explicit privacy controls**;
7. **manual workflows remain complete even with no OCR/network access**.

## Suggested implementation model

Keep storage schema versioned from the start.

Possible stores/tables:

```text
purchases
items
returns
coverages
events
attachments
reminders
settings
```

Attachments should use stable IDs and references rather than being embedded repeatedly inside purchase JSON records.

Add migrations before the schema becomes complicated.

## Test priorities

- purchase with multiple items;
- one item returned while another remains owned;
- order-level vs item-level return deadlines;
- multiple warranty/coverage records on one item;
- lifetime warranty;
- no known warranty date;
- draft receipt with incomplete fields;
- refund pending/completed transitions;
- reminder date calculation;
- timezone/date-boundary behavior;
- backup/restore including binary attachments;
- deletion cleans orphaned attachments;
- claim-pack export excludes private/unselected fields;
- search by serial/order/item/merchant;
- schema migration from older backups.

## Implementation order

1. Finalize schema and local storage layer.
2. Build manual purchase + multi-item entry.
3. Add documents/attachments.
4. Add return and warranty deadline calculations.
5. Add dashboard, search and filters.
6. Add drafts / quick capture.
7. Add portable encrypted backup/restore.
8. Add return/refund workflow and service history.
9. Add claim/return pack export.
10. Add optional OCR assistance.
11. Add Android wrapper/share target/notifications if the web model is stable.
12. Add optional Drive app-data backup.

## MVP acceptance criteria

The first release is useful when a user can:

1. save a purchase with several items and attach the receipt;
2. record different return and warranty dates per item;
3. immediately see which deadlines are approaching;
4. search later by item, merchant, order number or serial number;
5. track a return until the refund is actually received;
6. open the receipt/warranty document from the item record;
7. export and restore all data without an account;
8. use the core archive offline without uploading purchase data to an application server.

Everything else can build on that foundation.
