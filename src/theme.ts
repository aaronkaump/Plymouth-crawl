import type { Vibe } from './types';

export const VIBES: Vibe[] = ['pub', 'cocktails', 'bar', 'food'];

export interface VibeMeta {
  label: string;
  theme: string;
  toast: string;
  /** Map tint: land, residential, buildings, building edge, parks, water, minor roads, major roads, casings, rail, labels, halo. */
  map: { bg: string; res: string; bld: string; bldO: string; park: string; water: string; minor: string; major: string; casing: string; rail: string; label: string; halo: string };
  accent: string;
  done: string;
}

export const VIBE: Record<Vibe, VibeMeta> = {
  pub: {
    label: 'Pub', theme: 'Celtic', toast: 'Sláinte!', accent: '#D4A64A', done: '#5E7464',
    map: { bg: '#0F1A14', res: '#122019', bld: '#0B140F', bldO: '#1D3024', park: '#1C3324', water: '#14282A', minor: '#1C2C22', major: '#23392B', casing: '#31503B', rail: '#4A6A55', label: '#A9BDAE', halo: '#0F1A14' },
  },
  cocktails: {
    label: 'Cocktails', theme: 'Deco lounge', toast: 'Cheers.', accent: '#E6D3A8', done: '#6A6878',
    map: { bg: '#0E1018', res: '#11141E', bld: '#0A0C12', bldO: '#1E2232', park: '#161B29', water: '#121A2A', minor: '#1A1E2C', major: '#232838', casing: '#33394D', rail: '#4A5068', label: '#B4B2C0', halo: '#0E1018' },
  },
  bar: {
    label: 'Bar', theme: 'Retro arcade', toast: "That's a daisy!", accent: '#E3A82B', done: '#7A5F44',
    map: { bg: '#1C130C', res: '#21170F', bld: '#150E09', bldO: '#30221A', park: '#2A2114', water: '#1E1A16', minor: '#2C2016', major: '#38291C', casing: '#4D3826', rail: '#64503B', label: '#CDB48E', halo: '#1C130C' },
  },
  food: {
    label: 'Food', theme: 'Neutral', toast: 'Cheers!', accent: '#D9C7A7', done: '#5F5A55',
    map: { bg: '#161514', res: '#191817', bld: '#11100F', bldO: '#262422', park: '#232A22', water: '#1A1C20', minor: '#232120', major: '#2D2A27', casing: '#3D3935', rail: '#55504A', label: '#AAA49C', halo: '#161514' },
  },
};

const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const STAMP: Record<Vibe, { fill: string; edge: string; shape: string; stroke: string; solid: string }> = {
  pub: { fill: '#1E3A28', edge: '#D4A64A', shape: 'M16 2L28 6.5V15.5C28 22.5 22.8 27.8 16 30C9.2 27.8 4 22.5 4 15.5V6.5Z', stroke: ring(16, 12.6, 3.6) + ring(12.7, 18.3, 3.6) + ring(19.3, 18.3, 3.6), solid: '' },
  cocktails: { fill: '#0E1018', edge: '#E6D3A8', shape: 'M16 1.5L30.5 16L16 30.5L1.5 16Z', stroke: 'M10.5 12.5h11c0 3-2.5 5-5.5 5s-5.5-2-5.5-5ZM16 17.5v4.5M12.8 22.2h6.4', solid: '' },
  bar: { fill: '#4A2E16', edge: '#E3A82B', shape: 'M6 3H26V6H29V26H26V29H6V26H3V6H6Z', stroke: '', solid: 'M10 9h10v2h-10zM11 11h8v12h-8zM19 13h4v2h-4zM21 15h2v4h-2zM19 19h4v2h-4z' },
  food: { fill: '#2A2724', edge: '#D9C7A7', shape: ring(16, 16, 14), stroke: 'M11.5 9v5.5a2 2 0 0 0 4 0V9M13.5 9v14M20.5 23V9c-2 1.5-2.5 5-2.5 7.5h2.5', solid: '' },
};

/** The venue's vibe stamp as an SVG string (shapes differ, so it reads without colour). */
export function stampSvg(v: Vibe, size = 24, dim = false): string {
  const s = STAMP[v];
  const edge = dim ? '#8C877F' : s.edge;
  return `<svg class="stamp" width="${size}" height="${size}" viewBox="0 0 32 32" role="img" aria-label="${VIBE[v].label}">` +
    `<path d="${s.shape}" fill="${s.fill}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/>` +
    (s.stroke ? `<path d="${s.stroke}" fill="none" stroke="${edge}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
    (s.solid ? `<path d="${s.solid}" fill="${edge}"/>` : '') + '</svg>';
}
