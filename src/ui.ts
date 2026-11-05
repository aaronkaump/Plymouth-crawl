// All screens, as lit-html templates over the store. lit only patches what changed,
// so a vibe tap changes colours and text in place and nothing moves.
import { html, nothing, svg, type TemplateResult } from 'lit-html';
import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js';
import { fakeClock, fmtClock, fmtDuration, fmtTimer, mins, now } from './clock';
import { blockCandidates, venueById, walkLabel, walkS, walkLine, isOldVillageSide } from './data';
import { STOPS_PER_NIGHT, canHeadToOldVillage, options, planInput } from './planner';
import { cachedPhotoUrl, photoKey } from './photos';
import {
  arrive, bothEmpty, current, endNight, go, headToOldVillage, isLastStop, notYet, previous, seeRecap,
  setUi, setVibe, startNight, state, toggleDrink, undoGo, upcoming, walking,
} from './store';
import { VIBE, VIBES, stampSvg } from './theme';
import type { Night, PlannedStop, Stop, Venue, Vibe } from './types';
import * as demo from './demo';
import { plan } from './planner';

export interface Hooks {
  takePhoto: () => void;
  savePostcard: (el: HTMLElement) => void;
  newNight: () => void;
  toggleDemo: () => void;
  mapHost: HTMLElement;
  blockOpen: boolean;
  setBlockOpen: (b: boolean) => void;
  showOldVillage: () => void;
  ovChip: string | null;
}

const stamp = (v: Vibe, size = 24, dim = false) => unsafeSVG(stampSvg(v, size, dim));
const venueOf = (s: Stop) => venueById(s.venueId);
const DWELL_EST = 40 * 60000;

// ---------- Shared pieces ----------

function texLayers() {
  return html`<div class="tex tex-pub"></div><div class="tex tex-cocktails"></div><div class="tex tex-bar"></div><div class="tex tex-food"></div>`;
}

const glass = svg`<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l-1.6 16.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6.6 9h10.8" stroke="currentColor" stroke-width="2"/></svg>`;
const camera = svg`<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>`;
const menuIcon = svg`<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>`;

function header(n: Night | null) {
  const v = n?.vibe ?? state.ui.setupVibe;
  return html`<header class="hdr texbox" data-v=${v}>${texLayers()}
    <span class="word">Crawl</span>
    ${fakeClock() ? html`<span class="demo-tag">Demo</span>` : nothing}
    <span class="clock" aria-label="Time">${fmtClock(now())}</span>
    <button class="icon-btn" aria-label="Menu" @click=${() => setUi({ menuOpen: true })}>${menuIcon}</button>
  </header>`;
}

function vibeButtons(active: Vibe) {
  return html`<div class="vibes" role="group" aria-label="Vibe for what's next">
    ${VIBES.map((v) => html`<button aria-pressed=${v === active ? 'true' : 'false'} @click=${() => setVibe(v)}>${VIBE[v].label}</button>`)}
  </div>`;
}

/** Estimated arrival times for the upcoming stops (40 min a stop plus the walk). */
function etas(n: Night, ups: PlannedStop[]): number[] {
  const cur = current(n);
  let t: number;
  let from = cur.venueId;
  if (walking(n)) t = (previous(n)?.leftAt ?? now()) + walkS(previous(n)!.venueId, cur.venueId) * 1000 + DWELL_EST;
  else t = Math.max(now(), (cur.arrivedAt ?? now()) + DWELL_EST);
  t = Math.max(t, now());
  return ups.map((u) => {
    t += walkS(from, u.venue.id) * 1000;
    from = u.venue.id;
    const arriveAt = t;
    t += DWELL_EST;
    return arriveAt;
  });
}

function statusLine(n: Night): string {
  const s = current(n);
  if (n.endedAt) return "That's the night";
  if (walking(n)) {
    const p = previous(n)!;
    const left = Math.max(0, walkS(p.venueId, s.venueId) * 1000 - (now() - p.leftAt!));
    return left > 0 ? `Walking · ${Math.ceil(left / 60000)} min to go` : 'Walking · about there';
  }
  if (bothEmpty(s)) return 'Both glasses empty';
  if (s.aaron !== null) return 'John still sipping';
  if (s.john !== null) return 'Aaron still sipping';
  return 'Both still sipping';
}

// ---------- Setup ----------

function setup() {
  const { setupVibe: v, setupShape: shape } = state.ui;
  const p = plan({ vibe: v, shape, crossAt: null, taken: [] });
  return html`<div class="full setup fade vibe-${v}">
    <div class="big">Crawl</div>
    <div class="sub">Plymouth, Michigan · since 1825 · Aaron and John</div>
    <div class="section-h">Start with</div>
    ${vibeButtons(v)}
    <div class="section-h">The route</div>
    <div class="shape">
      <button class="choice" role="radio" aria-checked=${shape === 'old-village' ? 'true' : 'false'} @click=${() => setUi({ setupShape: 'old-village' })}>
        <span class="txt"><span class="t1">Downtown, finish in Old Village</span><span class="t2">Four stops by Kellogg Park, then up Main for the last two</span></span></button>
      <button class="choice" role="radio" aria-checked=${shape === 'downtown' ? 'true' : 'false'} @click=${() => setUi({ setupShape: 'downtown' })}>
        <span class="txt"><span class="t1">Downtown only</span><span class="t2">Six stops, all within a few minutes of the park</span></span></button>
    </div>
    <div class="section-h">Tonight's plan</div>
    <div class="preview">
      ${p.map((s, i) => html`<div class="it"><span class="n">${i + 1}</span>${stamp(s.venue.vibe, 22)}<span class="nm">${s.venue.name}</span>
        <span class="d">${i ? walkLabel(p[i - 1].venue.id, s.venue.id) : 'start'}</span></div>`)}
    </div>
    <button class="btn start" @click=${() => startNight(v, shape)}>Start the night</button>
  </div>`;
}

// ---------- Lens bar ----------

function lensBar(n: Night) {
  if (state.ui.view === 'stop') {
    return html`<nav class="lens"><button class="back" @click=${() => setUi({ view: 'timeline', confirmOpen: false })}>‹ Timeline</button>
      <span class="meta">Stop ${n.stops.length} of ${STOPS_PER_NIGHT}</span></nav>`;
  }
  const lens = (v: 'timeline' | 'map', label: string) =>
    html`<button aria-pressed=${state.ui.view === v ? 'true' : 'false'} @click=${() => setUi({ view: v })}>${label}</button>`;
  return html`<nav class="lens"><div class="seg" role="group" aria-label="View">${lens('timeline', 'Timeline')}${lens('map', 'Map')}</div></nav>`;
}

// ---------- Timeline ----------

function upRows(n: Night) {
  const ups = upcoming(n);
  const times = etas(n, ups);
  type Row = { label: string; detail: string; tag: string; vibe: Vibe | null } | null;
  const rows: Row[] = ups.slice(0, 3).map((u, i) => {
    const from = i === 0 ? current(n).venueId : ups[i - 1].venue.id;
    return { label: `${n.stops.length + i + 1} · ${u.venue.name}`, detail: `about ${fmtClock(times[i])} · ${walkLabel(from, u.venue.id)}`, tag: u.closestMatch ? 'Closest match' : '', vibe: u.venue.vibe };
  });
  if (rows.length < 3 && !n.endedAt) {
    const last = ups.at(-1)?.venue ?? venueOf(current(n));
    const end = (times.at(-1) ?? now()) + DWELL_EST;
    rows.push({ label: "That's the night", detail: `about ${fmtClock(end)} · ${isOldVillageSide(last.district) ? 'finish in Old Village' : 'finish downtown'}`, tag: '', vibe: null });
  }
  while (rows.length < 3) rows.push(null);
  return html`${rows.map((r) => r ? html`<div class="up-row">
      ${r.vibe ? stamp(r.vibe, 22) : html`<span class="dot"></span>`}
      <span class="txt"><span class="t1">${r.label}</span><span class="t2">${r.detail}</span></span>
      <span class="tag ${r.tag ? '' : 'off'}">${r.tag || '-'}</span></div>`
    : html`<div class="up-row empty" aria-hidden="true"></div>`)}`;
}

function timeline(n: Night) {
  const doneStops = n.endedAt ? n.stops : n.stops.slice(0, -1);
  const cur = current(n);
  const w = walking(n);
  const curV = venueOf(cur);
  const elapsed = w ? now() - previous(n)!.leftAt! : now() - (cur.arrivedAt ?? now());
  const open = () => (w ? arrive() : setUi({ view: 'stop' }));
  return html`<div class="scroll">
    ${doneStops.map((s, i) => html`
      ${i > 0 ? html`<div class="walk-row"><span class="rail"><span></span></span>${mins(s.arrivedAt! - doneStops[i - 1].leftAt!)} min walk</div>` : nothing}
      <div class="done-row"><span class="n">${i + 1}</span>${stamp(venueOf(s).vibe, 20, true)}<span class="nm">${venueOf(s).name}</span><span>Stayed ${mins(s.leftAt! - s.arrivedAt!)} min</span></div>`)}
    ${n.endedAt ? nothing : html`
      ${doneStops.length ? html`<div class="walk-row"><span class="rail"><span></span></span>${w ? 'walking now' : `${mins(cur.arrivedAt! - doneStops.at(-1)!.leftAt!)} min walk`}</div>` : nothing}
      <button class="card now-mini fade vibe-${curV.vibe}" @click=${open} aria-label=${w ? `Open ${curV.name}` : `Open stop ${n.stops.length}, ${curV.name}`}>
        <span class="kicker">${w ? `Walking to stop ${n.stops.length}` : `Now · stop ${n.stops.length}`}${cur.closestMatch ? ' · Closest match' : ''}</span>
        <span class="row">${stamp(curV.vibe, 28)}<span class="vname">${curV.name}</span><span class="timer">${fmtTimer(elapsed)}</span></span>
        <span class="status">${statusLine(n)}</span>
      </button>
      <div class="section-h">Up next</div>
      ${upRows(n)}
      <div class="panel"><div class="lbl">Vibe for what's next</div>${vibeButtons(n.vibe)}</div>`}
    ${n.endedAt ? html`<div style="margin-top:16px"><button class="btn" style="width:100%" @click=${() => seeRecap()}>See the night</button></div>` : nothing}
  </div>`;
}

// ---------- Bottom bar (timeline and map) ----------

function bottomBar(n: Night) {
  if (n.endedAt) return nothing;
  const cur = current(n);
  const v = venueOf(cur);
  const w = walking(n);
  return html`<footer class="bar texbox fade" data-v=${n.vibe}>${texLayers()}
    ${stamp(v.vibe, 30)}
    <span class="txt"><span class="t1">${v.name}</span><span class="t2">${statusLine(n)}</span></span>
    <button class="btn" @click=${() => (w ? arrive() : setUi({ view: 'stop' }))}>Open stop</button>
  </footer>`;
}

// ---------- Stop view: Now card + What's next card ----------

function ring(count: number) {
  // Two segments, one per person.
  const c = 2 * Math.PI * 9;
  const seg = c / 2 - 2;
  return html`<svg width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="${count} of 2 glasses empty" style="transform:rotate(-90deg)">
    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--done)" stroke-width="3" stroke-dasharray="${seg} 2"/>
    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray=${count === 0 ? `0 ${c}` : count === 1 ? `${seg} ${c}` : `${seg} 2 ${seg} 2`}/>
  </svg>`;
}

function nowCard(n: Night, hooks: Hooks) {
  const s = current(n);
  const v = venueOf(s);
  const count = (s.aaron !== null ? 1 : 0) + (s.john !== null ? 1 : 0);
  const photo = cachedPhotoUrl(photoKey(n.id, n.stops.length - 1));
  const person = (p: 'aaron' | 'john', label: string) => html`<button class="tog" aria-pressed=${s[p] !== null ? 'true' : 'false'}
      aria-label="${label}'s glass ${s[p] !== null ? 'empty' : 'not empty yet'}" @click=${() => toggleDrink(p)}>${s[p] !== null ? '✓' : glass} ${label}</button>`;
  return html`<section class="card now fade vibe-${v.vibe}" aria-label="Now">
    <div class="top">${stamp(v.vibe, 30)}<span class="kicker" style="flex:1">Stop ${n.stops.length} · ${VIBE[v.vibe].label}${s.closestMatch ? ' · Closest match' : ''}</span>
      <div class="timerbox ${bothEmpty(s) ? 'lit' : ''}"><span class="cap">Here for</span><span class="timer">${fmtTimer(now() - (s.arrivedAt ?? now()))}</span></div></div>
    <span class="vname">${v.name}</span>
    <div class="headline">${ring(count)}<span>${statusLine(n)}</span></div>
    <div class="toggles">${person('aaron', 'Aaron')}${person('john', 'John')}
      <button class="tog" aria-pressed=${s.photo ? 'true' : 'false'} aria-label=${s.photo ? 'Retake photo' : 'Take a photo'} @click=${hooks.takePhoto}>${camera}</button></div>
    <div class="foot">
      <button class="link" @click=${() => setUi({ confirmOpen: true, pick: 0 })}>Pick another</button>
      ${photo ? html`<img class="photo-thumb" src=${photo} alt="Photo at ${v.name}">` : nothing}
    </div>
  </section>`;
}

function optDetail(n: Night, o: PlannedStop, i: number) {
  return `${VIBE[o.venue.vibe].label} · ${walkLabel(current(n).venueId, o.venue.id)}${i === 0 ? ' · planned' : ''}`;
}

function nextCard(n: Night) {
  const s = current(n);
  const last = isLastStop(n);
  const opts = last ? [] : options(planInput(n));
  const pick = Math.min(state.ui.pick, Math.max(0, opts.length - 1));
  const o = opts[pick];
  const vibe = o?.venue.vibe ?? n.vibe;
  const ready = bothEmpty(s);
  return html`<section class="card next fade vibe-${vibe}" aria-label="What's next">
    <span class="kicker">What's next</span>
    ${vibeButtons(n.vibe)}
    ${last ? html`<div class="opt"><span class="optmid"><span class="vname">That's the night</span><span class="detail">Stop 6 of 6 · ${isOldVillageSide(venueOf(s).district) ? 'finish in Old Village' : 'finish downtown'}</span></span></div>
        <div class="actions"><button class="btn" ?disabled=${!ready} @click=${() => endNight()}>That's the night</button></div>`
      : html`<div class="opt">
        <button class="arrow" aria-label="Previous option" ?disabled=${pick === 0} @click=${() => setUi({ pick: pick - 1 })}>‹</button>
        ${o ? stamp(o.venue.vibe, 30) : nothing}
        <span class="optmid"><span class="vname">${o?.venue.name ?? ''}</span><span class="detail">${o ? optDetail(n, o, pick) : ''}</span></span>
        <button class="arrow" aria-label="Next option" ?disabled=${pick >= opts.length - 1} @click=${() => setUi({ pick: pick + 1 })}>›</button>
      </div>
      <div class="actions"><span class="tag ${o?.closestMatch ? '' : 'off'}">Closest match</span>
        <button class="btn" ?disabled=${!ready || !o} @click=${() => o && letsGo(o)}>Let's go</button></div>`}
  </section>`;
}

/** Let's go: freeze the stop, start the walk; the map comes forward for walks of 3 min or more. */
export function letsGo(o: PlannedStop) {
  const from = current(state.night!).venueId;
  go(o.venue.id, o.closestMatch);
  setUi({ view: walkS(from, o.venue.id) >= 180 ? 'map' : 'timeline' });
}

function confirmCard(n: Night) {
  const s = current(n);
  const last = isLastStop(n);
  const opts = last ? [] : options(planInput(n));
  const pick = Math.min(state.ui.pick, Math.max(0, opts.length - 1));
  const on = state.ui.confirmOpen;
  const done = bothEmpty(s);
  return html`<div class="scrim ${on ? 'on' : ''}" @click=${() => notYet()}></div>
  <section class="card confirm fade vibe-${n.vibe} ${on ? 'on' : ''}" aria-hidden=${on ? 'false' : 'true'} aria-label="Confirm the next stop">
    <h2>${done ? "We're done here" : 'Pick another'}</h2>
    <div class="toast">${done ? VIBE[n.vibe].toast : venueOf(s).name}</div>
    ${last ? nothing : html`<div role="radiogroup" aria-label="Next stop" style="display:flex;flex-direction:column;gap:8px">
      ${opts.map((o, i) => html`<button class="choice" role="radio" aria-checked=${i === pick ? 'true' : 'false'} tabindex=${on ? 0 : -1} @click=${() => setUi({ pick: i })}>
        ${stamp(o.venue.vibe, 28)}<span class="txt"><span class="t1">${o.venue.name}</span><span class="t2">${optDetail(n, o, i)}${o.closestMatch ? ' · Closest match' : ''}</span></span></button>`)}
    </div>`}
    <div class="extra">
      ${canHeadToOldVillage(n) ? html`<button class="link" tabindex=${on ? 0 : -1} @click=${() => headToOldVillage()}>Head to Old Village</button>` : html`<span></span>`}
      ${n.stops.length >= 4 && !last ? html`<button class="link" tabindex=${on ? 0 : -1} @click=${() => endNight()}>End the night</button>` : nothing}
    </div>
    <div class="actions">
      <button class="btn ghost" tabindex=${on ? 0 : -1} @click=${() => notYet()}>Not yet</button>
      ${last ? html`<button class="btn" tabindex=${on ? 0 : -1} @click=${() => endNight()}>That's the night</button>`
        : html`<button class="btn" tabindex=${on ? 0 : -1} ?disabled=${!opts[pick]} @click=${() => opts[pick] && letsGo(opts[pick])}>Let's go</button>`}
    </div>
  </section>`;
}

function stopView(n: Night, hooks: Hooks) {
  return html`<div class="stopview">${nowCard(n, hooks)}${nextCard(n)}</div>${confirmCard(n)}`;
}

// ---------- Map lens overlays ----------

function mapOverlay(n: Night, hooks: Hooks) {
  if (n.endedAt) return nothing;
  const w = walking(n);
  const cur = current(n);
  const ups = upcoming(n);
  const target = w ? venueOf(cur) : ups[0]?.venue;
  const from = w ? previous(n)!.venueId : cur.venueId;
  const blockVenues = hooks.blockOpen ? blockList(n) : [];
  return html`
    ${celticFrame(n.vibe === 'pub')}
    ${hooks.ovChip ? html`<button class="edge-chip fade" @click=${hooks.showOldVillage}>${hooks.ovChip}</button>` : nothing}
    ${hooks.blockOpen ? html`<section class="card block-list fade vibe-${n.vibe}" aria-label="On this block">
        <div class="row" style="justify-content:space-between"><span class="kicker">On this block</span><button class="link" @click=${() => hooks.setBlockOpen(false)}>Close</button></div>
        ${blockVenues.map((v) => html`<div class="it">${stamp(v.vibe, 22)}<span style="flex:1">${v.name}</span><span class="status">${VIBE[v.vibe].label}</span></div>`)}
      </section>` : nothing}
    <section class="card map-sheet fade vibe-${n.vibe}" aria-label="What's next">
      ${target ? html`<div class="row">${stamp(target.vibe, 26)}<span style="flex:1;min-width:0"><div class="t1">${w ? `To ${target.name}` : `Next: ${target.name}`}</div>
        <div class="t2">${walkLabel(from, target.id)}${w ? '' : ` · ${VIBE[target.vibe].label}`}</div></span></div>`
        : html`<div class="t1">That's the night after this one</div>`}
      ${vibeButtons(n.vibe)}
    </section>`;
}

function blockList(n: Night): Venue[] {
  const ids = new Set([...n.stops.map((s) => s.venueId), ...upcoming(n).map((u) => u.venue.id)]);
  return blockCandidates(ids);
}

/** Brass knotwork border with knot corners, drawn over the map, never inside the tiles. */
const knot = svg`<svg width="30" height="30" viewBox="0 0 26 26" aria-hidden="true"><path d="M0 0h26v26H0z" fill="#1E3A28" stroke="#D4A64A" stroke-width="2"/>
  <path d="M4 13c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9Zm5 0c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4Z" fill="none" stroke="#D4A64A" stroke-width="1.6"/>
  <path d="M4 4l18 18M22 4L4 22" stroke="#D4A64A" stroke-width="1.2" opacity=".7"/></svg>`;
function celticFrame(on: boolean) {
  return html`<div class="celtic-frame ${on ? 'on' : ''}" aria-hidden="true"><span class="k tl">${knot}</span><span class="k tr">${knot}</span><span class="k bl">${knot}</span><span class="k br">${knot}</span></div>`;
}

// ---------- End of night ----------

function endCard(n: Night) {
  const t = totals(n);
  const v = venueOf(current(n));
  return html`<div class="full fade vibe-${v.vibe}"><section class="card end-card">
    <span class="kicker">Back to the village of homes</span>
    <h2>That's the night</h2>
    <div class="toast">${VIBE[v.vibe].toast}</div>
    <div class="status">${n.stops.length} stops · ${fmtDuration(t.out)} out · Aaron and John</div>
    <button class="btn" @click=${() => seeRecap()}>See the night</button>
  </section></div>`;
}

export function totals(n: Night) {
  const first = n.stops[0].arrivedAt!;
  const end = n.endedAt ?? now();
  const at = n.stops.reduce((a, s) => a + ((s.leftAt ?? end) - (s.arrivedAt ?? end)), 0);
  return { out: end - first, at, walking: end - first - at };
}

function recap(n: Night, hooks: Hooks) {
  const t = totals(n);
  const date = new Date(n.stops[0].arrivedAt!);
  const when = date.toLocaleDateString('en-US', { month: 'long', weekday: 'long' });
  return html`<div class="full recap vibe-${n.vibe}">
    <span class="word" style="flex:none">Crawl</span>
    <div><div class="kick">Back to the village of homes</div><h2>That's the night</h2></div>
    <div class="postcard" id="postcard">
      <div class="hd"><span class="gf">Greetings from</span><span class="ply">PLYMOUTH</span><span class="mi">MICHIGAN · SINCE 1825</span></div>
      ${sketch(n)}
      <div>
        ${n.stops.map((s, i) => {
          const v = venueOf(s);
          const ph = s.photo ? cachedPhotoUrl(photoKey(n.id, i)) : null;
          return html`
          ${i > 0 ? html`<div class="pc-walk"><span class="rail"><span></span></span><span class="sp"></span>${mins(s.arrivedAt! - n.stops[i - 1].leftAt!)} min walk${isOldVillageSide(v.district) && !isOldVillageSide(venueOf(n.stops[i - 1]).district) ? ' · up to Old Village' : ''}</div>` : nothing}
          <div class="pc-stop">
            ${ph ? html`<img class="ph" src=${ph} alt="Photo at ${v.name}">` : html`<span class="ph none" role="img" aria-label="No photo at this stop">${camera}</span>`}
            <span class="t">${fmtClock(s.arrivedAt!)}</span>${stamp(v.vibe, 20)}<span class="nm">${v.name}</span>
            <span class="m">${mins((s.leftAt ?? n.endedAt!) - s.arrivedAt!)} min</span></div>`;
        })}
      </div>
      <div class="pc-tot"><div><b>${fmtDuration(t.out)}</b><span>out</span></div><div><b>${fmtDuration(t.at)}</b><span>at ${n.stops.length} stops</span></div><div><b>${fmtDuration(t.walking)}</b><span>walking</span></div></div>
      <span class="sig">Aaron and John · a ${when.split(' ')[1] ?? ''} ${when.split(' ')[0].replace(',', '')}</span>
    </div>
    <div class="actions">
      <button class="btn" @click=${() => hooks.savePostcard(document.getElementById('postcard')!)}>Save postcard</button>
      <button class="btn ghost" @click=${hooks.newNight}>New night</button>
    </div>
  </div>`;
}

/** Route sketch for the postcard, projected from the real walking lines. */
function sketch(n: Night) {
  const W = 310, H = 150, pad = 16;
  const pts = n.stops.flatMap((s, i) => (i ? walkLine(n.stops[i - 1].venueId, s.venueId) : [[venueOf(s).lon, venueOf(s).lat] as [number, number]]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const kx = Math.cos((42.37 * Math.PI) / 180);
  const sc = Math.min((W - 2 * pad) / Math.max(1e-6, (x1 - x0) * kx), (H - 2 * pad) / Math.max(1e-6, y1 - y0));
  const ox = (W - (x1 - x0) * kx * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const P = (p: [number, number]) => [ox + (p[0] - x0) * kx * sc, H - (oy + (p[1] - y0) * sc)];
  const d = n.stops.slice(1).map((s, i) => walkLine(n.stops[i].venueId, s.venueId).map((p, k) => `${k ? 'L' : 'M'}${P(p).map((z) => z.toFixed(1)).join(' ')}`).join('')).join('');
  return svg`<svg class="sketch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Route sketch of the night">
    <rect width="${W}" height="${H}" rx="6" fill="#E7D7B8"/>
    <path d="${d}" fill="none" stroke="#B4531A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${n.stops.map((s, i) => {
      const v = venueOf(s); const [x, y] = P([v.lon, v.lat]);
      const col = VIBE[v.vibe].accent;
      return svg`<circle cx="${x}" cy="${y}" r="8" fill="#2A1E14" stroke="${col}" stroke-width="1.5"/><text x="${x}" y="${y + 3.5}" font-size="10" font-weight="700" text-anchor="middle" fill="${col}">${i + 1}</text>`;
    })}
  </svg>`;
}

// ---------- Menu ----------

function menu(n: Night | null, hooks: Hooks) {
  if (!state.ui.menuOpen) return nothing;
  const fc = fakeClock();
  const close = () => setUi({ menuOpen: false });
  return html`<div class="sheet-wrap" @click=${(e: Event) => e.target === e.currentTarget && close()}>
    <section class="sheet fade vibe-${n?.vibe ?? state.ui.setupVibe}" role="dialog" aria-label="Menu">
      <h3>Crawl</h3>
      <button class="menu-item" @click=${() => { close(); hooks.toggleDemo(); }}>${fc ? 'Leave demo mode' : 'Demo mode (fake clock)'}</button>
      ${fc ? html`
        <div class="fine">Demo clock speed</div>
        <div class="opts">${[1, 10, 60].map((sp) => html`<button aria-pressed=${fc.speed === sp ? 'true' : 'false'} @click=${() => demo.speed(sp)}>${sp}×</button>`)}
          <button @click=${() => demo.skip(10)}>+10 min</button></div>
        <button class="menu-item" @click=${() => { close(); demo.play(); }}>${demo.playing() ? 'Stop the scripted night' : 'Play the night (about 4 min)'}</button>` : nothing}
      ${n && walking(n) && n.stops.length > 1 ? html`<button class="menu-item" @click=${() => { close(); undoGo(); }}>Back to ${venueOf(previous(n)!).short}</button>` : nothing}
      ${n && !n.endedAt ? html`<button class="menu-item" @click=${() => { close(); endNight(); }}>End the night</button>` : nothing}
      ${n ? html`<button class="menu-item" @click=${() => { close(); hooks.newNight(); }}>New night</button>` : nothing}
      <p class="fine">Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · tiles <a href="https://openfreemap.org">OpenFreeMap</a> · walks by FOSSGIS OSRM. Nothing leaves this phone.</p>
      <button class="btn ghost" @click=${close}>Close</button>
    </section></div>`;
}

// ---------- App ----------

export function app(hooks: Hooks): TemplateResult {
  const n = state.night;
  if (!n) return html`${setup()}${menu(null, hooks)}`;
  if (n.endedAt && !n.recapSeen) return html`${endCard(n)}${menu(n, hooks)}`;
  if (n.endedAt && n.recapSeen) return html`${recap(n, hooks)}${menu(n, hooks)}`;
  const view = state.ui.view;
  return html`
    ${header(n)}
    ${lensBar(n)}
    <main class="body">
      <div class="map-host ${view === 'map' ? '' : 'off'}" ${refHost(hooks.mapHost)}>${view === 'map' ? mapOverlay(n, hooks) : nothing}</div>
      ${view === 'timeline' ? timeline(n) : nothing}
      ${view === 'stop' && !walking(n) ? stopView(n, hooks) : nothing}
    </main>
    ${view === 'stop' ? nothing : bottomBar(n)}
    ${menu(n, hooks)}`;
}

/** Keeps the persistent MapLibre container inside the lit-managed map host. */
import { directive, Directive, PartType, type PartInfo, type ElementPart } from 'lit-html/directive.js';
class RefHost extends Directive {
  constructor(p: PartInfo) { super(p); if (p.type !== PartType.ELEMENT) throw new Error('element only'); }
  render(_el: HTMLElement) { return nothing; }
  update(part: ElementPart, [el]: [HTMLElement]) {
    if (el.parentElement !== part.element) part.element.prepend(el);
    return nothing;
  }
}
const refHost = directive(RefHost);
