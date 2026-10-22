// The full map page: pan and zoom, spawn and zoom buttons, a position readout, and search
// across borders, shops and players. Deep links: ?find=Name, or ?x=..&z=..&zoom=..
import {
  createWorldMap,
  wireMapButtons,
  worldToLatLng,
  latLngToWorld,
  DETAIL_ZOOM,
  DEFAULT_ZOOM,
} from './map-core.js?v=00506aba';
import { el, byId, faceEl, playerHref, colorDot, getJSON, SPAWN } from './ui.js?v=4d932c1e';
import { loadItems, findShops, matchItems, shopIconEl } from './shops-core.js?v=c31c3fa6';
import { mapSearch } from './map-search.js?v=d6d0b003';

const params = new URLSearchParams(location.search);
const center =
  params.has('x') && params.has('z') ? { x: Number(params.get('x')), z: Number(params.get('z')) } : SPAWN;
const { map, tiles, borders, shops } = await createWorldMap(byId('map'), {
  center,
  zoom: Number(params.get('zoom')) || DEFAULT_ZOOM,
});
wireMapButtons(map);
const mapFailed = !tiles;

/* ---- Position readout ------------------------------------------------------------- */

// The position under the cursor on a desktop, or of the centre of the map on a phone.
const info = byId('mapinfo');
const coord = (n) => String(Math.round(n)).replace('-', '−');
const showInfo = ({ x, z }) =>
  (info.textContent = mapFailed
    ? "The map couldn't load. Try again in a moment."
    : `X ${coord(x)}, Z ${coord(z)}`);
const showCenter = () => showInfo(latLngToWorld(map.getCenter()));
let hoverFrame = 0;
map.on('mousemove', (e) => {
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    showInfo(latLngToWorld(e.latlng));
  });
});
map.on('moveend zoomend mouseout', showCenter);
showCenter();

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
  if (r.type === 'border') return [colorDot(r.ref.color), r.label, 'Border'];
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

// The item list and the roster are only needed once someone searches, so they load when the search first opens.
let searchData = null;
const loadSearchData = () =>
  (searchData ||= Promise.all([loadItems(), getJSON('data/players.json', [])]).then(([db, list]) => {
    items = db;
    roster = list;
    searchBox.render();
  }));
const searchBox = mapSearch({ search, row, choose, onOpen: loadSearchData });

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
