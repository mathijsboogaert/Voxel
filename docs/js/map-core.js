// The world map, shared by the homepage preview, the full map page and the editor:
// Leaflet showing the explored world from pre-rendered tiles (tools/world/render_world.py),
// plus the borders, shops and spawn marker from the site's JSON files.
// Leaflet itself is loaded by the page as a global (window.L).
import { url, el, svgEl, getJSON, byId, SPAWN, DEFAULT_BORDER_COLOR } from './ui.js?v=4d932c1e';
import { shopHref, shopIconEl, isOpen } from './shops-core.js?v=6be4719b';

// 1 map unit = 4096 blocks. At NATIVE_ZOOM that is exactly one pixel per block; every
// zoom level out doubles blocks per pixel. Latitude is -Z so north stays up.
const UNIT = 4096;
const NATIVE_ZOOM = 12;
const TILE = 256;
export const blocksPerPixel = (zoom) => 2 ** (NATIVE_ZOOM - zoom);
export const worldToLatLng = (x, z) => L.latLng(-z / UNIT, x / UNIT);
export const latLngToWorld = (ll) => ({ x: ll.lng * UNIT, z: -ll.lat * UNIT });

// Shop markers are a fixed screen size, so zoomed far out they would only be clutter.
export const SHOP_MAX_BPP = 3;
// Border names are hidden once you are closer than this, so they don't cover the builds.
export const LABEL_MAX_BPP = 4;
export const DEFAULT_ZOOM = 10;
export const DETAIL_ZOOM = 13;

/* ---- Tiles ---------------------------------------------------------------------- */

/**
 * The explored world: pre-rendered tiles listed in tiles/manifest.json. Only tiles that exist are
 * requested; where a detailed tile is missing, the nearest coarser tile is cropped and scaled up,
 * so the whole explored area shows at every zoom.
 */
async function exploredLayer() {
  const manifest = await getJSON('tiles/manifest.json', null);
  if (!manifest) return null;

  const have = {};
  for (const [z, list] of Object.entries(manifest.tiles))
    have[z] = new Set(list.map(([x, y]) => `${x},${y}`));

  const images = new Map();
  const load = (z, x, y) => {
    const key = `${z}/${x}/${y}`;
    if (!images.has(key)) {
      images.set(
        key,
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url(`tiles/${key}.${manifest.format}`);
        }),
      );
    }
    return images.get(key);
  };

  // The tile to draw: the exact one, else the closest ancestor (z-1, z-2, ...) down to minZoom.
  const source = (z, x, y) => {
    for (let d = 0; z - d >= manifest.minZoom; d++) {
      const zz = z - d;
      const xx = x >> d;
      const yy = y >> d;
      if (have[zz] && have[zz].has(`${xx},${yy}`)) return { z: zz, x: xx, y: yy, d };
    }
    return null;
  };

  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = TILE;
      tile.className = 'biome-tile';
      // Beyond the deepest rendered zoom the last tiles are stretched.
      const z = Math.min(coords.z, manifest.maxZoom);
      const shift = coords.z - z;
      const src = source(z, coords.x >> shift, coords.y >> shift);
      if (!src) {
        setTimeout(() => done(null, tile));
        return tile;
      }
      load(src.z, src.x, src.y).then((img) => {
        if (img) {
          const ctx = tile.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          const scale = 2 ** (src.d + shift); // how many tile pixels each source pixel covers
          const size = TILE / scale; // source pixels shown in this tile
          if (scale <= 1) {
            ctx.drawImage(img, 0, 0);
          } else {
            // % in JS is negative for negative tile numbers, so wrap it back into 0..scale-1.
            const ox = (((coords.x % scale) + scale) % scale) * size;
            const oy = (((coords.y % scale) + scale) % scale) * size;
            ctx.drawImage(img, ox, oy, size, size, 0, 0, TILE, TILE);
          }
        }
        done(null, tile);
      });
      return tile;
    },
  });

  const layer = new Layer({
    tileSize: TILE,
    noWrap: true,
    updateWhenZooming: false,
    maxNativeZoom: 16,
    minZoom: 0,
  });
  layer.manifest = manifest;
  return layer;
}

/* ---- The base map ------------------------------------------------------------------ */

const spawnIcon = () =>
  L.divIcon({
    className: '',
    html: svgEl(
      'svg',
      { class: 'spawn-pin', viewBox: '0 0 28 28', 'aria-hidden': 'true' },
      svgEl('path', { d: 'M14 27C14 27 4.5 17.5 4.5 11a9.5 9.5 0 0 1 19 0C23.5 17.5 14 27 14 27Z' }),
      svgEl('circle', { cx: 14, cy: 11, r: 3.2 }),
    ),
    iconSize: [28, 28],
    iconAnchor: [14, 26],
  });

/**
 * createBaseMap(element, options) -> {map, tiles}
 * The Leaflet map with the explored world, its bounds and the spawn pin. Border labels hide
 * when zoomed in close (the element gets the class labels-off).
 *   interactive   pan/zoom/tap on (default) or a still picture
 *   center, zoom  starting view; center is a world {x, z}
 */
export async function createBaseMap(
  element,
  { interactive = true, center = SPAWN, zoom = DEFAULT_ZOOM } = {},
) {
  const map = L.map(element, {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 16,
    zoomSnap: 0,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 100,
    zoomControl: false,
    attributionControl: false,
    dragging: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: interactive,
    touchZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
  });
  map.setView(worldToLatLng(center.x, center.z), zoom);

  const tiles = await exploredLayer();
  if (tiles) {
    const b = tiles.manifest.bounds;
    const pad = 512;
    tiles.addTo(map);
    map.setMaxBounds(
      L.latLngBounds(worldToLatLng(b.x0 - pad, b.z1 + pad), worldToLatLng(b.x1 + pad, b.z0 - pad)),
    );
    map.setMinZoom(tiles.manifest.minZoom - 1);
  }

  L.marker(worldToLatLng(SPAWN.x, SPAWN.z), { icon: spawnIcon(), interactive: false, keyboard: false }).addTo(
    map,
  );

  const syncLabels = () =>
    element.classList.toggle('labels-off', blocksPerPixel(map.getZoom()) < LABEL_MAX_BPP);
  map.on('zoom', syncLabels);
  syncLabels();

  return { map, tiles };
}

/** The spawn and zoom buttons every full-screen map has (#btn-spawn, #btn-in, #btn-out). */
export function wireMapButtons(map) {
  byId('btn-spawn').addEventListener('click', () =>
    map.setView(worldToLatLng(SPAWN.x, SPAWN.z), DEFAULT_ZOOM),
  );
  byId('btn-in').addEventListener('click', () => map.zoomIn(1));
  byId('btn-out').addEventListener('click', () => map.zoomOut(1));
}

/**
 * Shows layers only while zoomed in close enough (blocks per pixel at most SHOP_MAX_BPP).
 * getLayers() is called on every zoom, so the list may change.
 */
export function showWhenClose(map, getLayers) {
  const sync = () => {
    const show = blocksPerPixel(map.getZoom()) <= SHOP_MAX_BPP;
    for (const layer of getLayers()) {
      if (show && !map.hasLayer(layer)) layer.addTo(map);
      else if (!show && map.hasLayer(layer)) map.removeLayer(layer);
    }
  };
  map.on('zoom', sync);
  sync();
  return sync;
}

/* ---- The world map: base map plus borders and shops ----------------------------------- */

/** A shop's popup: its icon over the full height on the left; its name, and a link to what it sells, beside it. */
const shopPopup = (s) =>
  el(
    'div',
    { class: 'shop-popup__body' },
    el('span', { class: 'shop-popup__icon' }, shopIconEl(s)),
    el(
      'span',
      { class: 'shop-popup__text' },
      el('span', {}, s.label),
      isOpen(s) && (s.products || []).length
        ? el('a', { class: 'shop-popup__link', href: shopHref(s) }, 'What it sells')
        : null,
    ),
  );

/**
 * createWorldMap(element, options) -> {map, tiles, borders, shops}
 *   interactive   pan/zoom/tap on (default) or a still picture
 *   labels        show border name labels (borders with hideLabel stay hidden)
 *   center, zoom  starting view; center is a world {x, z}
 *   shopSize      shop marker size in px
 */
export async function createWorldMap(element, opts = {}) {
  const { interactive = true, labels = true, shopSize = 28 } = opts;
  const { map, tiles } = await createBaseMap(element, opts);
  const [borderData, shopData] = await Promise.all([getJSON('borders.json', []), getJSON('shops.json', [])]);

  const borders = borderData.map((b) => {
    const color = b.color || DEFAULT_BORDER_COLOR;
    const hideLabel = !!b.hideLabel;
    const latlngs = b.points.map((p) => worldToLatLng(p.x, p.z));
    const layer = L.polygon(latlngs, { color, weight: interactive ? 3 : 2, fill: false, interactive }).addTo(
      map,
    );
    let tooltip = null;
    if (labels && b.label && !hideLabel) {
      tooltip = L.tooltip({
        permanent: true,
        direction: 'center',
        className: 'border-label',
        interactive: false,
      })
        .setLatLng(layer.getCenter())
        .setContent(el('span', {}, b.label))
        .addTo(map);
    }
    return { ...b, color, hideLabel, layer, tooltip };
  });

  const icon = L.icon({
    iconUrl: url('assets/shop-icon.png?v=00997138'),
    className: 'shop-marker-icon',
    iconSize: [shopSize, shopSize],
    iconAnchor: [shopSize / 2, shopSize / 2],
    popupAnchor: [0, -shopSize / 2 - 2],
  });
  const popupOptions = { closeButton: false, className: 'shop-popup' };

  // A shop is drawn as an outline over its building, so the build stays visible underneath.
  // Older shops that are only a point still get the marker icon.
  const shops = shopData.map((s) => {
    if (Array.isArray(s.points) && s.points.length >= 3) {
      const latlngs = s.points.map((p) => worldToLatLng(p.x, p.z));
      const casing = L.polygon(latlngs, { fill: false, interactive: false, className: 'shop-casing' });
      // A spoiler wall is filled solid black so what is behind it can't be seen. Colours are in map.css.
      const className = s.spoiler ? 'shop-outline shop-outline--spoiler' : 'shop-outline';
      const shape = L.polygon(latlngs, { fill: true, interactive, className });
      if (interactive && s.label) shape.bindPopup(shopPopup(s), popupOptions);
      const bounds = shape.getBounds();
      return {
        ...s,
        marker: L.layerGroup([casing, shape]),
        bounds,
        open: () => shape.openPopup(bounds.getCenter()),
      };
    }
    const marker = L.marker(worldToLatLng(s.x, s.z), { icon, interactive, keyboard: interactive });
    if (interactive && s.label) marker.bindPopup(shopPopup(s), popupOptions);
    return { ...s, marker, bounds: null, open: () => marker.openPopup() };
  });
  showWhenClose(map, () => shops.map((s) => s.marker));

  return { map, tiles, borders, shops };
}
