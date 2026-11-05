import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import snapshot from './data/venues.json';
import routesSnapshot from './data/routes.json';
import { type Venue, type Vibe, type Leg, KELLOGG_PARK, fetchVenues, routeLeg, walkingMatrix, sampleOrder, crawlStops, normalizeTilePois } from './osm';

maplibregl.setWorkerUrl(workerUrl); // Vite doesn't bundle MapLibre's worker automatically
const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const COLORS: Record<Vibe, string> = { pub: '#3fa66b', cocktail: '#b07cff', bar: '#f0a43a', restaurant: '#8fa3b8' };
const $ = (id: string) => document.getElementById(id)!;
const info = (s: string) => ($('route-info').textContent = s);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const map = new maplibregl.Map({ container: 'map', style: STYLE, center: [KELLOGG_PARK[1], KELLOGG_PARK[0]], zoom: 15, attributionControl: { compact: true } });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'top-right');
if (location.search.includes('debug')) (window as unknown as { map: maplibregl.Map }).map = map;
const mapReady = new Promise<void>((r) => map.on('load', () => r()));

let venues: Venue[] = [];
let byId = new Map<string, Venue>();
const markers = new Map<string, HTMLElement>();
let selected: string[] = [];

async function loadVenues(): Promise<{ list: Venue[]; from: string }> {
  if (snapshot.venues.length) return { list: snapshot.venues as Venue[], from: `snapshot ${String(snapshot.fetchedAt).slice(0, 10)}` };
  info('Loading venues live from OpenStreetMap…');
  try {
    return { list: await fetchVenues(), from: 'live from Overpass' };
  } catch (e) {
    console.warn(e);
    return { list: await venuesFromTiles(), from: 'map tiles (no hours)' };
  }
}

/** Fallback: read OSM POIs straight out of the vector tiles covering Plymouth. */
async function venuesFromTiles(): Promise<Venue[]> {
  map.jumpTo({ center: [-83.47, 42.3725], zoom: 14 });
  await new Promise<void>((r) => map.once('idle', () => r()));
  const pois = map.querySourceFeatures('openmaptiles', { sourceLayer: 'poi' }).map((f) => {
    const [lon, lat] = (f.geometry as { coordinates: number[] }).coordinates;
    return { id: f.id, name: f.properties.name as string, subclass: f.properties.subclass as string, lon, lat };
  });
  return normalizeTilePois(pois);
}

function render(from: string) {
  const withHours = venues.filter((v) => v.openingHours).length;
  $('stats').textContent = `${venues.length} venues · ${withHours} with hours · ${from}`;
  for (const v of venues) {
    const el = document.createElement('div');
    el.className = 'marker';
    el.style.background = COLORS[v.vibe];
    el.title = v.name!;
    el.addEventListener('click', () => select(v.id));
    new maplibregl.Marker({ element: el }).setLngLat([v.lon, v.lat])
      .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false }).setText(`${v.name} · ${v.vibe}${v.openingHours ? '' : ' · no hours in OSM'}`))
      .addTo(map);
    markers.set(v.id, el);
  }
  const list = $('list');
  for (const v of venues) {
    const li = document.createElement('li');
    li.dataset.id = v.id;
    li.innerHTML = `<span class="dot" style="background:${COLORS[v.vibe]}"></span>
      <span class="name">${esc(v.name!)}<br><span class="meta">${v.amenity} · ${v.zone}${v.address ? ' · ' + esc(v.address) : ''}</span></span>
      <span class="badge ${v.openingHours ? '' : 'warn'}">${v.openingHours ? 'hours' : 'no hours'}</span>`;
    li.addEventListener('click', () => { select(v.id); map.easeTo({ center: [v.lon, v.lat], zoom: 17 }); });
    list.append(li);
  }
  const b = new maplibregl.LngLatBounds();
  crawlStops(venues).forEach((v) => b.extend([v.lon, v.lat]));
  if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 16 });
}

function select(id: string | null) {
  selected = id ? [...selected.filter((s) => s !== id), id].slice(-2) : [];
  for (const [vid, el] of markers) el.classList.toggle('sel', selected.includes(vid));
  document.querySelectorAll<HTMLLIElement>('#list li').forEach((li) => li.classList.toggle('sel', selected.includes(li.dataset.id!)));
  if (selected.length === 2) void routeLive(byId.get(selected[0])!, byId.get(selected[1])!);
}

const fmt = (s: number, m: number) => `${Math.round(s / 60)} min walk · ${(m / 1609.34).toFixed(2)} mi`;
function draw(legs: Leg[]) {
  (map.getSource('route') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: legs.map((l) => ({ type: 'Feature', properties: {}, geometry: l.geometry })),
  });
  const b = new maplibregl.LngLatBounds();
  legs.forEach((l) => l.geometry.coordinates.forEach((c) => b.extend(c as [number, number])));
  if (!b.isEmpty()) map.fitBounds(b, { padding: 60, maxZoom: 17 });
}

async function routeLive(a: Venue, b: Venue) {
  info(`Routing ${a.name} → ${b.name}…`);
  try {
    const leg = await routeLeg(a, b);
    draw([leg]);
    info(`${a.name} → ${b.name}: ${fmt(leg.durationS, leg.distanceM)} (live)`);
  } catch (e) {
    info(`Live routing failed: ${(e as Error).message}`);
  }
}

async function sampleCrawl() {
  let legs = routesSnapshot.sampleCrawl as Leg[];
  let how = 'precomputed';
  if (!legs.length || !legs.every((l) => byId.has(l.from) && byId.has(l.to))) {
    info('Planning a sample crawl with live walking times…');
    const stops = crawlStops(venues);
    const order = sampleOrder(stops, (await walkingMatrix(stops)).durationsS);
    legs = [];
    for (let k = 0; k < order.length - 1; k++) legs.push(await routeLeg(stops[order[k]], stops[order[k + 1]]));
    how = 'live';
  }
  draw(legs);
  const s = legs.reduce((t, l) => t + l.durationS, 0), m = legs.reduce((t, l) => t + l.distanceM, 0);
  const names = [legs[0].from, ...legs.map((l) => l.to)].map((id) => byId.get(id)?.name).join(' → ');
  info(`${names}: ${fmt(s, m)} total (${how})`);
}

$('sample').addEventListener('click', () => sampleCrawl().catch((e) => info(`Sample crawl failed: ${e.message}`)));
$('clear').addEventListener('click', () => { select(null); draw([]); info('Tap two venues to get a live walking route.'); });

(async () => {
  await mapReady;
  map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#000', 'line-width': 8, 'line-opacity': 0.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#ffd166', 'line-width': 4, 'line-dasharray': [1, 1.5] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  try {
    const { list, from } = await loadVenues();
    venues = list.filter((v) => v.name);
    byId = new Map(venues.map((v) => [v.id, v]));
    render(from);
    info('Tap two venues to get a live walking route.');
  } catch (e) {
    info(`Couldn't load venues: ${(e as Error).message}`);
  }
})();
