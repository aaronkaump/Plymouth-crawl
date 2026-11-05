import venuesFile from './data/venues.json';
import walksFile from './data/walks.json';
import type { District, Venue } from './types';

export const VENUES = venuesFile.venues as Venue[];
const index = new Map(VENUES.map((v, i) => [v.id, i]));
export const venueById = (id: string): Venue => {
  const i = index.get(id);
  if (i === undefined) throw new Error(`Unknown venue ${id}`);
  return VENUES[i];
};

if (walksFile.ids.join() !== VENUES.map((v) => v.id).join()) {
  console.warn('walks.json is out of date with venues.json; run npm run fetch:walks');
}
const walkIndex = new Map(walksFile.ids.map((id: string, i: number) => [id, i]));

/** Kellogg Park fountain, the centre of downtown. */
export const KELLOGG_PARK: [number, number] = [-83.4697, 42.3706];
/** Midpoint of Old Village's two bars on Liberty Street. */
export const OLD_VILLAGE: [number, number] = [-83.4615, 42.3792];

export function distM(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r), y = (b[1] - a[1]) * r;
  return Math.hypot(x, y) * 6371000;
}

/** Walking seconds between two venues, from the precomputed matrix. */
export function walkS(a: string, b: string): number {
  if (a === b) return 0;
  const i = walkIndex.get(a), j = walkIndex.get(b);
  if (i === undefined || j === undefined) {
    // Fallback for a venue missing from the matrix: straight line at 1.3 m/s, plus 25 %.
    const va = venueById(a), vb = venueById(b);
    return Math.round((distM([va.lon, va.lat], [vb.lon, vb.lat]) * 1.25) / 1.3);
  }
  return walksFile.durationsS[i][j];
}

/** The walking line from a to b as [lon, lat] pairs. */
export function walkLine(a: string, b: string): [number, number][] {
  const i = walkIndex.get(a), j = walkIndex.get(b);
  if (i === undefined || j === undefined || i === j) {
    const va = venueById(a), vb = venueById(b);
    return [[va.lon, va.lat], [vb.lon, vb.lat]];
  }
  const lines = walksFile.lines as unknown as Record<string, [number, number][]>;
  return i < j ? lines[`${i}-${j}`] : [...lines[`${j}-${i}`]].reverse();
}

export const isOldVillageSide = (d: District) => d !== 'downtown';

/** "next door", "4 min walk" or "18 min hop to Old Village". */
export function walkLabel(from: string, to: string): string {
  const s = walkS(from, to);
  const crossing = !isOldVillageSide(venueById(from).district) && isOldVillageSide(venueById(to).district);
  if (s < 120 && !crossing) return 'next door';
  const m = Math.max(1, Math.round(s / 60));
  return crossing ? `${m} min hop to Old Village` : `${m} min walk`;
}

/** The bar block facing Kellogg Park: unplanned venues here merge into one map pill. */
export const BLOCK_CENTRE: [number, number] = [-83.46945, 42.37065];
const BLOCK_RADIUS_M = 90;
export const nearBlock = (v: Venue) => distM([v.lon, v.lat], BLOCK_CENTRE) < BLOCK_RADIUS_M;

/** Candidates on the Kellogg Park block that aren't in the plan. */
export function blockCandidates(planIds: Set<string>): Venue[] {
  return VENUES.filter((v) => !planIds.has(v.id) && nearBlock(v));
}

