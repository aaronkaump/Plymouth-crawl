// App state: the night (persisted on every action) and a little UI state.
import { now } from './clock';
import { STOPS_PER_NIGHT, canHeadToOldVillage, plan, planInput } from './planner';
import type { Night, Person, Shape, Stop, View, Vibe } from './types';

export interface UiState {
  view: View;
  /** The "We're done here" card is up. */
  confirmOpen: boolean;
  /** Which option the What's next card / confirm card has selected (0 = planned). */
  pick: number;
  menuOpen: boolean;
  /** Setup screen choices before Start. */
  setupVibe: Vibe;
  setupShape: Shape;
}

export interface State {
  night: Night | null;
  ui: UiState;
}

const KEY_REAL = 'crawl.night.v1';
const KEY_DEMO = 'crawl.demo.v1';
let storageKey = KEY_REAL;

const freshUi = (): UiState => ({ view: 'timeline', confirmOpen: false, pick: 0, menuOpen: false, setupVibe: 'pub', setupShape: 'old-village' });

export let state: State = { night: null, ui: freshUi() };
const listeners = new Set<() => void>();
export const subscribe = (f: () => void) => listeners.add(f);

function load(): State {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const s = JSON.parse(raw) as State;
      return { night: s.night, ui: { ...freshUi(), ...s.ui, menuOpen: false } };
    }
  } catch { /* private mode or bad data: start fresh */ }
  return { night: null, ui: freshUi() };
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

/** Switch between the real night and the demo night (kept apart so a demo never touches a real night). */
export function useStorage(demo: boolean) {
  storageKey = demo ? KEY_DEMO : KEY_REAL;
  state = load();
  emit();
}

function emit() { listeners.forEach((f) => f()); }

export function set(f: (s: State) => void) {
  f(state);
  save();
  emit();
}
export const setUi = (patch: Partial<UiState>) => set((s) => { Object.assign(s.ui, patch); });

// ---- Derived ----

export const current = (n: Night): Stop => n.stops[n.stops.length - 1];
export const walking = (n: Night) => n.endedAt === null && current(n).arrivedAt === null;
export const previous = (n: Night): Stop | undefined => n.stops[n.stops.length - 2];
export const bothEmpty = (s: Stop) => s.aaron !== null && s.john !== null;
export const isLastStop = (n: Night) => n.stops.length >= STOPS_PER_NIGHT;
export const upcoming = (n: Night) => plan(planInput(n));

// ---- Actions ----

const newStop = (venueId: string, closestMatch: boolean, arrivedAt: number | null): Stop =>
  ({ venueId, closestMatch, arrivedAt, leftAt: null, aaron: null, john: null, photo: false });

export function startNight(vibe: Vibe, shape: Shape) {
  const t = now();
  const night: Night = { id: String(t), startedAt: t, vibe, shape, crossAt: null, stops: [], lastTapped: null, endedAt: null, recapSeen: false };
  const [first] = plan(planInput(night));
  night.stops.push(newStop(first.venue.id, first.closestMatch, t));
  set((s) => { s.night = night; s.ui = { ...freshUi(), view: 'stop' }; });
}

/** Opening the next stop is arrival: it ends the walk and starts the stop timer. */
export function arrive() {
  set((s) => {
    const n = s.night;
    if (!n || !walking(n)) return;
    current(n).arrivedAt = now();
    s.ui.view = 'stop';
    s.ui.pick = 0;
    s.ui.confirmOpen = false;
  });
}

export function toggleDrink(p: Person) {
  set((s) => {
    const n = s.night;
    if (!n || walking(n) || n.endedAt) return;
    const stop = current(n);
    stop[p] = stop[p] === null ? now() : null;
    n.lastTapped = stop[p] === null ? null : p;
    s.ui.confirmOpen = bothEmpty(stop);
    if (s.ui.confirmOpen) s.ui.pick = 0;
  });
}

/** "Not yet": close the confirm card and un-tap the last name. */
export function notYet() {
  set((s) => {
    const n = s.night;
    s.ui.confirmOpen = false;
    if (!n) return;
    const stop = current(n);
    const p = n.lastTapped ?? (stop.john !== null ? 'john' : stop.aaron !== null ? 'aaron' : null);
    if (p && bothEmpty(stop)) stop[p] = null;
    n.lastTapped = null;
  });
}

export function setPhoto(has: boolean) {
  set((s) => { if (s.night) current(s.night).photo = has; });
}

export function setVibe(v: Vibe) {
  set((s) => {
    if (s.night) s.night.vibe = v;
    else s.ui.setupVibe = v;
    s.ui.pick = 0;
  });
}

/** Let's go: freeze the stop timer and start walking to the chosen venue. */
export function go(venueId: string, closestMatch: boolean): number {
  let walkFromTo = 0;
  set((s) => {
    const n = s.night;
    if (!n || walking(n) || isLastStop(n)) return;
    const t = now();
    current(n).leftAt = t;
    n.stops.push(newStop(venueId, closestMatch, null));
    n.lastTapped = null;
    s.ui.confirmOpen = false;
    s.ui.pick = 0;
    walkFromTo = 1;
  });
  return walkFromTo;
}

/** Back to the stop we just left: discard the walk, resume the stop timer. */
export function undoGo() {
  set((s) => {
    const n = s.night;
    if (!n || !walking(n) || n.stops.length < 2) return;
    n.stops.pop();
    current(n).leftAt = null;
    s.ui.view = 'stop';
    s.ui.confirmOpen = false;
  });
}

export function headToOldVillage() {
  set((s) => {
    const n = s.night;
    if (!n || !canHeadToOldVillage(n)) return;
    n.shape = 'old-village';
    n.crossAt = n.stops.length;
    s.ui.pick = 0;
  });
}

export function endNight() {
  set((s) => {
    const n = s.night;
    if (!n || n.endedAt) return;
    const t = now();
    if (walking(n)) n.stops.pop(); // never arrived, so it isn't part of the night
    current(n).leftAt ??= t;
    n.endedAt = t;
    s.ui.confirmOpen = false;
    s.ui.view = 'timeline';
  });
}

export function seeRecap() { set((s) => { if (s.night) s.night.recapSeen = true; }); }

export function clearNight() { set((s) => { s.night = null; s.ui = freshUi(); }); }
