// Villager News renderer. Turns one edition (news/editions/<slug>.json) into 1920x1080 slides.
// Used by the viewer (news/<slug>/), the archive covers (news/) and the editor preview (news/editor/).
//
// An edition:
//   { v, slug, title, date, edition, summary, intro, ticker: { label, items[] }, pages: [page] }
// A page:
//   { id, layout: 'cover' | 'story', sign, transition: 'push' | 'fade', ticker, villager, blocks: [block] }
//   villager: { src, x, y, w, flip } in slide pixels, or null
// A block (story pages):
//   lead | text | big:  { type, text, size: 's'|'m'|'l', color, align }
//   columns:            { type, cols: [{ icon, lead, text }] }
//   callout:            { type, icon, lead, text }
//   chips:              { type, items: [{ icon, label }] }
//   list:               { type, items: [{ term, text }] }
//   image:              { type, src, caption, h }
// Text takes **bold**, *italic* (\* for a plain star) and line breaks. Paths are relative to news/ (data: URLs work too).

import { coverHost } from './cover-host.js?v=8195697f';

export const W = 1920;
export const H = 1080;

/** The villager pictures to choose from, with where they stand by default. */
export const VILLAGERS = [
  { src: 'assets/villagers/villager-mic.png', name: 'With microphone', x: 1390, y: 547, w: 460 },
  { src: 'assets/villagers/villager-mic-flip.png', name: 'Microphone, other hand', x: 1300, y: 486, w: 520 },
  { src: 'assets/villagers/villager-headphones.png', name: 'Headphones', x: 1380, y: 577, w: 470 },
  { src: 'assets/villagers/villager-village.png', name: 'In the village', x: 1400, y: 628, w: 440 },
  { src: 'assets/villagers/villager.png', name: 'Arms crossed', x: 1420, y: 603, w: 400 },
];

export const COLORS = { red: 'Red', green: 'Green', ink: 'Ink', gold: 'Gold' };

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Plain text with **bold**, *italic* and line breaks, as safe HTML. */
export function inline(text) {
  return esc(String(text ?? '').replace(/\\\*/g, '\u0001'))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br>')
    .replace(/\u0001/g, '*');
}

/** Text without markup, for speaker notes and link previews. */
export function plain(text) {
  return String(text ?? '')
    .replace(/\\\*/g, '\u0001')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\u0001/g, '*')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolve(path, base = '') {
  if (!path) return '';
  return /^(data:|https?:|\/)/.test(path) ? path : base + path;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// ---- Wood --------------------------------------------------------------------

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LIGHT = ['#D2B07D', '#DDBE8C', '#DFC18F', '#E3C595', '#D7B784'];
const DARK = ['#A68859', '#AE905F', '#B49766'];

/** Oak planks the size of a sign, as a data URL: rows of light boards with dark seams and a few knots. */
export function planks(w, h, u = 12, seed = '') {
  const r = rng(seed + w + 'x' + h);
  const pick = (a) => a[(r() * a.length) | 0];
  const parts = [`<rect width="${w}" height="${h}" fill="#C4A372"/>`];
  for (let y = 0, row = 0; y < h; y += row % 2 ? u : 3 * u, row++) {
    const rh = row % 2 ? u : 3 * u;
    for (let x = 0; x < w;) {
      const sw = Math.min(w - x, (2 + ((r() * 7) | 0)) * u);
      parts.push(
        `<rect x="${x}" y="${y}" width="${sw}" height="${rh}" fill="${pick(row % 2 ? DARK : LIGHT)}"/>`,
      );
      if (!(row % 2) && r() < 0.35) {
        const kx = x + ((r() * Math.max(1, sw / u - 1)) | 0) * u;
        const ky = y + ((r() * 3) | 0) * u;
        parts.push(
          `<rect x="${kx}" y="${ky}" width="${u * (r() < 0.3 ? 2 : 1)}" height="${u}" fill="#C9A673"/>`,
        );
      }
      x += sw;
    }
  }
  const b = u / 2;
  parts.push(
    `<path d="M0 0H${w}V${h}H0Z M${b} ${b}V${h - b}H${w - b}V${b}Z" fill="#5E4728" fill-rule="evenodd"/>`,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---- Blocks ------------------------------------------------------------------

function textBlock(b) {
  const kind = b.type === 'big' ? 'vn-big vn-mc' : 'vn-' + b.type;
  const cls = [kind, 'vn-' + (b.size || 'm')];
  if (b.color) cls.push('vn-c-' + b.color);
  if (b.align === 'center') cls.push('vn-center');
  return el('p', cls.join(' '), inline(b.text));
}

const BLOCKS = {
  lead: textBlock,
  text: textBlock,
  big: textBlock,
  columns(b, base) {
    const row = el('div', 'vn-cols vn-wide vn-' + (b.size || 'm'));
    for (const c of b.cols || []) {
      const col = el('div', 'vn-col');
      if (c.icon) col.innerHTML += `<img class="vn-icon" src="${esc(resolve(c.icon, base))}" alt="">`;
      if (c.lead) col.innerHTML += `<p class="vn-lead">${inline(c.lead)}</p>`;
      if (c.text) col.innerHTML += `<p class="vn-text">${inline(c.text)}</p>`;
      row.appendChild(col);
    }
    return row;
  },
  callout(b, base) {
    const box = el('div', 'vn-callout vn-wide');
    if (b.icon) box.innerHTML = `<img class="vn-icon" src="${esc(resolve(b.icon, base))}" alt="">`;
    box.innerHTML += `<div>${b.lead ? `<p class="vn-callout__lead">${inline(b.lead)}</p>` : ''}${
      b.text ? `<p class="vn-callout__text">${inline(b.text)}</p>` : ''
    }</div>`;
    return box;
  },
  chips(b, base) {
    const box = el('div', 'vn-chips vn-wide');
    for (const c of b.items || []) {
      box.innerHTML += `<div class="vn-chip${c.icon ? '' : ' vn-chip--noicon'}">${
        c.icon ? `<img class="vn-icon" src="${esc(resolve(c.icon, base))}" alt="">` : ''
      }<p class="vn-mc">${inline(c.label)}</p></div>`;
    }
    return box;
  },
  list(b) {
    const box = el('div', 'vn-list vn-wide');
    for (const it of b.items || []) {
      box.innerHTML += `<div class="vn-row"><p class="vn-row__term vn-mc">${inline(it.term)}</p><p class="vn-row__text">${inline(it.text)}</p></div>`;
    }
    return box;
  },
  image(b, base) {
    const fig = el('div', 'vn-figure');
    if (b.src)
      fig.innerHTML = `<img src="${esc(resolve(b.src, base))}" alt="${esc(b.caption || '')}" style="max-height:${+b.h || 420}px">`;
    else
      fig.innerHTML = `<div style="height:${+b.h || 420}px;border:6px dashed #cfc8bc;display:grid;place-items:center;font-size:28px;color:#9a9187">Image</div>`;
    if (b.caption) fig.innerHTML += `<p>${inline(b.caption)}</p>`;
    return fig;
  },
};

/** Everything said on a page, as one line of text (screen readers, link previews, search). */
export function pageText(page, edition) {
  const out = [page.sign];
  if (page.layout === 'cover') out.push(edition?.edition);
  for (const b of page.blocks || []) {
    if (b.text) out.push(b.text);
    for (const c of b.cols || []) out.push(c.lead, c.text);
    for (const it of b.items || []) out.push(it.term ? it.term + ': ' + it.text : it.label);
    if (b.caption) out.push(b.caption);
  }
  return plain(out.filter(Boolean).join(' '));
}

// ---- Pages -------------------------------------------------------------------

function wall(base) {
  const img = el('img', 'vn-wall');
  img.src = resolve('assets/wall.png', base);
  img.alt = '';
  return img;
}

function coverSlide(page, edition, base) {
  const s = el('section', 'vn-slide vn-slide--cover');
  s.append(wall(base), el('div', 'vn-vignette'));
  if (page.host !== false) s.appendChild(coverHost());
  const sign = el('div', 'vn-cover-sign');
  sign.style.backgroundImage = planks(1000, 520, 20, 'cover');
  s.append(sign, el('p', 'vn-cover-title vn-mc', inline(page.sign || 'VILLAGER\nNEWS')));
  const badge = page.badge ?? edition.edition;
  if (badge) s.appendChild(el('p', 'vn-badge vn-mc', inline(badge)));
  return s;
}

function storySlide(page, edition, base) {
  const s = el('section', 'vn-slide vn-slide--story');
  if (page.villager) s.classList.add('vn-slide--villager');
  s.appendChild(wall(base));
  const card = el('div', 'vn-card');
  const body = el('div', 'vn-body');
  (page.blocks || []).forEach((b, i) => {
    const make = BLOCKS[b.type];
    if (!make) return;
    const node = make(b, base);
    node.dataset.block = i;
    body.appendChild(node);
  });
  card.appendChild(body);
  s.appendChild(card);
  if (page.sign) {
    const sign = el('div', 'vn-sign', esc(page.sign));
    sign.dataset.sign = '';
    s.appendChild(sign);
  }
  return s;
}

/** One page as { slide, front }: the slide itself and the villager layer that sits above the news bar. */
export function renderPage(page, edition, { base = '' } = {}) {
  const slide = page.layout === 'cover' ? coverSlide(page, edition, base) : storySlide(page, edition, base);
  slide.dataset.transition = page.transition || 'push';
  slide.setAttribute('aria-label', pageText(page, edition));
  const front = el('div', 'vn-front');
  const v = page.villager;
  if (v && v.src) {
    const img = el('img', 'vn-villager' + (v.flip ? ' flip' : ''));
    img.src = resolve(v.src, base);
    img.alt = '';
    img.style.cssText = `left:${+v.x || 0}px;top:${+v.y || 0}px;width:${+v.w || 440}px`;
    img.draggable = false;
    front.appendChild(img);
  }
  return { slide, front };
}

const ROT = (4 * Math.PI) / 180;

/** Sizes the sign to its text (on the plank grid), tilts it into the top left corner and fits the card under it.
 *  The slide has to be in the page and showing, with the fonts loaded. */
export function layoutSlide(slide) {
  const sign = slide.querySelector('[data-sign]');
  const card = slide.querySelector('.vn-card');
  if (!card) return;
  let bottom = 28;
  if (sign) {
    const m = el('div', 'vn-sign vn-sign--measure', sign.innerHTML);
    slide.appendChild(m);
    const r = m.getBoundingClientRect();
    const k = r.width ? m.offsetWidth / r.width : 1; // undo the stage scale
    const tw = r.width * k;
    const th = r.height * k;
    m.remove();
    const w = Math.max(288, Math.ceil((tw + 72) / 12) * 12);
    const h = Math.max(144, Math.ceil((th + 84) / 48) * 48);
    const bw = w * Math.cos(ROT) + h * Math.sin(ROT);
    const bh = w * Math.sin(ROT) + h * Math.cos(ROT);
    Object.assign(sign.style, {
      width: w + 'px',
      height: h + 'px',
      left: 88 + bw / 2 - w / 2 + 'px',
      top: 28 + bh / 2 - h / 2 + 'px',
      backgroundImage: planks(w, h, 12, sign.textContent),
    });
    bottom = 28 + bh;
  }
  const top = Math.round(sign ? 28 + (bottom - 28) * 0.55 : 120);
  card.style.top = top + 'px';
  card.style.paddingTop = Math.round(sign ? bottom - top + 14 : 56) + 'px';
}

/** True when a story page holds more than fits on its card. */
export function overflows(slide) {
  const card = slide.querySelector('.vn-card');
  const body = slide.querySelector('.vn-body');
  if (!card || !body) return false;
  return body.offsetTop + body.scrollHeight > card.clientHeight - 20;
}

/** The news bar: a red label and the items running past, twice so the loop is seamless. */
export function renderTicker(ticker = {}) {
  const t = el('div', 'vn-ticker');
  const items = (ticker.items || []).map((s) => plain(s)).filter(Boolean);
  const run = items.map((s) => esc(s) + '<i></i>').join('');
  t.innerHTML = `<p class="vn-ticker__lbl vn-mc">${esc(ticker.label || 'Villager News')}</p><div class="vn-ticker__track"><div class="vn-ticker__run vn-mc"><span>${run}</span><span>${run}</span></div></div>`;
  return t;
}

/** Runs the news bar at a steady 90 slide pixels a second, from a random point. */
export function startTicker(t, random = true) {
  const run = t.querySelector('.vn-ticker__run');
  const span = run.firstElementChild;
  const w = span ? span.offsetWidth : 0;
  if (!w) return;
  const d = w / 90;
  run.style.setProperty('--dur', d + 's');
  if (random) run.style.animationDelay = -Math.random() * d + 's';
}

export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('48px Minecraft'),
      document.fonts.load('36px Rubik'),
      document.fonts.load('700 36px Rubik'),
    ]);
  } catch {
    /* draw with fallback fonts */
  }
}

/** Scales a stage to fit inside its box (the window by default). */
export function fit(stage, box = null) {
  const bw = box ? box.clientWidth : innerWidth;
  const bh = box ? box.clientHeight : innerHeight;
  const k = Math.min(bw / W, bh / H);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  return k;
}

/** Loads an edition by its slug from news/editions/. */
export async function loadEdition(slug, base = '') {
  const res = await fetch(`${base}editions/${encodeURIComponent(slug)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No edition called "${slug}"`);
  return res.json();
}

/** The list of editions (news/editions.json, written by tools/build_news.py), newest first. */
export async function loadIndex(base = '') {
  const res = await fetch(`${base}editions.json`, { cache: 'no-cache' });
  if (!res.ok) return [];
  const list = await res.json();
  return list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
