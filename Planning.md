# PS 26143 — Oil Spill SAR+AIS Attribution Prototype

## Frontend Build Plan (3-Day Sprint)

**PS:** SIH 2026 — PS 26143 (NTRO) — Leveraging Satellite Imagery + AIS Data to Detect Oil Spills and Attribute Them to a Vessel
**Scope of this document:** frontend/UI prototype only. ML detection, drift/weathering physics, and the real attribution scoring pipeline are separate workstreams — this plan builds the interaction layer against a mock API so frontend work isn't blocked on them, with a clean swap-in point for when real outputs land.
**Reference system:** modeled on the interaction pattern of [SkyTruth's Cerulean](https://cerulean.skytruth.org), extended with a backward-hindcast uncertainty cone, explainable multi-factor source scoring, and an exportable evidence report — the three gaps the PS 26143 deep-dive dossier identifies between Cerulean's public map and what NTRO's stakeholders (ICG, DG Shipping, legal/enforcement) actually need.

---

## 1. Grounding notes

**From Cerulean's own methods page / GitHub (public, current):**

- Runs on Sentinel-1 SAR (radar), not optical imagery.
- `slick_confidence` is a _separate_ near-real-time score from geometry alone (size, compactness, elongation, multipart structure) — used before AIS correlation is available. `detection_confidence` is the model's confidence a slick exists at all. Keep these as two distinct fields, not one.
- Source attribution uses a distance-decay algorithm along the slick's perimeter (candidate termini) — closer candidates score higher.
- Dark vessel and infrastructure are first-class source _types_, not fallback categories.
- HITL (human-in-the-loop) review is a binary reviewed/not-reviewed flag layered on top of ML output.

**From the PS 26143 deep-dive dossier (NTRO-specific context):**

- The PS explicitly requires a visual interface with: map view, backward-hindcast **uncertainty cone**, candidate vessel tracks, a **ranked table with sub-score breakdown**, and an **exportable evidence report** for enforcement/legal use (§6.9).
- Cerulean's own ranking is called out as "a comparatively simple proximity/AIS-off heuristic" — the PS's own gap analysis (§3) names **explainable, weighted, multi-factor scoring** as the real differentiation surface, not just "we also combined SAR + AIS."
- Backtracking uncertainty _grows_ with time-since-discharge (Janeiro et al.) — a flat dashed line undersells this; a widening cone communicates it correctly.
- Real, citable incident to anchor the demo region: **MSC ELSA 3 spill, Kerala coast, May 2025**, detected via India's own EOS-4 SAR satellite.
- Small, non-SOLAS vessels (fishing/coastal traffic) are the population most likely to illegally discharge _and_ least likely to carry continuous AIS — India has a NavIC-based small-vessel tracking layer (IMAC) that's a genuine partial answer to this gap, worth acknowledging in the dark-vessel framing even if not fully built.

---

## 2. Tech stack

| Concern                | Choice                                                                                    | Why                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scaffold               | Vite + React (JS)                                                                         | Fast start. Swap to TS later if stricter schema enforcement with the ML team is wanted — interfaces below translate 1:1.     |
| Map                    | `react-leaflet` + `leaflet`                                                               | Free, no API key, solid polygon/polyline/circle support.                                                                     |
| State                  | `zustand`                                                                                 | Filters, selected slick, layer toggles are shared across map + panel + filter bar + table. One store file, no prop-drilling. |
| Geo math               | `@turf/turf` (import only needed submodules)                                              | `turf.destination`/`turf.along` for fabricating drift points, `turf.distance` for AIS-window mock logic.                     |
| Date range picker      | `react-datepicker`                                                                        | Compact dual-calendar bar, close to Cerulean's filter style.                                                                 |
| Slider                 | `rc-slider`                                                                               | Dual-handle confidence range.                                                                                                |
| Styling                | Tailwind (or plain CSS variables)                                                         | Filter bar has many small pill/toggle components — Tailwind saves time here.                                                 |
| Evidence report export | `window.print()` + `@media print` CSS first; `jspdf` + `html2canvas` as a stretch upgrade | Zero-dependency path first, upgrade only if time remains.                                                                    |
| Mock data              | Hand-rolled generator function, not static JSON                                           | Schema changes propagate from one function instead of hand-edited fixtures.                                                  |

---

## 3. Folder structure

```
src/
  api/
    mockClient.js         # generateSlicks(), generateAISTracks() — swap for real fetch() later
    schema.js              # JSDoc typedefs for Slick / Source / AISTrack
  store/
    useMapStore.js          # zustand: filters, selectedSlickId, hoveredSlickId, layerToggles, driftTimeOffset
  components/
    map/
      MapShell.jsx           # MapContainer + TileLayer + region lock
      SlickLayer.jsx          # renders polygons, color-coded
      AISLayer.jsx             # vessel tracks, top-3 highlighted vs grey
      DriftConeLayer.jsx        # backward hindcast (widening) + forward forecast
      RegionLock.jsx
    filters/
      FilterBar.jsx
      DateRangeFilter.jsx
      ConfidenceSlider.jsx
      ClassMultiSelect.jsx
      SourceTypeToggle.jsx
    panel/
      SlickDetailPanel.jsx
      SourceCard.jsx           # per-source card w/ sub-score mini bar
      RankedSourceTable.jsx     # sortable table, alt view to cards
      ScoringLegend.jsx          # shows the weighted-scoring formula
      DarkVesselBadge.jsx
      VerifiedBadge.jsx
      DriftTimeSlider.jsx
    report/
      EvidenceReport.jsx        # print-styled export view
    stats/
      StatsBar.jsx
  utils/
    colorScale.js            # confidence -> hex, class -> icon, fused_score -> track color
    geo.js                    # turf wrappers: driftCone(), aisInWindow()
  App.jsx
  main.jsx
```

---

## 4. Data contracts (lock this first — Day 1, hour 1)

```js
// schema.js

/**
 * @typedef {Object} Slick
 * @property {string} id
 * @property {Object} polygon              // GeoJSON Polygon/MultiPolygon
 * @property {'infrastructure'|'natural_seep'|'coincident_vessel'|'recent_vessel'|'old_vessel'|'ambiguous'} class
 * @property {number} detection_confidence  // 0–1, model's confidence a slick exists
 * @property {number} slick_confidence      // 0–1, geometry-based near-real-time score
 * @property {number} area                  // km²
 * @property {number} age_estimate          // hours since estimated release
 * @property {string} timestamp             // ISO 8601, scene acquisition time
 * @property {boolean} hitl_reviewed        // Verified/Unverified badge
 * @property {DriftCone} drift
 * @property {Source[]} sources             // top 3 only, source_limit=3
 */

/**
 * @typedef {Object} DriftCone
 * @property {{t_offset_hours:number, center:[number,number], radius_km:number}[]} hindcast  // radius grows backward in time
 * @property {{t_offset_hours:number, center:[number,number], radius_km:number}[]} forecast   // tighter, less uncertain
 */

/**
 * @typedef {Object} Source
 * @property {string} id                    // vessel_id or infra_id
 * @property {'vessel'|'dark_vessel'|'infrastructure'} type
 * @property {Object} sub_scores            // each 0–1, Gaussian f(d)=exp(-d²/2σ²) transform
 * @property {number} sub_scores.cpa               // closest point of approach
 * @property {number} sub_scores.tcpa              // time to CPA
 * @property {number} sub_scores.drift_overlap     // IoU vs forward-simulated footprint
 * @property {number} sub_scores.ais_gap_anomaly   // suspicious AIS-off timing/duration
 * @property {number} sub_scores.behavioral_anomaly // Isolation-Forest-style anomaly score
 * @property {number} fused_score            // weighted sum of sub_scores (see ScoringLegend)
 * @property {string} dominant_factor        // sub-score that drove the ranking — drives the "why" badge
 * @property {boolean} navic_tracked         // optional: true if this is a non-AIS small vessel picked up via NavIC/IMAC-style tracking, not classic AIS
 */

/**
 * @typedef {Object} AISTrack
 * @property {string} vessel_id
 * @property {[number,number][]} positions  // [lon, lat][]
 * @property {string[]} timestamps          // ISO 8601, parallel to positions
 * @property {number} speed                 // knots
 * @property {number} heading               // degrees
 */
```

**Scoring weights (displayed, not hidden):**

```
fused_score = 0.30·f(cpa) + 0.25·f(tcpa) + 0.20·f(drift_overlap)
            + 0.15·f(ais_gap_anomaly) + 0.10·f(behavioral_anomaly)
```

Fixed and shown via `ScoringLegend.jsx` — the transparency itself is the differentiator, per the PS dossier's gap analysis.

---

## 5. State shape (`useMapStore.js`)

```js
{
  region: { center: [9.9, 76.2], zoom, bounds },   // Kerala coast, near Kochi — MSC ELSA 3 spill AOI
  filters: {
    dateRange: [start, end],
    minDetectionConfidence: 0.7,
    minSlickConfidence: 0.8,
    classes: [...],
    sourceTypes: ['vessel', 'dark_vessel', 'infrastructure'],
    reviewStatus: 'all' | 'verified' | 'unverified',
  },
  slicks: Slick[],
  aisTracks: AISTrack[],
  selectedSlickId: string | null,
  sourceView: 'cards' | 'table',    // toggle for panel
  driftTimeOffset: 0,                // hours, drives DriftTimeSlider
}
```

Filters live in the store; map, panel, table, and stats bar all derive from one memoized `filteredSlicks` selector — don't duplicate filtering logic per component.

---

## 6. Current implementation snapshot

The project has moved beyond the initial empty shell. The current app already reflects the intended product structure and should be treated as the baseline for the next implementation block:

- App layout: white header, left-side filter panel, and full-height map canvas in a 2-column split.
- Theme: clean slate/neutral palette with white surfaces, subtle borders, and dark text for a professional operations-console feel.
- Map shell: Georgia/Kerala AOI lock, full-screen button, geolocation action, and a map-layer toggle using OSM/satellite tiles.
- Store: `useMapStore` already manages region, filters, selected slick, source view, drift time offset, and layer toggles.
- Background treatment: the app shell is light neutral, while the map area remains the main visual field and should stay readable with stronger overlay accents on top of it.

This means the next planning block should build on the existing shell instead of restarting from a blank canvas.

---

## 7. Next 2-day implementation plan

### Day 1 — Finalize layout, theme, and map overlays

1. Keep the current two-panel layout, but tighten the visual system to match the demo objective: soft off-white surfaces, slate typography, and restrained blue/teal accents instead of a generic white dashboard.
2. Refine the overall background treatment so the app feels like an incident-analysis console rather than a generic app shell:
   - app background: warm stone/ivory neutral;
   - panel background: slightly darker off-white with subtle grain/contrast;
   - map background: neutral or satellite-based ocean context with crisp overlays on top;
   - use thin borders and soft shadows to keep the interface organized but not visually heavy.
3. Align the top bar and filter panel with the active data aesthetic: minimal UI chrome, more readable labels, stronger section headings, and consistent spacing.
4. Confirm the map layer treatment and region lock remain consistent with the Kerala AOI and the dark-ocean operations style expected in the prototype.
5. Ensure `useMapStore` remains the source of truth for filters and selected features so map, side panel, and future detail contents stay synced.

_Acceptance:_ the product feels like a marine monitoring dashboard, not a starter Vite layout; the background and panel contrast support the map; filter state remains centralized and stable.

### Day 2 — Slick interaction, score explainability, and source inspection

6. Build the actual slick rendering layer on top of the current `MapShell`: polygons colored by class and confidence, with selected state and hover readiness.
7. Connect click-to-inspect behavior so the selected slick drives the detail view and eventually the AIS/drift context.
8. Implement the scored source inspection flow using the existing store and mock data contract:
   - `SourceCard` list with type icon and sub-score breakdown;
   - `dominant_factor` and explainability badge;
   - `sourceView` toggle between cards and table view if needed.
9. Add the AIS overlay logic keyed to the selected slick space-time window, with muted tracks in the background and highlighted top-source tracks in a brighter accent color.
10. Keep the mock API as the single swap point for future real ML output, without forcing changes across the whole app.

_Acceptance:_ a slick can be selected from the map and the detail panel updates from the store; sources are explainable by sub-score; the map remains legible while the AIS layer is active.

---

## 8. Visual language and theme update

The current implementation already points to the intended direction, so the plan should stay consistent with it rather than replacing it with a darker, fully synthetic map-first concept.

- Overall theme: light operational dashboard with neutral stone/ivory surfaces and structured slate text.
- Map emphasis: dark ocean tiles or satellite context under the actual detection overlays; overlays should have strong contrast for quick triage.
- Background treatment: layered neutral surfaces inside the app shell, with the map occupying the main visual field and the controls staying visually quiet.
- Confidence coding: keep class-based hue families and darker fills for higher confidence, but do it within a readable neutral app shell.
- Source state accents: vessel blue, dark-vessel hazard orange/red, and infrastructure gray/steel tones should remain distinct without creating noisy UI.
- Verified state: green pill for verified items, grey outline for unverified.
- Drift behavior: fading circles and widening backward uncertainty remain the correct visual concept for the hindcast cone, but the base UI should remain polished and operational rather than purely sci-fi dark mode.

---

## 9. Demo focus for the next pass

> The product should read as a marine incident-analysis dashboard built around a Kerala AOI case study, not as a generic map demo. The current app already has the right page partition and operational layout; the next step is to make the slick interactions and source explanations feel real, explainable, and easy to narrate in front of stakeholders.

This keeps the prototype grounded in the actual implementation while preserving the original research goals: explainable attribution, source ranking, and a defensible evidence trail for future enforcement workflows.

---

## 8. Demo narration (Day 3 rehearsal script)

> "This is modeled on SkyTruth's Cerulean's interaction pattern — the closest production system to what PS 26143 is asking for. But where Cerulean ranks sources on a simple proximity/AIS-off heuristic, we show the full CPA/TCPA/drift-overlap/behavioral-anomaly breakdown per vessel, because the PS's own stakeholders — ICG, DG Shipping, and eventually NGT proceedings — need an auditable score, not a black-box number. We also show a backward-hindcast uncertainty cone instead of a single line, because attribution confidence genuinely degrades the further back you backtrack — and we generate an exportable evidence report, because that's the artifact that actually gets handed to enforcement. Demo AOI is set near the Kerala coast — the same waters as the MSC ELSA 3 spill from May 2025."

Explicitly label the build as a **prototype**: detection and physics-grounded drift modeling are separate, multi-month workstreams (per the dossier's own Tier 1/2/3 scoping in §7) — this frontend demonstrates the interaction pattern and explainability layer against synthetic data, not a production pipeline.

---

## 9. Risks

- **Turf bundle size** — import only needed submodules (`@turf/destination`, `@turf/distance`), not the whole `@turf/turf` package, if Vite build time becomes an issue.
- **Drift cone realism** — don't over-invest; a smoothly widening/fading circle sequence is enough for a demo. Nobody is checking your ocean-current model.
- **Evidence report scope creep** — ship the `window.print()` version first; only reach for `jspdf`/`html2canvas` if Day 3 has slack.
- **Swap-in discipline** — keep `api/` as the only place that knows about mock vs. real data (step 8), so the real ML/attribution integration is a small diff, not a rewrite.
