// Shared helpers: site paths, DOM building, faces, number and time formatting.
// Everything is resolved from this file's own location, so the site works from any
// base path (localhost, https://user.github.io/Voxel/, a custom domain).

export const ROOT = new URL('../', import.meta.url);
export const url = (path) => new URL(path, ROOT).href;

export const DAY = 864e5;

// The world's seed (the editor keys its saved work by it) and spawn point.
export const SEED = '2344567094';
export const SPAWN = { x: 32, z: -4 };

/** el('div', {class: 'x', onclick: fn}, 'text', childNode, ...) builds DOM without innerHTML. */
export function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** svgEl('path', {d: 'M0 0H8'}) builds an SVG element. Attributes and children work as in el(). */
export function svgEl(tag, attrs, ...kids) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v != null && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** An element by its id. */
export const byId = (id) => document.getElementById(id);

const jsonCache = new Map();
/**
 * A JSON file from the site, or the fallback when it is missing or broken. Each file is fetched once per page
 * and shared by everyone who asks; fresh: true always asks the server again (for data that keeps changing).
 */
export function getJSON(path, fallback, { fresh = false } = {}) {
  if (fresh || !jsonCache.has(path)) {
    const load = fetch(url(path), fresh ? { cache: 'no-cache' } : {})
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .catch((e) => {
        console.warn(`Could not load ${path} (${e.message})`);
        return undefined;
      });
    jsonCache.set(path, load);
  }
  return jsonCache.get(path).then((data) => data ?? fallback);
}

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min';
let leafletPromise = null;
/** Leaflet (window.L) for pages that only need a map further down: added on first call, once. */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  const add = (node, place) =>
    new Promise((resolve, reject) => {
      node.addEventListener('load', resolve);
      node.addEventListener('error', reject);
      place(node);
    });
  // Leaflet's stylesheet goes before the site's own, so map.css can still override it.
  const firstSheet = document.querySelector('link[rel="stylesheet"]');
  leafletPromise ||= Promise.all([
    add(el('link', { rel: 'stylesheet', href: `${LEAFLET}.css` }), (n) =>
      firstSheet ? firstSheet.before(n) : document.head.append(n),
    ),
    add(el('script', { src: `${LEAFLET}.js` }), (n) => document.head.append(n)),
  ]).then(() => window.L);
  return leafletPromise;
}

/** A player's head. Falls back to a letter tile if the PNG is missing (brand new player). */
export function faceEl(name, size = '') {
  const cls = 'face' + (size ? ' face--' + size : '');
  const img = el('img', {
    class: cls,
    alt: '',
    width: 40,
    height: 40,
    decoding: 'async',
    src: url('faces/' + encodeURIComponent(name) + '.png'),
  });
  img.addEventListener(
    'error',
    () => {
      const tile = el(
        'span',
        { class: cls + ' face--letter', 'aria-hidden': 'true' },
        name.replace(/^[^A-Za-z0-9]+/, '').charAt(0) || '?',
      );
      img.replaceWith(tile);
    },
    { once: true },
  );
  return img;
}

export const playerHref = (name) => url('player/') + '?name=' + encodeURIComponent(name);
/** The map, zoomed to a border or shop by its name. */
export const findOnMapHref = (label) => url('map/') + '?find=' + encodeURIComponent(label);

const nf = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);
export const fmtInt = (n) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);

/** 69.4 -> "69 h", 0.5 -> "30 min". */
export function fmtHours(h) {
  if (h < 1) return Math.round(h * 60) + ' min';
  return (h >= 100 ? fmtInt(h) : fmt(h)) + ' h';
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago". */
export function relTime(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : d + ' days ago';
}

/** "Tue 13 Oct" in Dutch time, from an ISO instant. */
export function fmtDay(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(iso));
}

export const hourLabel = (h) => String(h).padStart(2, '0') + ':00';

const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));

/** A share of the biggest value as a bar length in %, never so short that the bar disappears. */
export const barLength = (value, max) => Math.max(3, (value / (max || 1)) * 100);

/**
 * A bar filled from the left, drawn as SVG so the sizes are attributes rather than inline styles.
 * parts: a percentage, or [[percentage, class], ...] laid end to end. The caller's element is the track.
 */
export function bar(parts) {
  const list = typeof parts === 'number' ? [[parts, 'bar__fill']] : parts;
  let x = 0;
  const rects = list.map(([pct, cls]) => {
    const width = clampPct(pct);
    const rect = svgEl('rect', { x, width, height: 1, class: cls });
    x += width;
    return rect;
  });
  return svgEl(
    'svg',
    { class: 'bar', viewBox: '0 0 100 1', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    rects,
  );
}

/** Columns rising from the bottom (one per value, as a percentage), drawn as SVG like bar(). */
export function columns(values, classFor = () => 'bar__fill') {
  const n = values.length;
  const rects = values.map((pct, i) => {
    const height = clampPct(pct);
    return svgEl('rect', { x: i + 0.12, y: 100 - height, width: 0.76, height, class: classFor(i) });
  });
  return svgEl(
    'svg',
    { class: 'columns', viewBox: `0 0 ${n} 100`, preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    rects,
  );
}
/** The border colours the editor offers. A border without a colour is drawn in DEFAULT_BORDER_COLOR. */
export const BORDER_COLORS = [
  '#ff4d4f',
  '#ffa94d',
  '#ffd43b',
  '#69db7c',
  '#38d9a9',
  '#4dabf7',
  '#748ffc',
  '#e599f7',
  '#ffffff',
];
export const DEFAULT_BORDER_COLOR = '#ffa94d';

/** A small square in a border's colour (map search, editor swatches). The colour is an SVG attribute, not a style. */
export const colorDot = (hex) =>
  svgEl(
    'svg',
    { class: 'dot', viewBox: '0 0 1 1', 'aria-hidden': 'true' },
    svgEl('rect', { width: 1, height: 1, fill: hex || DEFAULT_BORDER_COLOR }),
  );

const NL = { timeZone: 'Europe/Amsterdam' };
const dayParts = new Intl.DateTimeFormat('en-CA', {
  ...NL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
const localDay = (t) => {
  const p = Object.fromEntries(dayParts.formatToParts(t).map((x) => [x.type, x.value]));
  return { day: Date.UTC(+p.year, +p.month - 1, +p.day) / DAY, hour: +p.hour };
};
const partOfDay = (h) => (h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');

/**
 * "Last seen ..." in loose, human words, by Dutch time: "just now", "this morning", "yesterday evening",
 * "3 days ago", "2 weeks ago". Works from the clock, so it keeps moving while the page is open.
 */
export function lastSeen(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return 'a while ago';
  if (now - t < 20 * 60 * 1000) return 'just now';
  const a = localDay(t),
    b = localDay(now),
    days = b.day - a.day,
    part = partOfDay(a.hour);
  if (days <= 0) return part === 'night' ? 'in the night' : `this ${part}`;
  if (days === 1) return part === 'night' ? 'last night' : `yesterday ${part}`;
  if (days < 14) return `${days} days ago`;
  if (days < 28) return `${Math.floor(days / 7)} weeks ago`;
  return 'over a month ago';
}
