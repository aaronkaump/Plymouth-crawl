import { describe, expect, it } from 'vitest';
import { VENUES, venueById, walkLabel } from '../src/data';
import { STOPS_PER_NIGHT, options, plan } from '../src/planner';
import type { Vibe } from '../src/types';

const names = (ids: { venue: { short: string } }[]) => ids.map((p) => p.venue.short);
const ov = (id: string) => venueById(id).district !== 'downtown';

describe('planner', () => {
  for (const vibe of ['pub', 'cocktails', 'bar', 'food'] as Vibe[]) {
    it(`plans six stops, last two in Old Village (${vibe})`, () => {
      const p = plan({ vibe, shape: 'old-village', crossAt: null, taken: [] });
      expect(p).toHaveLength(STOPS_PER_NIGHT);
      expect(p.map((s) => ov(s.venue.id))).toEqual([false, false, false, false, true, true]);
      expect(new Set(p.map((s) => s.venue.id)).size).toBe(6);
    });
    it(`downtown-only night never crosses (${vibe})`, () => {
      const p = plan({ vibe, shape: 'downtown', crossAt: null, taken: [] });
      expect(p).toHaveLength(6);
      expect(p.some((s) => ov(s.venue.id))).toBe(false);
    });
  }

  it('pub night starts with pubs and tags closest matches once pubs run out', () => {
    const p = plan({ vibe: 'pub', shape: 'old-village', crossAt: null, taken: [] });
    expect(p.slice(0, 3).every((s) => s.venue.vibe === 'pub' && !s.closestMatch)).toBe(true);
    expect(p[3].closestMatch).toBe(true);
    expect(p[3].venue.vibe).toBe('bar'); // pub falls back to bar first
    expect(names(p.slice(4))).toEqual(['Liberty Street', "Hermann's"]);
    expect(p[5].closestMatch).toBe(true);
  });

  it('is deterministic, so tapping the previous vibe restores the plan', () => {
    const taken = [plan({ vibe: 'pub', shape: 'old-village', crossAt: null, taken: [] })[0].venue.id];
    const a = plan({ vibe: 'pub', shape: 'old-village', crossAt: null, taken });
    plan({ vibe: 'cocktails', shape: 'old-village', crossAt: null, taken });
    expect(plan({ vibe: 'pub', shape: 'old-village', crossAt: null, taken })).toEqual(a);
  });

  it('only re-plans what is not taken', () => {
    const first = plan({ vibe: 'bar', shape: 'old-village', crossAt: null, taken: [] });
    const taken = first.slice(0, 2).map((s) => s.venue.id);
    const after = plan({ vibe: 'cocktails', shape: 'old-village', crossAt: null, taken });
    expect(after).toHaveLength(4);
    expect(after.some((s) => taken.includes(s.venue.id))).toBe(false);
    expect(after[0].venue.vibe).toBe('cocktails');
  });

  it('Head to Old Village moves the crossing and stays there', () => {
    const taken = plan({ vibe: 'pub', shape: 'old-village', crossAt: null, taken: [] }).slice(0, 2).map((s) => s.venue.id);
    const p = plan({ vibe: 'pub', shape: 'old-village', crossAt: 2, taken });
    expect(p).toHaveLength(4);
    expect(p.every((s) => ov(s.venue.id))).toBe(true);
  });

  it('offers the planned stop plus two alternatives, all unvisited and distinct', () => {
    const taken = [VENUES.find((v) => v.short === "Sean O'Callaghan's")!.id];
    const o = options({ vibe: 'cocktails', shape: 'old-village', crossAt: null, taken });
    expect(o).toHaveLength(3);
    expect(new Set(o.map((x) => x.venue.id)).size).toBe(3);
    expect(o.every((x) => x.venue.vibe === 'cocktails')).toBe(true);
    expect(o[0]).toEqual(plan({ vibe: 'cocktails', shape: 'old-village', crossAt: null, taken })[0]);
  });

  it('labels short walks as next door and the hop as Old Village', () => {
    const sean = VENUES.find((v) => v.short === "Sean O'Callaghan's")!.id;
    const ebz = VENUES.find((v) => v.short === 'The Ebeneezer')!.id;
    const lib = VENUES.find((v) => v.short === 'Liberty Street')!.id;
    expect(walkLabel(sean, ebz)).toBe('next door');
    expect(walkLabel(sean, lib)).toMatch(/^1[5-9] min hop to Old Village$/);
  });
});
