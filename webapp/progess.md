# MarineEye Implementation Progress

## Overview

MarineEye is currently a frontend prototype for marine slick detection and AIS-based source attribution around the Kerala/Kochi area. The app demonstrates the interaction and explainability layer using the supplied mock CSV datasets.

Detection, drift physics, and attribution scoring are still prototype representations and are not production ML or ocean-current models.

## Implemented Features

### Application shell

- Vite + React client application.
- Operations-console layout with:
  - top header and MarineEye branding;
  - left filter and inspection panel;
  - full-height interactive map area;
  - bottom map status bar.
- Responsive map-and-panel structure using Tailwind CSS.
- Light neutral visual theme with slate text, subtle borders, and quiet panel surfaces.

### Interactive map

- Leaflet map integrated through `react-leaflet`.
- Kerala/Kochi area used as the initial map focus.
- OpenStreetMap base layer.
- Satellite imagery base layer toggle.
- Map controls for:
  - zooming;
  - fullscreen mode;
  - browser geolocation;
  - searching by place name or latitude/longitude;
  - resetting the map view to India.
- Cursor latitude and longitude shown in the map status bar.
- Approximate altitude/scale readout based on the current zoom level.
- The previous rectangular region-lock border has been removed so it does not visually obscure the map.

### CSV-backed client data

The client now loads the supplied CSV files directly in the browser through `src/api/mockClient.js`:

- `mock_slick_detections.csv`
- `mock_sources.csv`
- `mock_ais_tracks.csv`

The files are served from `Client/public/` and are joined into the existing frontend data contract.

The mock client currently:

- parses CSV rows, including quoted WKT polygon fields;
- converts slick WKT polygons into GeoJSON-style polygon objects;
- converts numeric and boolean CSV values;
- joins candidate sources to their slick by `slick_id`;
- limits attached candidate sources to the top three rows;
- groups AIS observations by vessel;
- creates parallel AIS positions and timestamps;
- builds a deterministic prototype drift cone around each slick centroid.

The app loads this data through `App.jsx`, without requiring the FastAPI server to display the client demo.

### Slick detection overlay

- Slick detection polygons are rendered from the CSV geometry.
- Slick polygons use a high-visibility orange color.
- Polygon opacity reflects detection confidence.
- Hovered slicks receive a stronger orange border.
- Selected slicks receive a high-contrast highlighted border and increased weight.
- Clicking a slick opens its inspection panel.

### AIS track overlay

- AIS observations are grouped into vessel tracks and rendered as Leaflet polylines.
- Background AIS tracks use blue with reduced opacity and a dashed style.
- Tracks associated with the selected slick use a stronger solid blue highlight.
- Track tooltips show vessel ID and speed in knots.

### Drift visualization

- Selecting a slick displays its drift context.
- Hindcast circles expand backward in time to represent increasing uncertainty.
- Forecast circles show a tighter forward projection.
- A center marker identifies the slick location.
- Drift time state is managed centrally in the map store.

### Filters and state management

- Zustand provides shared application state through `useMapStore`.
- Centralized state includes:
  - region and map settings;
  - date range;
  - minimum detection confidence;
  - minimum slick confidence;
  - slick classes;
  - source types;
  - review status;
  - selected and hovered slick IDs;
  - source card/table view;
  - drift time offset;
  - map layer visibility toggles.
- Date filtering is aligned with the supplied CSV data range: June 1 through August 31, 2026.
- Filters are applied consistently to the slick list used by the map and status bar.
- Supported filter controls include:
  - date range selection;
  - detection confidence slider;
  - slick class multi-select;
  - source type toggles;
  - source search input;
  - review status controls where available in the filter UI.

### Slick inspection panel

- Clicking a slick switches the left panel from filters to inspection details.
- Displays:
  - slick ID;
  - slick class;
  - area;
  - detection confidence;
  - slick confidence;
  - age estimate;
  - acquisition timestamp;
  - HITL verification state.
- The panel can be closed to return to the filter view.

### Source attribution display

- Candidate sources are displayed from the joined source CSV data.
- Supports cards and table views.
- Source cards show:
  - source ID;
  - source type;
  - fused score;
  - dominant scoring factor;
  - CPA;
  - TCPA;
  - drift overlap;
  - AIS gap anomaly;
  - behavioral anomaly;
  - NavIC tracking state for applicable sources.
- Dark-vessel and verified states have dedicated badges.

### Supporting backend

- FastAPI server scaffold exists under `Server/`.
- The server can initialize a SQLite database from the same three CSV datasets.
- API routes are available for:
  - `/api/health`;
  - `/api/data`;
  - `/api/slicks`;
  - `/api/ais-tracks`.
- The frontend currently uses the browser-side mock client, leaving the API client available as a future swap-in path.

### Project hygiene

- Root `.gitignore` added for:
  - Node dependencies and Vite output;
  - Python virtual environments and caches;
  - local databases;
  - environment files and secrets;
  - logs, temporary files, coverage output;
  - operating system and editor files.
- Mock CSV files remain tracked because they are required by the client demo.
- Client linting and production builds pass with the current implementation.

## Not Yet Implemented

The following Day 3 items from the planning document remain future work or are only represented by prototype data:

### Day 3 implementation backlog

- **Evidence report export:** Add a print-friendly evidence report containing slick details, map context, selected vessels, source rankings, and score breakdowns.
- **Export/print action:** Add a visible action for printing or exporting the evidence report.
- **Scoring legend:** Show the weighted attribution formula in the UI:
  - CPA: 30%;
  - TCPA: 25%;
  - drift overlap: 20%;
  - AIS gap anomaly: 15%;
  - behavioral anomaly: 10%.
- **Ranked source table:** Add a sortable table with rank, source ID, source type, fused score, dominant factor, and sub-scores.
- **AIS attribution improvements:** Highlight only the top candidate vessel tracks and show the relationship between selected slicks and related vessels more clearly.
- **Drift timeline interaction:** Connect the drift time slider to the displayed hindcast and forecast state.
- **Automated frontend tests:** Test CSV parsing, WKT polygon conversion, CSV joins, AIS grouping, filtering, and map data contracts.
- **Robust data handling:** Add empty states and useful errors for missing, malformed, or unavailable CSV data.
- **Mock/API configuration:** Add a simple configuration switch between browser-loaded mock CSV data and the FastAPI data client.
- **Responsive and demo verification:** Test mobile and desktop layouts, map controls, filter workflows, orange slick polygons, blue AIS tracks, and the Kerala demo view.

- Production ML slick detection pipeline.
- Physics-grounded weather and drift modeling.
- Real attribution calculation and weighted scoring pipeline.
- Real-time data ingestion.
- Exportable evidence report or print-styled report view.
- Full scoring legend explaining the weighted formula in the UI.
- Dedicated sortable ranked source table component beyond the current source view.
- Production authentication and account/help workflows.
- Automated frontend test suite.
- TypeScript schema enforcement.

## Current Validation

The client has been validated with:

```text
npm run lint
npm run build
```

A browser smoke test confirmed that CSV-backed slick polygons render on the map and that the app displays the loaded observations without a data-load error.
