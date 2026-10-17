// The world map, shared by the homepage preview and the full map page:
// Leaflet on top of the cubiomes WASM biome renderer (tiles are drawn in Web Workers),
// plus the borders, shops and spawn marker from the site's JSON files.
// Leaflet itself is loaded by the page as a global (window.L).
import { url, el, SEED, SPAWN } from './ui.js';

// 1 map unit = 4096 blocks. At NATIVE_ZOOM that is exactly one pixel per block; every
// zoom level out doubles blocks per pixel. Latitude is -Z so north stays up.
const UNIT = 4096, NATIVE_ZOOM = 12, TILE = 256;
export const blocksPerPixel = (z) => 2 ** (NATIVE_ZOOM - z);
export const worldToLatLng = (x, z) => L.latLng(-z / UNIT, x / UNIT);
export const latLngToWorld = (ll) => ({ x: ll.lng * UNIT, z: -ll.lat * UNIT });

// Shop icons are a fixed screen size, so zoomed far out they would only be clutter.
export const SHOP_MAX_BPP = 3;
export const DEFAULT_ZOOM = 10;
export const DETAIL_ZOOM = 13;

async function fetchJSON(path, fallback = []) {
  try {
    const r = await fetch(url(path), { cache: 'no-cache' });
    return r.ok ? await r.json() : fallback;
  } catch { return fallback; }
}

class TilePool {
  constructor(seed, count) {
    this.workers = []; this.pending = new Map(); this.nextId = 0; this.nextWorker = 0;
    for (let i = 0; i < count; i++) {
      const w = new Worker(url('wasm/tile-worker.js'));
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') return;
        const done = this.pending.get(m.id);
        if (done) { this.pending.delete(m.id); done(m.pixels); }
      };
      w.postMessage({ type: 'init', seed });
      this.workers.push(w);
    }
  }
  request(worldX0, worldZ0, w, h, bpp) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      const worker = this.workers[this.nextWorker];
      this.nextWorker = (this.nextWorker + 1) % this.workers.length;
      worker.postMessage({ type: 'render', id, worldX0, worldZ0, w, h, bpp });
    });
  }
}

function biomeLayer(pool) {
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = TILE;
      tile.className = 'biome-tile';
      const bpp = Math.max(1, Math.round(blocksPerPixel(coords.z)));
      pool.request(coords.x * TILE * bpp, coords.y * TILE * bpp, TILE, TILE, bpp).then((pixels) => {
        tile.getContext('2d').putImageData(new ImageData(pixels, TILE, TILE), 0, 0);
        done(null, tile);
      });
      return tile;
    },
  });
  return new Layer({ tileSize: TILE, noWrap: true, updateWhenZooming: false, maxNativeZoom: NATIVE_ZOOM });
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
 *   workers       tile workers to start
 *   shopSize      shop icon size in px
 */
export async function createWorldMap(element, opts = {}) {
  const {
    interactive = true, labels = true, center = SPAWN, zoom = DEFAULT_ZOOM,
    workers = Math.min(4, Math.max(2, navigator.hardwareConcurrency || 2)), shopSize = 28,
  } = opts;

  const map = L.map(element, {
    crs: L.CRS.Simple, minZoom: 0, maxZoom: 16, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 100,
    zoomControl: false, attributionControl: false, zoomAnimation: true,
    dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive,
    touchZoom: interactive, boxZoom: interactive, keyboard: interactive,
  });
  map.setView(worldToLatLng(center.x, center.z), zoom);
  const tiles = biomeLayer(new TilePool(SEED, workers)).addTo(map);

  const spawnMarker = L.marker(worldToLatLng(SPAWN.x, SPAWN.z), { icon: spawnIcon(), interactive: false, keyboard: false }).addTo(map);

  const [borderData, shopData] = await Promise.all([fetchJSON('borders.json'), fetchJSON('shops.json')]);

  const borders = borderData.map((b) => {
    const color = b.color || '#ffa94d';
    const hideLabel = !!b.hideLabel;
    const layer = L.polygon(b.points.map((p) => worldToLatLng(p.x, p.z)), {
      color, weight: interactive ? 3 : 2, fillColor: color, fillOpacity: hideLabel ? 0 : 0.25, interactive,
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
  const shops = shopData.map((s) => {
    const marker = L.marker(worldToLatLng(s.x, s.z), { icon, interactive, keyboard: interactive });
    if (interactive && s.label) marker.bindPopup(el('span', {}, s.label), { closeButton: false, className: 'shop-popup' });
    return { ...s, marker };
  });
  const syncShops = () => {
    const show = blocksPerPixel(map.getZoom()) <= SHOP_MAX_BPP;
    for (const s of shops) {
      if (show && !map.hasLayer(s.marker)) s.marker.addTo(map);
      else if (!show && map.hasLayer(s.marker)) map.removeLayer(s.marker);
    }
  };
  map.on('zoom', syncShops);
  syncShops();

  return { map, tiles, borders, shops, spawnMarker };
}
