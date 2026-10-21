// Shared helpers: site paths, DOM building, faces, number and time formatting.
// Everything is resolved from this file's own location, so the site works from any
// base path (localhost, https://user.github.io/Voxel/, a custom domain).

export const ROOT = new URL('../', import.meta.url);
export const url = (path) => new URL(path, ROOT).href;

// One place for the world facts. The spawn is what cubiomes reports for this seed.
export const SEED = '2344567094';
export const SPAWN = { x: 32, z: -4 };
export const MC_VERSION = '26.3';

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

/** A JSON file from the site, or the fallback when it is missing or broken. */
export async function getJSON(path, fallback) {
  try {
    const res = await fetch(url(path), { cache: 'no-cache' });
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
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

const nf = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
export const fmt = (n) => nf.format(n);
export const fmtInt = (n) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);

/** 69.4 -> "69 h", 0.5 -> "30 min". */
export function fmtHours(h) {
  if (h < 1) return Math.round(h * 60) + ' min';
  return (h >= 100 ? fmtInt(h) : fmt(h)) + ' h';
}
export function fmtMinutes(m) {
  const h = Math.floor(m / 60),
    r = Math.round(m % 60);
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
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

/** Parses a /data CSV into an array of row objects. Handles quoted fields. */
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const head = rows.shift() || [];
  return rows
    .filter((r) => r.length > 1 || r[0])
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));

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
/** A border's colour as a class, for the small colour dots in search (the editor palette is in site.css). */
export const colorClass = (hex) =>
  'c-' +
  String(hex || '')
    .replace('#', '')
    .toLowerCase();

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
  return { day: Date.UTC(+p.year, +p.month - 1, +p.day) / 864e5, hour: +p.hour };
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
