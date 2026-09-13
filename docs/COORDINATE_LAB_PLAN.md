# Coordinate Lab — Product Plan

**Status:** planned / not yet implemented  
**Working home:** `fishese/tools`  
**Public positioning:** a local-first toolbox for converting, cleaning, inspecting and exporting coordinates and routes.

## Why build this

There are already several coordinate-related utilities in the tools repository. GPX Maker has grown beyond a simple converter, and smaller one-off tools handle tasks such as extracting useful points from tracks. Keeping every new coordinate operation as a separate HTML file will eventually make the collection harder to use and maintain.

Coordinate Lab should become the common home for these workflows without turning into a full GIS application.

The design goal is:

> Paste, drop or open location data; see exactly what it contains; transform it; copy or export it in the format needed next.

It should remain fast, understandable, local-first, and useful on a phone.

## Product principles

- **Local first.** Parsing, conversion, editing and export should happen in the browser wherever possible.
- **No account.** No backend is required for core features.
- **Do not become QGIS.** Prefer focused transformations over advanced GIS analysis.
- **Show the data.** Users should be able to inspect the normalized points before exporting.
- **Never silently alter coordinates.** Any rounding, deduplication, snapping or simplification must be explicit.
- **Mobile matters.** Copy/paste and share workflows should work comfortably on Android as well as desktop.
- **Preserve useful existing GPX Maker workflows.** Coordinate Lab should absorb or wrap them rather than forcing a feature regression.

## High-level structure

Use a simple three-stage workflow:

1. **Input** — paste coordinates, paste a map/share link, or load a file.
2. **Transform** — inspect, edit and apply optional operations.
3. **Output** — copy, preview or download in one or more formats.

A lightweight map is useful for visual verification but should not be required for every operation.

## Phase 1 — Coordinate parser and converter

### Accept common coordinate text

Recognize pasted coordinates in common forms, including:

- decimal degrees: `22.3193, 114.1694`;
- signed decimal degrees;
- latitude/longitude with direction letters;
- DMS (degrees, minutes, seconds);
- DDM (degrees and decimal minutes);
- one point per line;
- multiple points separated by whitespace, tabs or simple labels;
- copied text containing extra words around a recognizable coordinate pair.

Do not guess ambiguous latitude/longitude order silently. If both values could validly be either latitude or longitude, show the interpreted order and allow **Swap lat/lon**.

### Parse common location links

Recognize coordinates embedded in common URL forms where the coordinates are present in the URL itself, for example:

- Google Maps;
- Apple Maps;
- OpenStreetMap;
- `geo:` URIs;
- generic URLs containing obvious `lat`, `lon`, `lng`, or coordinate path values.

Do not add network-dependent short-link expansion to the core parser unless there is a clear need. A pasted URL should normally be handled locally when the coordinate is already present.

### Normalized point table

Convert every input into one internal point model:

```text
id
name / label (optional)
latitude
longitude
elevation (optional)
time (optional)
source metadata (optional, not normally exported)
```

Show a compact editable table with:

- sequence number;
- optional name;
- latitude;
- longitude;
- optional elevation;
- delete/reorder controls.

Provide **Copy all** and a per-row copy action.

### Coordinate display formats

Allow the same points to be copied as:

- decimal degrees;
- DMS;
- DDM;
- tab-separated values;
- comma-separated `lat, lon` lines.

Precision should be user-selectable, with a sensible default such as 6 decimal places. Changing display precision must not alter the stored internal coordinate unless the user explicitly chooses a rounding operation.

## Phase 2 — File import/export

### Import

Support:

- GPX;
- KML;
- GeoJSON;
- CSV / TSV with simple column mapping;
- plain text.

For GPX, preserve the distinction between waypoints, route points and track points in the import metadata so the user can choose what to work with.

### Export

Support:

- GPX waypoints;
- GPX route;
- GPX track;
- KML;
- GeoJSON;
- CSV;
- plain coordinate text.

Each export should preview:

- number of points;
- output type;
- coordinate precision;
- whether names, elevation and timestamps will be included.

## Phase 3 — Useful transformations

Transformations should be opt-in and reversible until export.

### Basic operations

- swap latitude / longitude;
- reverse point order;
- sort by original order, name, latitude or longitude;
- remove exact duplicates;
- remove nearby duplicates within a user-specified radius;
- round coordinates to selected precision;
- rename points sequentially;
- add a prefix/suffix to point names;
- offset all coordinates by a user-specified north/east distance for legitimate testing and calibration workflows;
- calculate point-to-point distance;
- calculate total path distance;
- calculate bearing between selected points.

When deduplicating nearby points, show what will be merged before applying it.

### Track / route operations

- simplify a dense track using a user-selected tolerance;
- split a track at a selected point;
- join compatible tracks;
- convert track points to waypoints;
- convert waypoint sequences to route/track;
- calculate bounding box and approximate center;
- extract first/last point;
- extract regularly spaced points along a track.

### Loop / cluster tools

Fold the useful behavior of the existing loop-center utility into an **Analysis** or **Extract points** tool:

- identify distinct loops where the input geometry clearly supports it;
- calculate a representative center for each detected loop;
- preview the detected loops before accepting;
- export the resulting centers as points.

The user must be able to inspect the result rather than receiving an automatic download with no review.

## Phase 4 — GPX Maker mode

The existing GPX Maker workflow should remain available as a focused mode inside Coordinate Lab rather than disappearing into a generic converter.

Preserve the useful concepts already present there:

- route naming;
- pasted/file input;
- editable point table;
- map verification;
- path building;
- current output options;
- coordinate preview/copy popup;
- mobile-friendly save actions.

Suggested navigation:

```text
Coordinate Lab
├─ Convert
├─ Build route        ← current GPX Maker-style workflow
├─ Analyze / extract
└─ File tools
```

During migration, keep the existing `/gpxmaker/` URL working. It can either remain as the old interface temporarily or redirect into `Coordinate Lab → Build route` once feature parity is confirmed.

## Advanced import adapters

Coordinate Lab may eventually support additional specialized share/import formats that are useful for personal workflows but are not appropriate as headline/publicly advertised features.

Design this as a small adapter interface rather than hard-coding such formats into the main parser:

```text
canHandle(input) -> confidence
parse(input) -> normalized points + metadata
```

Specialized adapters should:

- be isolated from the normal coordinate parser;
- produce the same normalized point model;
- fail closed and leave the original input untouched;
- avoid logging or persisting pasted source strings;
- not appear in marketing copy or the public feature list unless explicitly approved later.

Implementation-specific notes for these adapters should live outside the public repository.

## Map behavior

Use the map for confirmation, not as the data source of truth.

Useful interactions:

- fit all points;
- numbered markers;
- click marker ↔ highlight table row;
- drag marker to deliberately update a coordinate;
- optional line joining points in current order;
- show distance between selected points;
- show bounding box / center when relevant.

If online map tiles are unavailable, the coordinate table and transformations must still work.

## Clipboard / share UX

This is important on phones.

Provide:

- paste button where browser permissions allow;
- copy individual point;
- copy all points;
- copy selected rows;
- copy in currently selected coordinate format;
- a popup/textarea preview before copying large outputs;
- Android Web Share support where available for exported files/text.

Never copy automatically without a user action.

## History and undo

For non-trivial transformations, keep a short in-memory undo stack for the current session:

- import;
- reorder;
- deduplicate;
- rounding;
- simplification;
- point deletion;
- bulk rename;
- drag-on-map edits.

There is no need for a permanent editing history in v1.

## Privacy and storage

Default behavior:

- no account;
- no analytics;
- no server upload of coordinate files;
- input data kept only in memory unless the user deliberately saves a draft;
- any optional draft/autosave should be local-only and clearly labelled;
- **Clear workspace** must remove the current points and any locally saved draft.

Network use should be limited to clearly separate optional services such as map tiles or place lookup.

## Suggested implementation shape

Keep the transformation core independent of the UI so it can be tested directly.

Possible modules:

```text
coordinate-parser.js
formatters.js
file-import.js
file-export.js
transform.js
track-analysis.js
adapters.js
map-ui.js
workspace.js
```

The normalized point/geometry model should be the boundary between import adapters and transformation/export code.

## Tests

At minimum cover:

- decimal/DMS/DDM parsing;
- hemisphere signs;
- ambiguous lat/lon handling;
- invalid ranges;
- round-trip format conversion;
- GPX/KML/GeoJSON import/export;
- duplicate and near-duplicate removal;
- track reversal/simplification;
- point ordering;
- file metadata preservation where supported;
- adapter failure not corrupting ordinary input;
- coordinate precision not changing internal values unless explicitly applied.

Use synthetic coordinates in tests and documentation unless a real location is necessary.

## Migration order

1. Build normalized coordinate model + text parser.
2. Add copy/display format conversion.
3. Add GPX/KML/GeoJSON/CSV import/export.
4. Add core transformations and undo.
5. Add map/table editing.
6. Port the loop-center extraction workflow.
7. Move current GPX Maker functionality into **Build route** and verify parity.
8. Add specialized adapters only after the public/core architecture is stable.
9. Redirect or retire old one-off pages only after their functions are represented in Coordinate Lab.

## Out of scope for the first version

- full GIS layer editing;
- raster maps or georeferencing;
- elevation-model downloads;
- automatic road routing as a core dependency;
- live device tracking;
- background location collection;
- accounts or cloud sync;
- silently correcting suspicious coordinates.

## Acceptance criteria for a useful first release

A user should be able to:

1. paste a messy list of coordinates or load a common location file;
2. see the parsed points on a table and optional map;
3. correct names/order/coordinates;
4. convert between common coordinate representations;
5. deduplicate/reverse/round or perform another simple transformation;
6. copy the result or export it as GPX/KML/GeoJSON/CSV;
7. do all of the above without sending their coordinate data to an application server.

Once that works reliably, the existing specialist GPS utilities can be consolidated gradually rather than rewritten all at once.
