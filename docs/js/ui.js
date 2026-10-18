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

/** A player's head. Falls back to a letter tile if the PNG is missing (brand new player). */
export function faceEl(name, size = '') {
  const cls = 'face' + (size ? ' face--' + size : '');
  const img = el('img', {
    class: cls, alt: '', width: 40, height: 40, decoding: 'async',
    src: url('faces/' + encodeURIComponent(name) + '.png'),
  });
  img.addEventListener('error', () => {
    const tile = el('span', { class: cls + ' face--letter', 'aria-hidden': 'true' }, name.replace(/^[^A-Za-z0-9]+/, '').charAt(0) || '?');
    img.replaceWith(tile);
  }, { once: true });
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
  const h = Math.floor(m / 60), r = Math.round(m % 60);
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
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));
}

export const hourLabel = (h) => String(h).padStart(2, '0') + ':00';

/** Parses a /data CSV into an array of row objects. Handles quoted fields. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1 || r[0]).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Bar widths and heights come from data, so they are classes (w-0 .. w-100, h-0 .. h-100 in site.css), not inline styles. */
const pctOf = (n) => Math.max(0, Math.min(100, Math.round(n)));
export const widthClass = (pct) => 'w-' + pctOf(pct);
export const heightClass = (pct) => 'h-' + pctOf(pct);
/** A border's colour as a class, for the small colour dots in search (the editor palette is in site.css). */
export const colorClass = (hex) => 'c-' + String(hex || '').replace('#', '').toLowerCase();
