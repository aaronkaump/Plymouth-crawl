// Demo mode: a fake clock and a scripted night, so a whole crawl plays at a desk.
import { advance, demoStart, fakeClock, realNow, setSpeed, useFakeClock } from './clock';
import { walkS } from './data';
import { options, planInput } from './planner';
import {
  arrive, clearNight, current, endNight, isLastStop, seeRecap, setUi, setVibe, startNight, state, toggleDrink, useStorage, walking,
} from './store';
import { letsGo } from './ui';
import type { Vibe } from './types';

const CLOCK_KEY = 'crawl.demoClock.v1';
const MODE_KEY = 'crawl.demoMode';
let running = false;
let abort = false;
let onChange: () => void = () => {};

export const playing = () => running;
export const isOn = () => !!fakeClock();

function saveClock() {
  try { localStorage.setItem(CLOCK_KEY, JSON.stringify(fakeClock())); } catch { /* ignore */ }
}

export function init(rerender: () => void) {
  onChange = rerender;
  const q = new URLSearchParams(location.search);
  let on = false;
  try {
    if (q.has('demo')) localStorage.setItem(MODE_KEY, q.get('demo') === '0' ? '0' : '1');
    on = localStorage.getItem(MODE_KEY) === '1';
  } catch { on = q.has('demo') && q.get('demo') !== '0'; }
  if (on) enable(false);
  else useStorage(false);
  // Any real tap stops the scripted night.
  addEventListener('pointerdown', (e) => { if (running && e.isTrusted && !(e.target as HTMLElement).closest('.sheet')) abort = true; }, true);
}

function enable(fresh: boolean) {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(CLOCK_KEY) ?? 'null'); } catch { /* ignore */ }
  useFakeClock(fresh || !c ? { fakeBase: demoStart(), realBase: realNow(), speed: 1 } : c);
  saveClock();
  useStorage(true);
}

export function toggle() {
  if (isOn()) {
    abort = true;
    try { localStorage.setItem(MODE_KEY, '0'); } catch { /* ignore */ }
    useFakeClock(null);
    useStorage(false);
  } else {
    try { localStorage.setItem(MODE_KEY, '1'); } catch { /* ignore */ }
    enable(false);
  }
  onChange();
}

export function speed(sp: number) { setSpeed(sp); saveClock(); onChange(); }
export function skip(min: number) { advance(min * 60000); saveClock(); onChange(); }

class Stopped extends Error {}

/** Wait `realMs` while the fake clock moves `fakeMs` forward smoothly. */
async function wait(realMs: number, fakeMs = 0) {
  const steps = Math.max(1, Math.round(realMs / 100));
  for (let i = 0; i < steps; i++) {
    if (abort) throw new Stopped();
    await new Promise((r) => setTimeout(r, realMs / steps));
    if (fakeMs) advance(fakeMs / steps);
  }
  saveClock();
}

// Minutes at each stop and the vibe tapped there, for a night with some variety.
const DWELL = [37, 34, 40, 29, 46, 45];
const VIBE_TAP: Record<number, Vibe> = { 2: 'cocktails', 3: 'bar', 4: 'pub' };

export async function play() {
  if (running) { abort = true; return; }
  if (!isOn()) enable(false);
  running = true;
  abort = false;
  onChange();
  try {
    const n0 = state.night;
    if (!n0 || n0.endedAt) {
      clearNight();
      useFakeClock({ fakeBase: demoStart(), realBase: realNow(), speed: 1 });
      setUi({ setupVibe: 'pub', setupShape: 'old-village' });
      await wait(2500);
      startNight('pub', 'old-village');
    }
    setSpeed(1);
    for (;;) {
      const n = state.night!;
      if (n.endedAt) break;
      if (walking(n)) {
        const prev = n.stops[n.stops.length - 2];
        const left = walkS(prev.venueId, current(n).venueId) * 1000;
        await wait(left >= 180000 ? 7000 : 3000, left);
        arrive();
        await wait(1500);
        continue;
      }
      const k = n.stops.length;
      setUi({ view: 'stop', confirmOpen: false });
      const dwell = DWELL[(k - 1) % DWELL.length] * 60000;
      await wait(5000, dwell * 0.4);
      if (VIBE_TAP[k]) { setVibe(VIBE_TAP[k]); await wait(3000, dwell * 0.1); }
      await wait(5000, dwell * 0.35);
      if (current(n).aaron === null) toggleDrink('aaron');
      await wait(2500, dwell * 0.15);
      if (current(n).john === null) toggleDrink('john');
      await wait(3500);
      if (isLastStop(n)) {
        endNight();
        await wait(4000);
        seeRecap();
        break;
      }
      const [planned] = options(planInput(n));
      letsGo(planned);
      await wait(1500);
    }
  } catch (e) {
    if (!(e instanceof Stopped)) throw e;
  } finally {
    running = false;
    saveClock();
    onChange();
  }
}
