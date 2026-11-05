# Crawl: build spec

This is the one document the build follows. It replaces the product brief and the
older half of the design doc. Where an older doc disagrees, this wins.
Sources: design doc ("Aaron's review changes" section), the vibe mockups canvas, the
readiness review and its seven accepted defaults (all Nov 5, 2026).

## What it is

A pub crawl planner for one night in Plymouth, Michigan, run on one phone by Aaron
for Aaron and John. It plans six stops across downtown (Kellogg Park) and Historic
Old Village, times every stop and walk, and ends with a postcard recap. It is a
private demo: no server, no accounts, no location permission, free data only.
Target: Aaron's iPhone, added to the home screen. Demo for John at a desk with a fake
clock and a scripted walk.

## Hard rules

- Crew is hard-coded: Aaron and John. They arrive and leave every stop together.
- No location. The app never asks for it. No blue dot; the map shows the route line only.
- No opening or kitchen hours anywhere. The planner ignores time of day.
- Data is pre-saved: `src/data/venues.json` (24 curated venues, OSM ids) and
  `src/data/walks.json` (walk time, distance and line for every pair). No Overpass,
  no router at runtime. Map tiles come from OpenFreeMap and are cached for offline.
- Cut for v1: seasonal skins, events, wind-down screen, "Remind us next July",
  weather, busyness, ride links, check-in sheet, dwell timer, geofence.

## Data

Venue: `id` (OSM `node/…` or `way/…`), `name`, `short`, `vibe` (pub, cocktails,
bar, food), `district` (downtown, between, old-village), `lat`, `lon`. Vibes are set
by hand in `scripts/curate-venues.mjs`; OSM categories are wrong for several places.
Highline Room, Sardine Room and The Ledger are Cocktails. Box Bar is closed and left out.
Daytime and takeout places (cafes, fast food, Omelette & Waffle, Maya's Deli,
The Takeout Box, Eats and Sweets) are left out.

## The night

1. **Start screen.** Pick a starting vibe (Pub, Cocktails, Bar, Food) and a route
   shape: "Downtown, finish in Old Village" (default) or "Downtown only". Start.
2. **Stop loop**, six times:
   - Opening a stop (Open stop, or tapping the stop on the timeline or map) is
     arrival. It ends the walk timer and starts the stop timer ("Here for 12:34").
     Stop 1's timer starts on Start.
   - The **Now card** (styled by that venue's own vibe) holds the timer, the Aaron and
     John glass buttons (tap when that glass is empty; tap again to undo), the camera
     (optional photo, tap again to retake) and "Pick another".
   - The **What's next card** (styled by the suggested venue's vibe) holds the four
     vibe buttons, the planned next stop with arrows to flip through two nearby
     alternatives, and "Let's go", which unlocks once both glasses are empty.
   - When both glasses are empty, a **"We're done here"** card slides up over the
     What's next area (nothing under it moves) with the vibe's toast and three
     options: the planned stop preselected and two alternatives, each with vibe and
     walk time. "Let's go" confirms; "Not yet" closes it and un-taps the last name.
   - **Let's go** freezes the stop timer at "Stayed N min" and starts the walk timer.
     If the walk is 3 minutes or more the map comes forward with the route; shorter
     walks read "next door" and stay on the timeline.
   - **Pick another** opens the same confirm card without needing drinks (leaving
     early, or the place is shut). A skipped stop with no drinks still counts its time.
   - **Undo Let's go**: while walking, "Back to <stop>" returns to the stop, discards
     the walk and resumes the stop timer.
3. **Last stop.** On stop 6 the What's next card becomes "That's the night". Tapping
   it (unlocked once both glasses are empty, or via Pick another's "End the night")
   shows a "That's the night" card, then the recap.
4. **Recap.** Postcard: route sketch, each stop with its stamp, photo thumbnail (dashed
   frame if none), arrival time and minutes stayed, walk minutes between stops, and
   totals for time out, at stops and walking. "Save postcard" saves an image.
   "New night" clears the night (asks first).

## Planner

A pure function of venues, walks, active vibe, route shape and history (visited stops
plus the current one). It returns the remaining stops up to six.

- Downtown stops first. With "finish in Old Village", the last two stops are in Old
  Village; the crossing happens once. "Head to Old Village" (on the confirm card)
  moves the crossing to the next stop, and every stop after it stays in Old Village.
- Each slot takes the unvisited venue of the active vibe in that slot's district with
  the shortest walk from the previous stop. Bode's ("between") counts as Old Village.
- If no venue of the vibe is left in that district, it takes the nearest venue of the
  closest other vibe (pub → bar → cocktails → food; cocktails → pub → bar → food;
  bar → pub → cocktails → food; food → pub → bar → cocktails) and tags it
  "Closest match".
- Alternatives for the confirm card: the two nearest other unvisited venues allowed
  in that slot, same vibe first.
- Changing the vibe re-plans only upcoming stops. Done and current stops never change.
  Tapping the previous vibe gives back the previous plan (the planner is deterministic).
  A picked alternative becomes the next stop and the rest re-plans from it.

## Vibes and themes

The active vibe themes the chrome (header, bottom bar, What's next, map tint). Each
venue keeps its own stamp and look on its Now card, timeline row, map pin and recap
row. A vibe tap changes only colour, type, texture and upcoming names; every element
keeps its position and size (fixed-height slots, always three upcoming rows, same 2 px
borders). Cross-fade 400 ms.

| Vibe | Theme | Ground / accent / text | Fonts | Texture | Toast |
|---|---|---|---|---|---|
| Pub | Celtic | #0F1A14 / brass #D4A64A / #F4EEE6 | Uncial Antiqua | ribbon-stripe mahogany (`mahogany.svg`), continuous, brass rule; brass knotwork frame around the map | Sláinte! |
| Cocktails | Deco lounge | #0E1018 / champagne #E6D3A8 / ivory | Playfair Display (italic wordmark) | champagne pinstripes, double hairline frame, near-square corners | Cheers. |
| Bar | Retro arcade | #1C130C / mustard #E3A82B / #F6E7C8 | Press Start 2P wordmark, VT323 names | printed woodgrain laminate (`laminate.svg`), arcade-screen card with bezel and static scanlines, arcade-button lip | That's a daisy! |
| Food | Neutral | #161514 / sand #D9C7A7 / #F4EEE6 | Fraunces | plain | Cheers! |

Stamps: Pub brass shield with knot, Cocktails champagne diamond with coupe, Bar pixel
tile with pint, Food sand plate with fork and knife. Every screen has the same header:
the "Crawl" wordmark in the active vibe's font and accent, clock on the right. UI text
is Inter, 15 px minimum, tap targets 56 px. No helper-label cruft ("one tap", "leave
together"). No red anywhere.

## Views

- **Timeline**: done stops as one line each (stamp, name, stayed minutes), the current
  stop as a card, then exactly three upcoming rows (Old Village hop is a detail line,
  not a row), then the What's next panel with the vibe buttons. Bottom bar: current
  stop, one-line status ("John still sipping", "Walking to Penn Bar · 3 min"), Open stop.
- **Map**: OpenFreeMap dark style retinted per vibe in place (paint overrides, no
  restyle). Plan pins (done, current, next, later) never cluster and carry their
  stamps; other curated venues on the Kellogg Park block merge into one "N on this
  block" pill. Route: walked legs grey, active leg in the accent, later legs dashed.
  Fixed framing; an edge chip points north to Old Village when it is off screen.
  What's next sheet with the vibe buttons. Celtic adds a brass knotwork frame.
- **Stop**: the Now card and the What's next card. The only place with drink buttons,
  camera and timer.

## Timing and state

All times are timestamps from one clock module (`now()`), which demo mode replaces.
Stop: `arrivedAt`, `leftAt`. Walk: from `leftAt` to the next `arrivedAt`. The UI
repaints once a second. State saves to localStorage on every action; photos (downscaled
to 1600 px JPEG) go to IndexedDB. A reload or the camera unloading the page loses
nothing. The app asks for persistent storage and holds a screen wake lock at a stop.

## Demo mode

`?demo` or the menu turns it on. A fake clock starts at 8:00 pm on a July Saturday and
runs at a chosen speed (1×, 10×, 60×). "Play the night" scripts a full night at a desk
in about five minutes: it opens each stop, waits, taps Aaron then John, confirms the
planned stop, walks the real walk time, and ends with the recap. Any tap stops the
script. Demo mode never touches a real night's state (separate storage key).

## Offline and install

Service worker precaches the app shell, fonts and data, and caches map style, glyphs
and tiles for the two districts on first load. Web app manifest, home-screen icon,
standalone display, dark status bar. Hosted on GitHub Pages (HTTPS) by a workflow.

## Out of scope edge cases (defaults chosen)

- Ending early: "End the night" lives on the confirm card from stop 4 onward and in
  the menu; the recap shows the stops visited.
- Starting over mid-night: menu, "New night", with a confirm.
- A venue visited twice: never planned or offered.
