// The planner: a pure function of the venues, walks, the active vibe, the route shape
// and the night so far. It never looks at the clock, so the same inputs always give
// the same plan, which is what makes "tap the previous vibe" an undo.
import { KELLOGG_PARK, VENUES, distM, isOldVillageSide, walkS } from './data';
import type { Night, PlannedStop, Shape, Venue, Vibe } from './types';

export const STOPS_PER_NIGHT = 6;
export const OLD_VILLAGE_STOPS = 2;

/** When a vibe has nothing left, try these vibes in order. */
export const FALLBACK: Record<Vibe, Vibe[]> = {
  pub: ['bar', 'cocktails', 'food'],
  cocktails: ['pub', 'bar', 'food'],
  bar: ['pub', 'cocktails', 'food'],
  food: ['pub', 'bar', 'cocktails'],
};

export interface PlanInput {
  vibe: Vibe;
  shape: Shape;
  crossAt: number | null;
  /** Venue ids already in the night (visited, current, or being walked to), in order. */
  taken: string[];
  venues?: Venue[];
}

/** Index of the first Old Village stop, or Infinity for a downtown-only night. */
export function crossIndex(shape: Shape, crossAt: number | null): number {
  if (crossAt !== null) return crossAt;
  return shape === 'old-village' ? STOPS_PER_NIGHT - OLD_VILLAGE_STOPS : Infinity;
}

const distFromPark = (v: Venue) => distM([v.lon, v.lat], KELLOGG_PARK);

/** Venues allowed in stop slot k (0-based), not yet taken. */
function slotPool(k: number, input: PlanInput, taken: Set<string>): Venue[] {
  const ovSlot = k >= crossIndex(input.shape, input.crossAt);
  return (input.venues ?? VENUES).filter((v) => !taken.has(v.id) && isOldVillageSide(v.district) === ovSlot);
}

/** Cost of walking from the previous stop (or Kellogg Park for stop 1), in seconds. */
function cost(prev: string | null, v: Venue): number {
  return prev ? walkS(prev, v.id) : distFromPark(v) / 1.3;
}

function bestFor(pool: Venue[], prev: string | null, vibe: Vibe): PlannedStop | null {
  for (const want of [vibe, ...FALLBACK[vibe]]) {
    const matches = pool.filter((v) => v.vibe === want);
    if (matches.length) {
      const venue = matches.reduce((a, b) => (cost(prev, b) < cost(prev, a) ? b : a));
      return { venue, closestMatch: want !== vibe };
    }
  }
  return null;
}

/** The rest of the night after the venues already taken. */
export function plan(input: PlanInput): PlannedStop[] {
  const taken = new Set(input.taken);
  const out: PlannedStop[] = [];
  let prev = input.taken.at(-1) ?? null;
  for (let k = input.taken.length; k < STOPS_PER_NIGHT; k++) {
    const pick = bestFor(slotPool(k, input, taken), prev, input.vibe);
    if (!pick) break;
    out.push(pick);
    taken.add(pick.venue.id);
    prev = pick.venue.id;
  }
  return out;
}

/** The planned next stop plus two nearby alternatives for the confirm card. */
export function options(input: PlanInput): PlannedStop[] {
  const [planned] = plan(input);
  if (!planned) return [];
  const taken = new Set([...input.taken, planned.venue.id]);
  const prev = input.taken.at(-1) ?? null;
  const pool = slotPool(input.taken.length, input, taken);
  const byWalk = (a: Venue, b: Venue) => cost(prev, a) - cost(prev, b) || a.name.localeCompare(b.name);
  const same = pool.filter((v) => v.vibe === input.vibe).sort(byWalk);
  const other = pool.filter((v) => v.vibe !== input.vibe).sort(byWalk);
  const alts = [...same, ...other].slice(0, 2).map((venue) => ({ venue, closestMatch: venue.vibe !== input.vibe }));
  return [planned, ...alts];
}

export const planInput = (night: Night): PlanInput => ({
  vibe: night.vibe,
  shape: night.shape,
  crossAt: night.crossAt,
  taken: night.stops.map((s) => s.venueId),
});

/** Can "Head to Old Village" move the crossing to the next stop? */
export function canHeadToOldVillage(night: Night): boolean {
  const next = night.stops.length;
  return next < STOPS_PER_NIGHT && next < crossIndex(night.shape, night.crossAt);
}
