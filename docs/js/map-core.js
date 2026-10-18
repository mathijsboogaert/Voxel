// The world map, shared by the homepage preview and the full map page:
// Leaflet showing the explored world from pre-rendered tiles (tools/world/render_world.py),
// plus the borders, shops and spawn marker from the site's JSON files.
// Leaflet itself is loaded by the page as a global (window.L).
import { url, el, SPAWN } from './ui.js';

// 1 map unit = 4096 blocks. At NATIVE_ZOOM that is exactly one pixel per block; every
// zoom level out doubles blocks per pixel. Latitude is -Z so north stays up.
const UNIT = 4096, NATIVE_ZOOM = 12, TILE = 256;
export const blocksPerPixel = (z) => 2 ** (NATIVE_ZOOM - z);
export const worldToLatLng = (x, z) => L.latLng(-z / UNIT, x / UNIT);
export const latLngToWorld = (ll) => ({ x: ll.lng * UNIT, z: -ll.lat * UNIT });

// Shop icons are a fixed screen size, so zoomed far out they would only be clutter.
export const SHOP_MAX_BPP = 3;
// Border names are hidden once you are closer than this, so they don't cover the builds.
export const LABEL_MAX_BPP = 4;
export const DEFAULT_ZOOM = 10;
export const DETAIL_ZOOM = 13;

async function fetchJSON(path, fallback = []) {
  try {
    const r = await fetch(url(path), { cache: 'no-cache' });
    return r.ok ? await r.json() : fallback;
  } catch { return fallback; }
}

// The explored world: pre-rendered tiles listed in tiles/manifest.json. Only tiles that exist are
// requested; where a detailed tile is missing (outside the base neighbourhoods) the nearest coarser
// tile is cropped and scaled up instead, so the whole explored area shows at every zoom.
export async function exploredLayer() {
  const manifest = await fetchJSON('tiles/manifest.json', null);
  if (!manifest) return null;
  const have = {};
  for (const [z, list] of Object.entries(manifest.tiles)) have[z] = new Set(list.map(([x, y]) => x + ',' + y));
  const images = new Map();
  const load = (z, x, y) => {
    const key = `${z}/${x}/${y}`;
    if (!images.has(key)) {
      images.set(key, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url(`tiles/${key}.${manifest.format}`);
      }));
    }
    return images.get(key);
  };
  // Find the tile to draw: the exact one, else the closest ancestor (z-1, z-2, ...) down to minZoom.
  const source = (z, x, y) => {
    for (let d = 0; z - d >= manifest.minZoom; d++) {
      const zz = z - d, xx = x >> d, yy = y >> d;
      if (have[zz] && have[zz].has(xx + ',' + yy)) return { z: zz, x: xx, y: yy, d };
    }
    return null;
  };
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = TILE;
      tile.className = 'biome-tile';
      const z = Math.min(coords.z, manifest.maxZoom), shift = coords.z - z;   // beyond native: stretch
      const src = source(z, coords.x >> shift, coords.y >> shift);
      if (!src) { setTimeout(() => done(null, tile)); return tile; }
      load(src.z, src.x, src.y).then((img) => {
        if (img) {
          const ctx = tile.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          const f = 2 ** (src.d + shift);           // how many tile pixels each source pixel covers
          const size = TILE / f;                    // source pixels shown in this tile
          if (f <= 1) ctx.drawImage(img, 0, 0);
          else {
            const ox = (((coords.x % f) + f) % f) * size, oy = (((coords.y % f) + f) % f) * size;   // JS % is negative for negative tiles
            ctx.drawImage(img, ox, oy, size, size, 0, 0, TILE, TILE);
          }
        }
        done(null, tile);
      });
      return tile;
    },
  });
  const layer = new Layer({ tileSize: TILE, noWrap: true, updateWhenZooming: false, maxNativeZoom: 16, minZoom: 0 });
  layer.manifest = manifest;
  return layer;
}

const spawnIcon = () => L.divIcon({
  className: '',
  html: '<svg class="spawn-pin" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 27C14 27 4.5 17.5 4.5 11a9.5 9.5 0 0 1 19 0C23.5 17.5 14 27 14 27Z"/><circle cx="14" cy="11" r="3.2"/></svg>',
  iconSize: [28, 28], iconAnchor: [14, 26],
});

/**
 * createWorldMap(element, options) -> {map, tiles, borders, shops, spawnMarker}
 *   interactive   pan/zoom/tap on (default) or a still picture
 *   labels        show border name labels (labels hidden per border in borders.json still stay hidden)
 *   center, zoom  starting view; center is a world {x, z}
 *   shopSize      shop icon size in px
 */
export async function createWorldMap(element, opts = {}) {
  const {
    interactive = true, labels = true, center = SPAWN, zoom = DEFAULT_ZOOM,
    shopSize = 28,
  } = opts;

  const map = L.map(element, {
    crs: L.CRS.Simple, minZoom: 0, maxZoom: 16, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 100,
    zoomControl: false, attributionControl: false, zoomAnimation: true,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive,
    touchZoom: interactive, boxZoom: interactive, keyboard: interactive,
  });
  map.setView(worldToLatLng(center.x, center.z), zoom);
  const tiles = await exploredLayer();
  if (tiles) {
    const m = tiles.manifest.bounds, pad = 512;
    tiles.addTo(map);
    map.setMaxBounds(L.latLngBounds(worldToLatLng(m.x0 - pad, m.z1 + pad), worldToLatLng(m.x1 + pad, m.z0 - pad)));
    map.setMinZoom(tiles.manifest.minZoom - 1);
  }

  const spawnMarker = L.marker(worldToLatLng(SPAWN.x, SPAWN.z), { icon: spawnIcon(), interactive: false, keyboard: false }).addTo(map);

  const [borderData, shopData] = await Promise.all([fetchJSON('borders.json'), fetchJSON('shops.json')]);

  const borders = borderData.map((b) => {
    const color = b.color || '#ffa94d';
    const hideLabel = !!b.hideLabel;
    const layer = L.polygon(b.points.map((p) => worldToLatLng(p.x, p.z)), {
      color, weight: interactive ? 3 : 2, fill: false, interactive,
    }).addTo(map);
    let tooltip = null;
    if (labels && b.label && !hideLabel) {
      tooltip = L.tooltip({ permanent: true, direction: 'center', className: 'border-label', interactive: false })
        .setLatLng(layer.getCenter()).setContent(el('span', {}, b.label)).addTo(map);
    }
    return { ...b, color, hideLabel, layer, tooltip };
  });

  const icon = L.icon({
    iconUrl: url('assets/shop-icon.png'), className: 'shop-marker-icon',
    iconSize: [shopSize, shopSize], iconAnchor: [shopSize / 2, shopSize / 2], popupAnchor: [0, -shopSize / 2 - 2],
  });
  // A shop is drawn as an outline over its building (s.points, drawn in the editor), so the build stays
  // visible underneath. Older shops that are only a point still get the icon.
  const shops = shopData.map((s) => {
    if (Array.isArray(s.points) && s.points.length >= 3) {
      const ll = s.points.map((p) => worldToLatLng(p.x, p.z));
      const casing = L.polygon(ll, { color: '#16120f', weight: 7, fill: false, interactive: false, className: 'shop-casing' });
      const shape = L.polygon(ll, { color: '#ff9505', weight: 3, fill: true, fillOpacity: 0, interactive, className: 'shop-outline' });
      if (interactive && s.label) shape.bindPopup(el('span', {}, s.label), { closeButton: false, className: 'shop-popup' });
      const bounds = shape.getBounds();
      return { ...s, marker: L.layerGroup([casing, shape]), bounds, open: () => shape.openPopup(bounds.getCenter()) };
    }
    const marker = L.marker(worldToLatLng(s.x, s.z), { icon, interactive, keyboard: interactive });
    if (interactive && s.label) marker.bindPopup(el('span', {}, s.label), { closeButton: false, className: 'shop-popup' });
    return { ...s, marker, bounds: null, open: () => marker.openPopup() };
  });
  const syncShops = () => {
    const show = blocksPerPixel(map.getZoom()) <= SHOP_MAX_BPP;
    for (const s of shops) {
      if (show && !map.hasLayer(s.marker)) s.marker.addTo(map);
      else if (!show && map.hasLayer(s.marker)) map.removeLayer(s.marker);
    }
  };
  const syncLabels = () => element.classList.toggle('labels-off', blocksPerPixel(map.getZoom()) < LABEL_MAX_BPP);
  map.on('zoom', () => { syncShops(); syncLabels(); });
  syncShops();
  syncLabels();

  return { map, tiles, borders, shops, spawnMarker };
}
