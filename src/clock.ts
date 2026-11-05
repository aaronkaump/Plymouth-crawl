// One clock for the whole app. Every timer is a stored timestamp, and elapsed time is
// computed from now(). Demo mode swaps in a fake clock that can run fast or jump.

export interface FakeClock {
  /** Fake time at the moment `realBase` was taken. */
  fakeBase: number;
  realBase: number;
  speed: number;
}

let fake: FakeClock | null = null;
const listeners = new Set<() => void>();

export const realNow = () => Date.now();

export function now(): number {
  if (!fake) return realNow();
  return Math.round(fake.fakeBase + (realNow() - fake.realBase) * fake.speed);
}

export function useFakeClock(c: FakeClock | null) {
  fake = c;
  listeners.forEach((f) => f());
}

export const fakeClock = () => fake;

/** Change speed without a jump in fake time. */
export function setSpeed(speed: number) {
  if (!fake) return;
  useFakeClock({ fakeBase: now(), realBase: realNow(), speed });
}

/** Jump fake time forward. */
export function advance(ms: number) {
  if (!fake) return;
  useFakeClock({ fakeBase: now() + ms, realBase: realNow(), speed: fake.speed });
}

export const onClockChange = (f: () => void) => listeners.add(f);

/** 8:00 pm on the next Saturday in July (the birthday crawl), local time. */
export function demoStart(from = new Date(realNow())): number {
  const d = new Date(from.getFullYear(), 6, 1, 20, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7); // second Saturday of July
  return d.getTime();
}

export const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '');

export const fmtAmPm = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', ' ');

/** 4:07 or 1:04:07 */
export function fmtTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export const mins = (ms: number) => Math.max(0, Math.round(ms / 60000));

/** 4h 35m, 33m */
export function fmtDuration(ms: number): string {
  const m = mins(ms);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
