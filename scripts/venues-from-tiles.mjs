// Build src/data/venues.json from tile POIs dumped by the browser (fallback when Overpass is unreachable).
// Usage: node scripts/venues-from-tiles.mjs pois.json
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeTilePois, BBOX } from '../src/osm.ts';

const pois = JSON.parse(await readFile(process.argv[2], 'utf8'));
const venues = normalizeTilePois(pois);
await writeFile(new URL('../src/data/venues.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors (ODbL), via OpenFreeMap/OpenMapTiles POI layer (Overpass unreachable at snapshot time: no hours/addresses)',
  fetchedAt: new Date().toISOString(), bbox: BBOX, venues,
}, null, 2) + '\n');
console.log(`Wrote ${venues.length} venues`);
