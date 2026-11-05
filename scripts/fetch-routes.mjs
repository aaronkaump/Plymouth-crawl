// Precompute the all-pairs walking matrix + a sample crawl's leg geometries.
// Run after fetch:venues:  npm run fetch:routes
// FOSSGIS fair use: keep it to a handful of requests, ~1/s.
import { readFile, writeFile } from 'node:fs/promises';
import { crawlStops, walkingMatrix, sampleOrder, routeLeg } from '../src/osm.ts';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { venues } = JSON.parse(await readFile(new URL('../src/data/venues.json', import.meta.url)));
const stops = crawlStops(venues);
const matrix = await walkingMatrix(stops);
const order = sampleOrder(stops, matrix.durationsS);
const sampleCrawl = [];
for (let k = 0; k < order.length - 1; k++) {
  await sleep(1100);
  sampleCrawl.push(await routeLeg(stops[order[k]], stops[order[k + 1]]));
}
await writeFile(new URL('../src/data/routes.json', import.meta.url), JSON.stringify({
  source: 'OSRM foot profile at routing.openstreetmap.de (FOSSGIS); OSM data (ODbL)',
  fetchedAt: new Date().toISOString(), ids: stops.map((v) => v.id), ...matrix, sampleCrawl,
}) + '\n');
console.log(`Matrix ${stops.length}x${stops.length}; sample crawl ${sampleCrawl.length} legs`);
