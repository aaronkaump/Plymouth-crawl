# Crawl

A pub crawl planner for one night in Plymouth, Michigan, built as a demo of agentic
product development. One phone, two people (Aaron and John), six stops across
downtown and Historic Old Village, every stop and walk timed, and a postcard at the end.
No server, no accounts, no location permission, free data only.

The build follows [docs/BUILD-SPEC.md](docs/BUILD-SPEC.md).

```bash
npm install
npm run dev        # http://localhost:5173  (add ?demo for the fake clock)
npm test           # planner and stop-loop tests
npm run build      # static site in dist/, deployed to GitHub Pages by .github/workflows/pages.yml
```

## Demo at a desk

Open the app with `?demo` (or Menu, Demo mode). The clock jumps to 8:00 pm on a July
Saturday. Menu, Play the night runs a whole scripted crawl in about four minutes: stops,
vibe taps, glasses, walks, the Old Village hop and the recap. Tap anywhere to take over.
Demo nights are stored apart from real ones.

## On the iPhone

Open the Pages URL in Safari, Share, Add to Home Screen. After the first load the app,
fonts, venue data, walking routes and the map tiles for both districts work offline.

## Data

| File | What | Refresh |
|---|---|---|
| `src/data/venues-osm.json` | 38 raw OSM venues with stable ids | `npm run fetch:venues-osm` (main OSM API; run from a home connection) |
| `src/data/venues.json` | 24 curated venues: vibe, district, short name | `npm run curate` (edit the table in `scripts/curate-venues.mjs`) |
| `src/data/walks.json` | walk time, distance and line for every pair | `npm run fetch:walks` (FOSSGIS OSRM, about 5 min) |

Map tiles: [OpenFreeMap](https://openfreemap.org) dark style, retinted per vibe at runtime.
Data © OpenStreetMap contributors (ODbL), credited in the app menu and on the map.

## Code

- `src/planner.ts`: the pure planner (six stops, Old Village finale, Closest match, alternatives).
- `src/store.ts`: the night's state and actions, saved to localStorage on every tap.
- `src/clock.ts`: the one clock; demo mode swaps in a fake one.
- `src/ui.ts`: every screen as lit-html templates (lit patches in place, so a vibe tap moves nothing).
- `src/map.ts`: MapLibre map, tint, pins, route. Loaded lazily.
- `src/demo.ts`: demo mode and the scripted night.
- `src/photos.ts`: photos in IndexedDB, downscaled to 1600 px.
