// Shared OpenStreetMap (Overpass) venue logic, used by the browser app and
// by scripts/fetch-venues.mjs (Node 22+ runs .ts imports directly).

export type Vibe = 'pub' | 'cocktail' | 'bar' | 'restaurant';
export type Zone = 'downtown' | 'old-village' | 'outskirts';
export interface Venue {
  id: string; name: string | null; amenity: string; vibe: Vibe; lat: number; lon: number; zone: Zone;
  address: string | null; cuisine: string | null; openingHours: string | null; website: string | null;
  phone: string | null; outdoorSeating: string | null;
}

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// south, west, north, east: downtown (Kellogg Park) + Old Village + edges.
export const BBOX = [42.355, -83.495, 42.39, -83.445] as const;
export const KELLOGG_PARK = [42.3706, -83.4697] as const;
export const OLD_VILLAGE = [42.379, -83.462] as const;

export const QUERY = `[out:json][timeout:60];
nwr["amenity"~"^(pub|bar|restaurant|biergarten|nightclub)$"](${BBOX.join(',')});
out center tags;`;

export function distM(a: readonly number[], b: readonly number[]): number {
  const r = Math.PI / 180;
  const x = (b[1] - a[1]) * r * Math.cos(((a[0] + b[0]) / 2) * r), y = (b[0] - a[0]) * r;
  return Math.round(Math.hypot(x, y) * 6371000);
}

function vibeFor(t: Record<string, string>): Vibe {
  const name = (t.name || '').toLowerCase();
  if (t.amenity === 'pub' || /irish|pub|tavern|ale house/.test(name)) return 'pub';
  if (/cocktail|lounge|speakeasy/.test(name) || t.amenity === 'nightclub') return 'cocktail';
  if (t.amenity === 'bar' || t.amenity === 'biergarten' || /\bbrew|\bbar\b|saloon|pourhouse/.test(name)) return 'bar';
  return 'restaurant';
}

interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

export function normalize(elements: OsmElement[]): Venue[] {
  return elements
    .map((el): Venue => {
      const t = el.tags ?? {};
      const lat = el.lat ?? el.center?.lat ?? 0, lon = el.lon ?? el.center?.lon ?? 0;
      const zone: Zone = distM([lat, lon], KELLOGG_PARK) < 600 ? 'downtown' : distM([lat, lon], OLD_VILLAGE) < 600 ? 'old-village' : 'outskirts';
      return {
        id: `${el.type}/${el.id}`, name: t.name ?? null, amenity: t.amenity, vibe: vibeFor(t), lat, lon, zone,
        address: t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : null,
        cuisine: t.cuisine ?? null, openingHours: t.opening_hours ?? null,
        website: t.website ?? t['contact:website'] ?? null, phone: t.phone ?? t['contact:phone'] ?? null,
        outdoorSeating: t.outdoor_seating ?? null,
      };
    })
    .filter((v) => v.lat && v.lon)
    .sort((a, b) => a.zone.localeCompare(b.zone) || (a.name ?? '').localeCompare(b.name ?? ''));
}

export async function fetchVenues(timeoutMs = 90000): Promise<Venue[]> {
  const errors: string[] = [];
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalize((await res.json()).elements);
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Overpass unavailable (${errors.join('; ')})`);
}

// ---- Walking routes (public OSRM foot router run by FOSSGIS) ----
export const OSRM = 'https://routing.openstreetmap.de/routed-foot';

export interface Leg { from: string; to: string; durationS: number; distanceM: number; geometry: { type: 'LineString'; coordinates: number[][] } }

export async function routeLeg(a: Venue, b: Venue): Promise<Leg> {
  const res = await fetch(`${OSRM}/route/v1/foot/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()).routes[0];
  return { from: a.id, to: b.id, durationS: Math.round(r.duration), distanceM: Math.round(r.distance), geometry: r.geometry };
}

export async function walkingMatrix(stops: Venue[]): Promise<{ durationsS: number[][]; distancesM: number[][] }> {
  const coords = stops.map((v) => `${v.lon},${v.lat}`).join(';');
  const res = await fetch(`${OSRM}/table/v1/foot/${coords}?annotations=duration,distance`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const t = await res.json();
  return { durationsS: t.durations.map((r: number[]) => r.map(Math.round)), distancesM: t.distances.map((r: number[]) => r.map(Math.round)) };
}

/**
 * Greedy nearest-neighbour crawl from the drinking stop closest to Kellogg Park,
 * skipping stops under `minS` seconds away so the sample actually moves around town.
 */
export function sampleOrder(stops: Venue[], durationsS: number[][], max = 6, minS = 120): number[] {
  const drinkIdx = stops.map((v, i) => (v.vibe === 'restaurant' ? -1 : i)).filter((i) => i >= 0);
  const pool = drinkIdx.length >= 2 ? drinkIdx : stops.map((_, i) => i);
  const d = (i: number) => distM([stops[i].lat, stops[i].lon], KELLOGG_PARK);
  const start = pool.reduce((a, b) => (d(b) < d(a) ? b : a));
  const order = [start];
  const left = new Set(pool.filter((i) => i !== start));
  while (left.size && order.length < max) {
    const last = order[order.length - 1];
    const cands = [...left].filter((j) => durationsS[last][j] >= minS);
    const from = cands.length ? cands : [...left];
    const best = from.reduce((a, b) => (durationsS[last][b] < durationsS[last][a] ? b : a));
    order.push(best);
    left.delete(best);
  }
  return order;
}

/** Crawl-worthy stops: named, and in downtown or Old Village. */
export const crawlStops = (venues: Venue[]) => venues.filter((v) => v.name && v.zone !== 'outskirts');

// ---- Fallback: OSM POIs baked into OpenFreeMap vector tiles (OpenMapTiles "poi" layer) ----
// Same OSM source, but only name + class survive in tiles: no hours, address, website.
export const POI_SUBCLASSES = new Set(['pub', 'bar', 'restaurant', 'biergarten', 'nightclub']);
export interface TilePoi { id?: string | number; name?: string; subclass?: string; lon: number; lat: number }

export function normalizeTilePois(pois: TilePoi[]): Venue[] {
  const [s, w, n, e] = BBOX;
  const seen = new Set<string>();
  return normalize(
    pois
      .filter((p) => p.subclass && POI_SUBCLASSES.has(p.subclass) && p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e)
      .filter((p) => { const k = `${p.name}|${p.lat.toFixed(4)}`; return !seen.has(k) && !!seen.add(k); })
      .map((p) => ({ type: 'tile', id: Number(p.id ?? 0), lat: p.lat, lon: p.lon, tags: { name: p.name ?? '', amenity: p.subclass! } })),
  );
}
