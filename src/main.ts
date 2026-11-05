import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/fraunces/900.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/uncial-antiqua/400.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/600-italic.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import { render } from 'lit-html';
import { onClockChange } from './clock';
import { OLD_VILLAGE, isOldVillageSide, venueById } from './data';
import * as demo from './demo';
import { clearPhotos, persistStorage, photoKey, photoUrl, savePhoto } from './photos';
import { clearNight, current, previous, setPhoto, state, subscribe, upcoming, walking } from './store';
import { app, type Hooks } from './ui';
import type { MapPlan } from './map';
import type { Night } from './types';

const root = document.getElementById('app')!;
const mapHost = document.createElement('div');
mapHost.className = 'map-canvas';
mapHost.style.cssText = 'position:absolute;inset:0';

let mapMod: typeof import('./map') | null = null;
let blockOpen = false;
let ovChip: string | null = null;

const photoInput = document.createElement('input');
photoInput.type = 'file';
photoInput.accept = 'image/*';
photoInput.setAttribute('capture', 'environment');
photoInput.className = 'sr';
photoInput.tabIndex = -1;
document.body.append(photoInput);
photoInput.addEventListener('change', async () => {
  const f = photoInput.files?.[0];
  const n = state.night;
  photoInput.value = '';
  if (!f || !n) return;
  await savePhoto(photoKey(n.id, n.stops.length - 1), f);
  setPhoto(true);
});

const hooks: Hooks = {
  takePhoto: () => photoInput.click(),
  savePostcard: (el) => void savePostcard(el),
  newNight: () => {
    if (!confirm('Start a new night? This clears tonight, photos included.')) return;
    const id = state.night?.id;
    if (id) void clearPhotos(`${id}:`);
    clearNight();
  },
  toggleDemo: () => demo.toggle(),
  mapHost,
  get blockOpen() { return blockOpen; },
  setBlockOpen: (b) => { blockOpen = b; draw(); },
  showOldVillage: () => mapMod?.showOldVillage(),
  get ovChip() { return ovChip; },
};

function mapPlan(n: Night): MapPlan {
  const stops: MapPlan['stops'] = n.stops.map((s, i) => ({
    venue: venueById(s.venueId),
    state: i < n.stops.length - 1 || n.endedAt ? 'done' : walking(n) ? 'next' : 'here',
  }));
  for (const [k, u] of upcoming(n).entries()) stops.push({ venue: u.venue, state: k === 0 && !walking(n) ? 'next' : 'later' });
  return { vibe: n.vibe, stops, activeLeg: walking(n) ? n.stops.length - 1 : -1 };
}

function updateOvChip(n: Night) {
  if (!mapMod) return;
  const ahead = upcoming(n).map((u) => u.venue).filter((v) => isOldVillageSide(v.district));
  if (walking(n) && isOldVillageSide(venueById(current(n).venueId).district)) ahead.unshift(venueById(current(n).venueId));
  const here = venueById(current(n).venueId);
  const next = ovChipText(ahead.length > 0 && !isOldVillageSide(here.district) && mapMod.offscreen(ahead));
  if (next !== ovChip) { ovChip = next; draw(); }
}
const ovChipText = (show: boolean) => (show ? 'Old Village ↑ north' : null);

let lastVibe = '';
function draw() {
  const n = state.night;
  const vibe = n?.vibe ?? state.ui.setupVibe;
  root.className = `fade vibe-${vibe}`;
  render(app(hooks), root);
  if (n && !n.endedAt && state.ui.view === 'map') {
    if (!mapMod) {
      void import('./map').then((m) => {
        mapMod = m;
        m.initMap(mapHost, vibe, { pill: () => hooks.setBlockOpen(!blockOpen), pin: () => {} });
        m.onMapMove(() => state.night && updateOvChip(state.night));
        draw();
      });
      return;
    }
    mapMod.resizeMap();
    if (vibe !== lastVibe) mapMod.setMapVibe(vibe);
    mapMod.updateMap(mapPlan(n));
  }
  if (mapMod && vibe !== lastVibe) mapMod.setMapVibe(vibe);
  lastVibe = vibe;
  syncWakeLock(n);
  if (n?.endedAt) void loadPhotos(n);
}

// Photos are loaded once into object URLs so templates can use them synchronously.
const loaded = new Set<string>();
async function loadPhotos(n: Night) {
  const keys = n.stops.map((s, i) => (s.photo ? photoKey(n.id, i) : '')).filter((k) => k && !loaded.has(k));
  if (!keys.length) return;
  keys.forEach((k) => loaded.add(k));
  await Promise.all(keys.map(photoUrl));
  draw();
}

// Keep the screen on at a stop (the phone is on the table); let it sleep mid-walk.
let lock: WakeLockSentinel | null = null;
function syncWakeLock(n: Night | null) {
  const want = !!n && !n.endedAt && !walking(n) && document.visibilityState === 'visible';
  if (want && !lock && 'wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then((l) => { lock = l; l.addEventListener('release', () => { lock = null; }); }).catch(() => {});
  } else if (!want && lock) {
    void lock.release();
    lock = null;
  }
}
document.addEventListener('visibilitychange', () => syncWakeLock(state.night));

async function savePostcard(el: HTMLElement) {
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(el, { pixelRatio: 2, backgroundColor: '#F3E9D6' });
  if (!blob) return;
  const file = new File([blob], `crawl-${new Date(state.night?.stops[0].arrivedAt ?? Date.now()).toISOString().slice(0, 10)}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Crawl · Plymouth' }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

subscribe(draw);
onClockChange(draw);
demo.init(draw);
persistStorage();
// Repaint once a second for timers and the clock, not every frame.
setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 1000);
// Load photos for the current stop's thumbnail.
if (state.night) {
  const n = state.night;
  void Promise.all(n.stops.map((s, i) => (s.photo ? photoUrl(photoKey(n.id, i)) : null))).then(draw);
}
// Warm the map tiles for offline use once the first screen is up.
setTimeout(() => void import('./map').then((m) => m.warmTiles()), 4000);
void previous; void OLD_VILLAGE;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
