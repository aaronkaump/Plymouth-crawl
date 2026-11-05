// Snapshot downtown Plymouth + Old Village venues from the main OSM API (one
// read-only /map call; Overpass is blocked from the home IP) into
// src/data/venues-osm.json.  Run: node scripts/fetch-venues-osmapi.mjs
// Optional: pass another bbox (west,south,east,north) to merge into the existing file.
import { readFile, writeFile } from 'node:fs/promises';

const BBOX = process.argv[2] ? process.argv[2].split(',').map(Number) : [-83.479, 42.366, -83.462, 42.386]; // west, south, east, north
const AMENITIES = new Set(['bar', 'pub', 'restaurant', 'biergarten', 'nightclub', 'cafe', 'fast_food']);
const URL_ = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${BBOX.join(',')}`;

const res = await fetch(URL_, {
  headers: { 'User-Agent': 'plymouth-crawl-demo/0.1', Accept: 'application/json' },
  signal: AbortSignal.timeout(60000),
});
if (!res.ok) throw new Error(`OSM API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
const { elements } = await res.json();

const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
const round = (x) => Math.round(x * 1e7) / 1e7;

const venues = [];
for (const el of elements) {
  const t = el.tags ?? {};
  if (!AMENITIES.has(t.amenity) || (el.type !== 'node' && el.type !== 'way')) continue;
  let lat = el.lat, lon = el.lon;
  if (el.type === 'way') {
    // Closed ways repeat the first node; drop it so it isn't double-weighted.
    const ids = el.nodes.length > 1 && el.nodes[0] === el.nodes.at(-1) ? el.nodes.slice(0, -1) : el.nodes;
    const pts = ids.map((id) => nodes.get(id)).filter(Boolean);
    if (!pts.length) continue;
    lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  }
  const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null;
  venues.push({
    id: `${el.type}/${el.id}`, name: t.name ?? null, lat: round(lat), lon: round(lon),
    amenity: t.amenity, cuisine: t.cuisine ?? null, opening_hours: t.opening_hours ?? null,
    addr, website: t.website ?? t['contact:website'] ?? null,
  });
}
const OUT = new URL('../src/data/venues-osm.json', import.meta.url);
let bbox = BBOX, fetched = venues.length;
if (process.argv[2]) {
  // Merge mode: keep earlier venues, newer fetch wins on duplicate ids, bbox becomes the union.
  const prev = JSON.parse(await readFile(OUT, 'utf8'));
  const byId = new Map(prev.venues.map((v) => [v.id, v]));
  for (const v of venues) byId.set(v.id, v);
  venues.length = 0; venues.push(...byId.values());
  const b = prev.bbox;
  bbox = [Math.min(b[0], BBOX[0]), Math.min(b[1], BBOX[1]), Math.max(b[2], BBOX[2]), Math.max(b[3], BBOX[3])];
}
venues.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

await writeFile(OUT, JSON.stringify({
  source: 'OpenStreetMap contributors via api.openstreetmap.org /api/0.6/map (ODbL)',
  fetchedAt: new Date().toISOString(), bbox, venues,
}, null, 2) + '\n');
console.log(`Fetched ${fetched} in box; wrote ${venues.length} venues (${venues.filter((v) => v.opening_hours).length} with opening_hours) from ${elements.length} OSM elements`);
