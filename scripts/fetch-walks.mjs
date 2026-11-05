// Precompute every walking leg between curated venues (src/data/walks.json) so the
// app never calls a router at runtime. One route per unordered pair; the app
// reverses the line for the other direction. Uses the public FOSSGIS OSRM foot
// router at about one request per second (its fair-use rate).
// Run after `npm run curate`:  npm run fetch:walks   (about 5 minutes)
import { readFile, writeFile } from 'node:fs/promises';

const OSRM = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { venues } = JSON.parse(await readFile(new URL('../src/data/venues.json', import.meta.url)));
const r5 = (x) => Math.round(x * 1e5) / 1e5;

const n = venues.length;
const durationsS = Array.from({ length: n }, () => Array(n).fill(0));
const distancesM = Array.from({ length: n }, () => Array(n).fill(0));
const lines = {};
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const a = venues[i], b = venues[j];
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        r = (await res.json()).routes[0];
        break;
      } catch (e) {
        console.warn(`${a.short} -> ${b.short}: ${e.message}, retrying`);
        await sleep(2000 * 2 ** attempt);
      }
    }
    if (!r) throw new Error(`No route ${a.id} -> ${b.id}`);
    durationsS[i][j] = durationsS[j][i] = Math.round(r.duration);
    distancesM[i][j] = distancesM[j][i] = Math.round(r.distance);
    lines[`${i}-${j}`] = r.geometry.coordinates.map(([x, y]) => [r5(x), r5(y)]);
    process.stdout.write('.');
    await sleep(1050);
  }
}
await writeFile(new URL('../src/data/walks.json', import.meta.url), JSON.stringify({
  source: 'OSRM foot profile at routing.openstreetmap.de (FOSSGIS); OSM data (ODbL)',
  fetchedAt: new Date().toISOString(),
  ids: venues.map((v) => v.id),
  durationsS, distancesM, lines,
}) + '\n');
console.log(`\n${n}x${n} walks, ${Object.keys(lines).length} lines`);
