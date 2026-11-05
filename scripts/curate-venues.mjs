// Build the curated venue file the app ships with (src/data/venues.json) from the
// raw OSM snapshot (src/data/venues-osm.json). The CURATED table below is the source
// of truth for which places can be planned, their vibe stamp and district.
// OSM categories are not trusted for vibe (Sean O'Callaghan's is tagged bar, the
// Arbor taproom restaurant), so every vibe here is set by hand.
// Run: npm run curate
import { readFile, writeFile } from 'node:fs/promises';

/** [OSM id, vibe, district, short name or null] */
const CURATED = [
  // Pubs (Celtic)
  ['node/14052008459', 'pub', 'downtown', null], // Sean O'Callaghan's (OSM: bar)
  ['node/14052008453', 'pub', 'downtown', 'Park Place'], // Park Place Gastropub (OSM: bar)
  ['node/9694960017', 'pub', 'downtown', 'Arbor Brewing'], // Arbor Brewing Plymouth Taproom (OSM: restaurant)
  ['node/626786721', 'pub', 'old-village', 'Liberty Street'], // Liberty Street Brewing Company
  // Cocktails (deco lounge)
  ['node/626797236', 'cocktails', 'downtown', 'Highline Room'], // OSM: bar
  ['node/14052387681', 'cocktails', 'downtown', 'Sardine Room'], // OSM: restaurant
  ['node/14052008454', 'cocktails', 'downtown', null], // The Ledger (OSM: restaurant)
  // Bars (retro arcade)
  ['node/14052008456', 'bar', 'downtown', null], // The Ebeneezer
  ['node/14052008457', 'bar', 'downtown', 'Penn Bar'], // Penn Bar And Grill
  ['node/6277356292', 'bar', 'downtown', 'Pourhouse'], // Downtown Pourhouse
  ['node/626787820', 'bar', 'old-village', "Hermann's"], // Hermann's Olde Town Grille
  // Food (neutral)
  ['node/13089084428', 'food', 'downtown', "Compari's"],
  ['node/14052387682', 'food', 'downtown', null], // Fiamma
  ['node/2948729506', 'food', 'downtown', 'Bigalora'],
  ['node/7993902894', 'food', 'downtown', 'Barrio'],
  ['node/7993902895', 'food', 'downtown', null], // Thai Basil
  ['node/7022335576', 'food', 'downtown', null], // Pizza e Vino
  ['node/14059887536', 'food', 'downtown', null], // The Ironwood
  ['node/1666510562', 'food', 'downtown', null], // Nico & Vali
  ['way/287629844', 'food', 'downtown', null], // Thai Ocha (200 S Main, north edge of downtown)
  ['node/626791921', 'food', 'between', "Bode's"], // Bode's Corn Beef House, halfway up Main
  ['way/287751509', 'food', 'old-village', null], // Crawford's
  ['way/97050183', 'food', 'old-village', null], // Station 885
  ['way/287751501', 'food', 'old-village', null], // Aqua
];

// Display names where OSM's spelling reads oddly on a card.
const NAME_FIX = {
  'Barrio Cocina Y Tequileria': 'Barrio Cocina y Tequileria',
  'Penn Bar And Grill': 'Penn Bar & Grill',
  'Liberty Street Brewing Company': 'Liberty Street Brewing',
  'Arbor Brewing Plymouth Taproom': 'Arbor Brewing Taproom',
};

const raw = JSON.parse(await readFile(new URL('../src/data/venues-osm.json', import.meta.url)));
const byId = new Map(raw.venues.map((v) => [v.id, v]));
const venues = CURATED.map(([id, vibe, district, short]) => {
  const v = byId.get(id);
  if (!v) throw new Error(`Curated venue ${id} missing from venues-osm.json`);
  const name = NAME_FIX[v.name] ?? v.name;
  return { id, name, short: short ?? name, vibe, district, lat: v.lat, lon: v.lon, address: v.addr ?? null, osmAmenity: v.amenity, vibeSetByHand: vibe !== { bar: 'bar', pub: 'pub', restaurant: 'food' }[v.amenity] };
});

await writeFile(new URL('../src/data/venues.json', import.meta.url), JSON.stringify({
  source: `${raw.source}; vibes and districts hand-curated in scripts/curate-venues.mjs`,
  osmFetchedAt: raw.fetchedAt,
  venues,
}, null, 2) + '\n');
console.log(`${venues.length} curated venues`);
