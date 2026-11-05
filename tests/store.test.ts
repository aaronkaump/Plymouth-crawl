import { beforeEach, describe, expect, it } from 'vitest';
import { advance, demoStart, now, realNow, useFakeClock } from '../src/clock';
import { options, planInput } from '../src/planner';
import * as store from '../src/store';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
};
const MIN = 60000;
const night = () => store.state.night!;

describe('the stop loop', () => {
  beforeEach(() => {
    mem.clear();
    useFakeClock({ fakeBase: demoStart(), realBase: realNow(), speed: 0 });
    store.useStorage(true);
    store.startNight('pub', 'old-village');
  });

  it('starts stop 1 on Start and opens the stop view', () => {
    expect(night().stops).toHaveLength(1);
    expect(night().stops[0].arrivedAt).toBe(now());
    expect(store.state.ui.view).toBe('stop');
  });

  it('opens the confirm card when both glasses are empty; Not yet un-taps the last name', () => {
    store.toggleDrink('aaron');
    expect(store.state.ui.confirmOpen).toBe(false);
    store.toggleDrink('john');
    expect(store.state.ui.confirmOpen).toBe(true);
    store.notYet();
    expect(store.state.ui.confirmOpen).toBe(false);
    expect(store.current(night()).john).toBeNull();
    expect(store.current(night()).aaron).not.toBeNull();
  });

  it("times the stop until Let's go and the walk until the next stop is opened", () => {
    const t0 = now();
    advance(37 * MIN);
    store.toggleDrink('aaron');
    store.toggleDrink('john');
    advance(3 * MIN); // emptying glasses doesn't stop the timer
    const [next] = options(planInput(night()));
    store.go(next.venue.id, next.closestMatch);
    expect(night().stops[0].leftAt! - t0).toBe(40 * MIN);
    expect(store.walking(night())).toBe(true);
    advance(4 * MIN);
    store.arrive();
    expect(night().stops[1].arrivedAt! - night().stops[0].leftAt!).toBe(4 * MIN);
    expect(store.walking(night())).toBe(false);
  });

  it('undo after Let\'s go resumes the stop', () => {
    const [next] = options(planInput(night()));
    store.go(next.venue.id, false);
    store.undoGo();
    expect(night().stops).toHaveLength(1);
    expect(night().stops[0].leftAt).toBeNull();
  });

  it('vibe taps never change done or current stops', () => {
    const [next] = options(planInput(night()));
    store.go(next.venue.id, false);
    store.arrive();
    const before = night().stops.map((s) => s.venueId);
    store.setVibe('cocktails');
    expect(night().stops.map((s) => s.venueId)).toEqual(before);
    expect(store.upcoming(night())[0].venue.vibe).toBe('cocktails');
  });

  it('a whole night ends after six stops', () => {
    for (let i = 0; i < 5; i++) {
      store.toggleDrink('aaron'); store.toggleDrink('john');
      const [o] = options(planInput(night()));
      store.go(o.venue.id, o.closestMatch);
      advance(5 * MIN);
      store.arrive();
    }
    expect(store.isLastStop(night())).toBe(true);
    expect(options(planInput(night()))).toEqual([]);
    store.endNight();
    expect(night().endedAt).not.toBeNull();
    expect(night().stops.every((s) => s.leftAt !== null)).toBe(true);
  });

  it('Head to Old Village sends the next stop up Main', () => {
    store.headToOldVillage();
    const [o] = options(planInput(night()));
    expect(o.venue.district).not.toBe('downtown');
  });
});
