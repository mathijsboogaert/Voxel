// The full map page: pan and zoom, spawn and zoom buttons, a position readout, and search
// across borders, shops and players. Deep links: ?find=Name, or ?x=..&z=..&zoom=..
import {
  createWorldMap,
  wireMapButtons,
  loadBiomeLookup,
  worldToLatLng,
  latLngToWorld,
  blocksPerPixel,
  DETAIL_ZOOM,
  DEFAULT_ZOOM,
} from './map-core.js';
import { el, byId, faceEl, playerHref, colorClass, getJSON, SPAWN } from './ui.js';
import { loadItems, findShops, matchItems, shopIconEl } from './shops-core.js';
import { mapSearch } from './map-search.js';

const params = new URLSearchParams(location.search);
const center =
  params.has('x') && params.has('z') ? { x: Number(params.get('x')), z: Number(params.get('z')) } : SPAWN;
const { map, borders, shops } = await createWorldMap(byId('map'), {
  center,
  zoom: Number(params.get('zoom')) || DEFAULT_ZOOM,
});
wireMapButtons(map);

/* ---- Position readout ------------------------------------------------------------- */

const info = byId('mapinfo');
let biomeAt = () => null;
const coord = (n) => String(Math.round(n)).replace('-', '−');

function showInfo(x, z, prefix) {
  const biome = biomeAt(x, z);
  info.replaceChildren(
    biome ? `${biome} ` : '',
    el('span', {}, `${prefix}X ${coord(x)}, Z ${coord(z)}`),
    el('span', {}, `  ${blocksPerPixel(map.getZoom()).toFixed(2)} blocks/px`),
  );
}
const showCenter = () => {
  const c = latLngToWorld(map.getCenter());
  showInfo(c.x, c.z, 'centre ');
};
let hoverFrame = 0;
map.on('mousemove', (e) => {
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    const w = latLngToWorld(e.latlng);
    showInfo(w.x, w.z, '');
  });
});
map.on('moveend zoomend mouseout', showCenter);
showCenter();

loadBiomeLookup()
  .then((lookup) => {
    biomeAt = lookup;
    showCenter();
  })
  .catch((e) => console.warn('Biome lookup unavailable', e));

/* ---- Search ------------------------------------------------------------------------- */

let roster = [];
let items = null;

/** Borders and players by name. */
const byName = () => [
  ...borders.filter((b) => b.label).map((b) => ({ type: 'border', label: b.label, ref: b })),
  ...roster.map((p) => ({ type: 'player', label: p.name, ref: p })),
];

/** A shop whose name matches comes first, then borders and players by name, then shops by what they sell. */
function search(q) {
  const named = (r) => r.label.toLowerCase().includes(q);
  const shopHits = findShops(
    items,
    shops.filter((s) => s.label),
    q,
  ).map((h) => ({
    type: 'shop',
    label: h.shop.label,
    ref: h.shop,
    sub: h.reason,
  }));
  const results = [
    ...shopHits.filter(named),
    ...byName().filter(named),
    ...shopHits.filter((r) => !named(r)),
  ];
  if (results.length) return results.slice(0, 8);
  const item = matchItems(items, q, 1)[0];
  return el('li', { class: 'msearch__empty' }, item ? `No shop sells ${item.name} yet` : 'No matches');
}

function row(r) {
  if (r.type === 'border') return [el('i', { class: colorClass(r.ref.color) }), r.label, 'Border'];
  if (r.type === 'shop') return [shopIconEl(r.ref), r.label, r.sub || 'Shop'];
  return [faceEl(r.label, 'sm'), r.label, 'Player'];
}

function choose(r) {
  if (r.type === 'player') {
    location.href = playerHref(r.label);
  } else if (r.type === 'border') {
    map.fitBounds(r.ref.layer.getBounds(), { maxZoom: DETAIL_ZOOM, padding: [60, 60] });
  } else {
    if (r.ref.bounds) map.fitBounds(r.ref.bounds, { maxZoom: DETAIL_ZOOM, padding: [60, 60] });
    else map.setView(worldToLatLng(r.ref.x, r.ref.z), DETAIL_ZOOM);
    map.once('moveend', () => r.ref.open());
  }
}

const searchBox = mapSearch({ search, row, choose });
loadItems().then((db) => {
  items = db;
  searchBox.render();
});
getJSON('data/players.json', []).then((list) => (roster = list));

/* ---- Deep link: ?find=Name ------------------------------------------------------------ */

const find = (params.get('find') || '').toLowerCase();
if (find) {
  const places = [
    ...shops.filter((s) => s.label).map((s) => ({ type: 'shop', label: s.label, ref: s })),
    ...borders.filter((b) => b.label).map((b) => ({ type: 'border', label: b.label, ref: b })),
  ];
  const hit =
    places.find((r) => r.label.toLowerCase() === find) ||
    places.find((r) => r.label.toLowerCase().includes(find));
  if (hit) choose(hit);
}
