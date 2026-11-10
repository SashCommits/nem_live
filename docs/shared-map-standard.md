# Power Socket shared geographic map standard (2026)

**Goal:** all geographically tiled maps should use the same neutral visual basemap, consistent light/dark mode, map-control placement and attribution. Do not mix CARTO (now key-restricted), OSM raster and other providers in new tools.

## Chosen defaults

| Item | Standard |
|---|---|
| Library | MapLibre GL JS; reuse `powersocket-map-core.js` |
| Basemap provider | [OpenFreeMap](https://openfreemap.org/) vector tile service |
| Light style | `https://tiles.openfreemap.org/styles/positron` |
| Dark style | `https://tiles.openfreemap.org/styles/dark` |
| Marker conventions | Physical substations: operational red `#D63F47`; construction amber `#E8A13A`; planned blue `#4C87D9`; unverified grey `#9299A5` |
| Font / controls | Inherit site text style; compact right-side zoom; subtle borders; accessible text tooltips and keyboard markers |
| Data attribution | Keep OpenFreeMap/OpenMapTiles/OpenStreetMap native attribution; add GA attribution separately for the substation geometry |
| Credential | No map provider API key; GA GIS data is public and separate from tile service |
| Theme | Same style for map overview and detail, and switch to Dark when site uses dark mode |

OpenFreeMap's public service allows commercial use without an API key, but is
provided as-is **without an SLA**. If The Power Socket traffic grows beyond a
reasonable free service footprint or requires guaranteed uptime, migrate to
self-hosted OpenFreeMap/PMTiles or a contracted provider **behind the same
shared map interface**, not ad hoc per-page code.

## How to consume

`powersocket-grid-headroom/api/widget.py` bundles the shared
`powersocket-map-core.js` before `qld-substations-widget.js` when both are
available. Pages that load the map core directly can use:

```js
PowerSocketMaps.create(container, {center: [145.5, -21.3], zoom: 5.25})
  .then(({map, lib}) => { /* add your domain-specific markers */ });
```

Coordinates for MapLibre map centers are [longitude, latitude]. The returned
shared marker helper also takes (latitude, longitude), as documented in the
function signature, so don't silently swap them.

## Site-wide map inventory and adoption

- **Queensland substations:** MapLibre / OpenFreeMap through this common module.
- **Headroom connection-point analytic map:** currently Leaflet / OSM raster.
  Its overlapping-marker fan-out and private member selection logic must be
  retained. Switch it to this common module in a separate tested change; do
  not replace that app's data by GA geometry or discard its behaviours.
- **Facilities:** currently an SVG-based geographic outline, not raster tiles
  (`powersocket-newsroom/newsroom/facilities.py`). Use a consistent outline/
  dot palette and headings until intentionally converting it to an interactive
  tiled map; do not pretend its custom SVG uses OpenFreeMap.
- **Project Tracker / lifecycle:** currently SVG-based state outlines
  (`powersocket-newsroom/newsroom/lifecycle.py`). Same recommendation.
- **Any new map:** avoid introducing another provider; use the shared module.

This PR corrects the CARTO watermark in the Queensland substation map and
creates the shared map provider/style. **It does not yet replace the existing
Headroom, Facilities or Project Tracker renderers.**
