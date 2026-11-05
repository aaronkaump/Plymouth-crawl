// Snapshot Plymouth venues from OpenStreetMap into src/data/venues.json.
// Run: npm run fetch:venues   (Node 22.18+ for direct .ts import)
import { writeFile } from 'node:fs/promises';
import { fetchVenues, BBOX } from '../src/osm.ts';

const venues = await fetchVenues();
await writeFile(new URL('../src/data/venues.json', import.meta.url), JSON.stringify({
  source: 'OpenStreetMap contributors via Overpass API (ODbL)',
  fetchedAt: new Date().toISOString(), bbox: BBOX, venues,
}, null, 2) + '\n');
console.log(`Wrote ${venues.length} venues (${venues.filter((v) => v.openingHours).length} with opening_hours)`);
