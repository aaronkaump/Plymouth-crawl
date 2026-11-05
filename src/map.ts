// The map lens: OpenFreeMap dark tiles retinted per vibe in place, stamped plan pins,
// a "N on this block" pill for the other Kellogg Park venues, and the walking route.
// No location: there is no position dot, only the route line.
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BLOCK_CENTRE, KELLOGG_PARK, OLD_VILLAGE, VENUES, blockCandidates, nearBlock, walkLine } from './data';
import { VIBE, stampSvg } from './theme';
import type { Venue, Vibe } from './types';

maplibregl.setWorkerUrl(workerUrl); // Vite doesn't bundle MapLibre's worker by itself

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface MapPlan {
  vibe: Vibe;
  /** Every stop of the night in order: done, current, then planned. */
  stops: { venue: Venue; state: 'done' | 'here' | 'next' | 'later' }[];
  /** Index into stops of the leg being walked (from i-1 to i), or -1. */
  activeLeg: number;
}

let map: maplibregl.Map | null = null;
let ready: Promise<void> | null = null;
let markers: maplibregl.Marker[] = [];
let lastKey = '';
let lastFrameKey = '';
let onPill: (() => void) | null = null;
let onPin: ((venueId: string) => void) | null = null;

function tint(m: maplibregl.Map, vibe: Vibe) {
  const c = VIBE[vibe].map;
  const set = (layer: string, prop: string, value: unknown) => {
    if (m.getLayer(layer)) m.setPaintProperty(layer, prop as 'fill-color', value as string);
  };
  set('background', 'background-color', c.bg);
  set('water', 'fill-color', c.water);
  set('waterway', 'line-color', c.water);
  set('landuse_residential', 'fill-color', c.res);
  set('landuse_residential', 'fill-opacity', 1);
  set('landcover_wood', 'fill-color', c.park);
  set('landuse_park', 'fill-color', c.park);
  set('building', 'fill-color', c.bld);
  set('building', 'fill-outline-color', c.bldO);
  set('highway_path', 'line-color', c.minor);
  set('highway_minor', 'line-color', c.minor);
  set('highway_major_casing', 'line-color', c.casing);
  set('highway_major_inner', 'line-color', c.major);
  set('highway_major_subtle', 'line-color', c.major);
  for (const l of ['railway', 'railway_minor', 'railway_transit']) set(l, 'line-color', c.rail);
  for (const l of ['railway_dashline', 'railway_minor_dashline', 'railway_transit_dashline']) set(l, 'line-color', c.bg);
  set('highway_name_other', 'text-color', c.label);
  set('highway_name_other', 'text-halo-color', c.halo);
  set('highway_name_motorway', 'text-color', c.label);
  for (const l of m.getStyle().layers) if (l.id.startsWith('place_')) { set(l.id, 'text-color', c.label); set(l.id, 'text-halo-color', c.halo); }
  set('route-active', 'line-color', VIBE[vibe].accent);
  set('route-later', 'line-color', VIBE[vibe].accent);
  set('route-done', 'line-color', VIBE[vibe].done);
}

async function loadStyle(): Promise<StyleSpecification> {
  const res = await fetch(STYLE_URL);
  const style = (await res.json()) as StyleSpecification;
  style.transition = { duration: 400, delay: 0 };
  // Drop the faint low-zoom shaded relief; we never zoom out that far.
  style.layers = style.layers.filter((l) => !('source' in l && l.source === 'ne2_shaded'));
  return style;
}

export function initMap(host: HTMLElement, vibe: Vibe, handlers: { pill: () => void; pin: (venueId: string) => void }) {
  if (map) return;
  onPill = handlers.pill;
  onPin = handlers.pin;
  const el = document.createElement('div');
  host.prepend(el);
  ready = loadStyle().then((style) => new Promise<void>((resolve) => {
    map = new maplibregl.Map({
      container: el, style, center: KELLOGG_PARK, zoom: 15.6, minZoom: 12, maxZoom: 18.5,
      attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      const m = map!;
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const lay = { 'line-cap': 'round', 'line-join': 'round' } as const;
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['!=', ['get', 'state'], 'done'], layout: lay, paint: { 'line-color': '#000', 'line-width': 9, 'line-opacity': 0.45 } });
      m.addLayer({ id: 'route-done', type: 'line', source: 'route', filter: ['==', ['get', 'state'], 'done'], layout: lay, paint: { 'line-color': VIBE[vibe].done, 'line-width': 4 } });
      m.addLayer({ id: 'route-later', type: 'line', source: 'route', filter: ['==', ['get', 'state'], 'later'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': VIBE[vibe].accent, 'line-width': 3, 'line-opacity': 0.75, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'route-active', type: 'line', source: 'route', filter: ['==', ['get', 'state'], 'active'], layout: lay, paint: { 'line-color': VIBE[vibe].accent, 'line-width': 5.5 } });
      tint(m, vibe);
      resolve();
    });
    if (location.search.includes('debug')) (window as unknown as { map: maplibregl.Map }).map = map;
  }));
  ready.catch((e) => console.warn('Map failed to load', e));
}

export function resizeMap() { map?.resize(); }

export function setMapVibe(vibe: Vibe) {
  void ready?.then(() => map && tint(map, vibe));
}

function pinEl(v: Venue, state: string, n: number): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `pin ${state}`;
  el.setAttribute('aria-label', `Stop ${n}, ${v.name}`);
  el.innerHTML = stampSvg(v.vibe, state === 'next' || state === 'here' ? 34 : 28) + `<span class="num">${n}</span>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); onPin?.(v.id); });
  return el;
}

export function updateMap(p: MapPlan) {
  void ready?.then(() => {
    const m = map;
    if (!m) return;
    const key = JSON.stringify([p.stops.map((s) => s.venue.id + s.state), p.activeLeg]);
    if (key === lastKey) return;
    lastKey = key;

    // Route legs
    const features = p.stops.slice(1).map((s, k) => {
      const i = k + 1;
      const state = i < p.activeLeg || (p.activeLeg === -1 && p.stops[i].state === 'done') || (p.activeLeg === -1 && s.state === 'here') ? 'done'
        : i === p.activeLeg ? 'active'
        : p.activeLeg === -1 && s.state === 'next' ? 'active' : 'later';
      return { type: 'Feature' as const, properties: { state }, geometry: { type: 'LineString' as const, coordinates: walkLine(p.stops[i - 1].venue.id, s.venue.id) } };
    });
    (m.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features });

    // Pins: plan stops never cluster.
    markers.forEach((mk) => mk.remove());
    markers = [];
    const planIds = new Set(p.stops.map((s) => s.venue.id));
    p.stops.forEach((s, i) => {
      markers.push(new maplibregl.Marker({ element: pinEl(s.venue, s.state, i + 1) }).setLngLat([s.venue.lon, s.venue.lat]).addTo(m));
    });
    const block = blockCandidates(planIds);
    for (const v of VENUES) {
      if (planIds.has(v.id) || nearBlock(v)) continue;
      const el = document.createElement('div');
      el.className = 'cand';
      el.title = v.name;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m));
    }
    if (block.length) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pill';
      el.textContent = `${block.length} on this block`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onPill?.(); });
      markers.push(new maplibregl.Marker({ element: el, anchor: 'right', offset: [-34, 0] }).setLngLat(BLOCK_CENTRE).addTo(m));
    }

    // Framing: only when the stop or leg changes, never on a vibe tap.
    const frameKey = JSON.stringify([p.activeLeg, p.stops.findIndex((s) => s.state === 'here' || s.state === 'next')]);
    if (frameKey !== lastFrameKey) {
      lastFrameKey = frameKey;
      frame(p);
    }
  });
}

/** Fit the current position, the next stop and the one after it. */
function frame(p: MapPlan, both = false) {
  if (!map) return;
  const i = Math.max(0, p.stops.findIndex((s) => s.state === 'here' || s.state === 'next'));
  const from = p.activeLeg > 0 ? p.activeLeg - 1 : Math.max(0, i - (p.stops[i]?.state === 'next' ? 1 : 0));
  const pts = both ? p.stops.map((s) => s.venue) : p.stops.slice(from, from + 3).map((s) => s.venue);
  const b = new maplibregl.LngLatBounds();
  pts.forEach((v) => b.extend([v.lon, v.lat]));
  if (p.activeLeg > 0) walkLine(p.stops[p.activeLeg - 1].venue.id, p.stops[p.activeLeg].venue.id).forEach((c) => b.extend(c));
  if (b.isEmpty()) return;
  map.fitBounds(b, { padding: { top: 70, bottom: 200, left: 40, right: 40 }, maxZoom: 16.6, duration: 600 });
}

/** Is any of these venues outside the current view? */
export function offscreen(vs: Venue[]): boolean {
  if (!map) return false;
  const b = map.getBounds();
  return vs.some((v) => !b.contains([v.lon, v.lat]));
}

export function showOldVillage() {
  if (!map) return;
  const b = new maplibregl.LngLatBounds();
  b.extend(KELLOGG_PARK);
  b.extend(OLD_VILLAGE);
  map.fitBounds(b, { padding: { top: 70, bottom: 200, left: 40, right: 40 }, duration: 600 });
}

export const onMapMove = (f: () => void) => { void ready?.then(() => map?.on('moveend', f)); };

/** Fetch the vector tiles for both districts once, so the map works offline (the service worker keeps them). */
export async function warmTiles() {
  try {
    const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json() as { tiles: string[] };
    const tmpl = tj.tiles[0];
    const [w, s, e, n] = [-83.48, 42.364, -83.455, 42.384];
    const tile = (lon: number, lat: number, z: number) => {
      const x = Math.floor(((lon + 180) / 360) * 2 ** z);
      const r = (lat * Math.PI) / 180;
      const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
      return [x, y];
    };
    const urls: string[] = [];
    for (const z of [12, 13, 14]) {
      const [x0, y0] = tile(w, n, z), [x1, y1] = tile(e, s, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(tmpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
    for (const u of urls) await fetch(u).catch(() => {});
  } catch { /* offline already, nothing to warm */ }
}
