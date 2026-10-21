// The full map page: pan and zoom, spawn and zoom buttons, a position readout, and search
// across borders, shops and players. Deep links: ?find=Name, or ?x=..&z=..&zoom=..
import { createWorldMap, worldToLatLng, latLngToWorld, blocksPerPixel, DETAIL_ZOOM, DEFAULT_ZOOM } from './map-core.js';
import { el, url, faceEl, playerHref, colorClass, SEED, SPAWN } from './ui.js';
import { loadItems, findShops, matchItems, shopIconEl } from './shops-core.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const hasXZ = params.has('x') && params.has('z');

const world = await createWorldMap($('map'), {
  center: hasXZ ? { x: Number(params.get('x')), z: Number(params.get('z')) } : SPAWN,
  zoom: Number(params.get('zoom')) || DEFAULT_ZOOM,
});
const { map, borders, shops } = world;

/* ---- Buttons ------------------------------------------------------------------ */
$('btn-spawn').addEventListener('click', () => map.setView(worldToLatLng(SPAWN.x, SPAWN.z), DEFAULT_ZOOM));
$('btn-in').addEventListener('click', () => map.zoomIn(1));
$('btn-out').addEventListener('click', () => map.zoomOut(1));

/* ---- Position readout ----------------------------------------------------------- */
// Cubiomes on the main thread answers "what biome is here?" for one point at a time.
let cubiomes = null;
const info = $('mapinfo');
const fmtN = (n) => String(Math.round(n)).replace('-', '−');
function biomeAt(x, z) {
  if (!cubiomes) return null;
  const name = cubiomes.ccall('get_biome_name_at', 'string', ['number', 'number'], [Math.round(x), Math.round(z)]);
  return name ? name.replaceAll('_', ' ') : null;
}
function showInfo(x, z, prefix) {
  const biome = biomeAt(x, z);
  info.replaceChildren(
    biome ? `${biome} ` : '', el('span', {}, `${prefix}X ${fmtN(x)}, Z ${fmtN(z)}`),
    el('span', {}, `  ${blocksPerPixel(map.getZoom()).toFixed(2)} blocks/px`));
}
const showCenter = () => { const c = latLngToWorld(map.getCenter()); showInfo(c.x, c.z, 'centre '); };
map.on('moveend zoomend', showCenter);
let hoverRaf = 0;
map.on('mousemove', (e) => {
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; const w = latLngToWorld(e.latlng); showInfo(w.x, w.z, ''); });
});
map.on('mouseout', showCenter);
showCenter();

// Load the biome lookup after the map is up so it never delays the first tiles.
new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = url('wasm/cubiomes.js'); s.onload = ok; s.onerror = fail;
  document.head.append(s);
}).then(() => createCubiomesModule()).then((mod) => {
  mod.ccall('seed_init', null, ['string'], [SEED]);
  cubiomes = mod;
  showCenter();
}).catch((e) => console.warn('Biome lookup unavailable', e));

/* ---- Search ----------------------------------------------------------------------- */
const box = $('msearch'), input = $('search-input'), list = $('search-results'), openBtn = $('btn-search');
let roster = [], items = null;
loadItems().then((db) => { items = db; if (input.value) render(input.value); });
fetch(url('data/players.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((p) => { roster = p; }).catch(() => {});

// Borders and players by name. Shops by name or by what they sell (items.json), see shops-core.js.
function index() {
  return [
    ...borders.filter((b) => b.label).map((b) => ({ type: 'border', label: b.label, ref: b, color: b.color })),
    ...shops.filter((s) => s.label).map((s) => ({ type: 'shop', label: s.label, ref: s })),
    ...roster.map((p) => ({ type: 'player', label: p.name, ref: p })),
  ];
}
function search(q) {
  const named = (r) => r.label.toLowerCase().includes(q);
  const shopHits = findShops(items, shops.filter((s) => s.label), q)
    .map((h) => ({ type: 'shop', label: h.shop.label, ref: h.shop, sub: h.reason }));
  const others = index().filter((r) => r.type !== 'shop' && named(r));
  // A shop whose name matches goes first, then borders and players by name, then shops by what they sell.
  return [...shopHits.filter((r) => named(r)), ...others, ...shopHits.filter((r) => !named(r))].slice(0, 8);
}
let results = [], active = -1;

function openSearch() { box.classList.add('open'); openBtn.setAttribute('aria-expanded', 'true'); input.focus(); }
function closeSearch() {
  box.classList.remove('open'); openBtn.setAttribute('aria-expanded', 'false');
  input.value = ''; list.replaceChildren(); results = []; active = -1; input.blur();
}

function render(query) {
  const q = query.trim().toLowerCase();
  results = q ? search(q) : [];
  active = results.length ? 0 : -1;
  if (!q) { list.replaceChildren(); return; }
  if (!results.length) {
    const item = matchItems(items, q, 1)[0];
    list.replaceChildren(el('li', { class: 'msearch__empty' }, item ? `No shop sells ${item.name} yet` : 'No matches'));
    return;
  }
  list.replaceChildren(...results.map((r, i) => {
    const icon = r.type === 'border' ? el('i', { class: colorClass(r.color) })
      : r.type === 'shop' ? shopIconEl(r.ref)
      : faceEl(r.label, 'sm');
    const sub = r.type === 'border' ? 'Border' : r.type === 'shop' ? (r.sub || 'Shop') : 'Player';
    return el('li', { class: 'sresult', role: 'option', 'aria-selected': String(i === active), onclick: () => choose(i) },
      el('span', { class: 'sresult__icon' }, icon), el('span', {}, r.label, el('small', {}, sub)));
  }));
}

function choose(i) {
  const r = results[i];
  if (!r) return;
  if (r.type === 'player') { location.href = playerHref(r.label); return; }
  if (r.type === 'border') map.fitBounds(r.ref.layer.getBounds(), { maxZoom: DETAIL_ZOOM, padding: [60, 60] });
  else {
    if (r.ref.bounds) map.fitBounds(r.ref.bounds, { maxZoom: DETAIL_ZOOM, padding: [60, 60] });
    else map.setView(worldToLatLng(r.ref.x, r.ref.z), DETAIL_ZOOM);
    map.once('moveend', () => r.ref.open());
  }
  closeSearch();
}

openBtn.addEventListener('click', openSearch);
$('search-close').addEventListener('click', closeSearch);
input.addEventListener('input', () => render(input.value));
input.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') closeSearch();
  else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  }
});
document.addEventListener('pointerdown', (e) => {
  if (box.classList.contains('open') && !box.contains(e.target) && !openBtn.contains(e.target)) closeSearch();
});

/* ---- Deep link: ?find=Name -------------------------------------------------------- */
const find = params.get('find');
if (find) {
  const q = find.toLowerCase();
  const hit = index().find((r) => r.type !== 'player' && r.label.toLowerCase() === q) || index().find((r) => r.type !== 'player' && r.label.toLowerCase().includes(q));
  if (hit) { results = [hit]; choose(0); }
}
