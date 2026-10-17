// Homepage: hero status, news, map preview, stats overview, player faces.
import { loadStats } from './data.js';
import { el, url, faceEl, playerHref, fmtInt, fmtHours, relTime, fmtDay, hourLabel } from './ui.js';
import { pattern } from './pattern.js';

const $ = (sel) => document.querySelector(sel);
const DAY = 864e5;

async function getJSON(path, fallback) {
  try { const r = await fetch(url(path), { cache: 'no-cache' }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

$('[data-frieze]').append(pattern(['square', 'disc', 'leaf', 'square', 'cut@90', 'disc@180']));

/* ---- Hero status -------------------------------------------------------------- */
function renderHero(st) {
  const box = $('#hero-status');
  const on = st.overview.online;
  box.replaceChildren();
  if (on.length) {
    box.append(
      el('div', { class: 'faces' }, on.slice(0, 5).map((n) => faceEl(n, 'sm'))),
      el('p', {}, el('strong', {}, `${on.length} online now`), el('span', { class: 'small' }, ' ' + on.slice(0, 3).join(', ') + (on.length > 3 ? '…' : ''))),
    );
  } else {
    const last = st.roster_sorted[0];
    box.append(el('p', {}, el('strong', {}, 'Quiet right now'), last ? el('span', { class: 'small' }, ` Last seen: ${last.name}, ${relTime(last.lastEnd)}`) : ''));
  }
}

function renderUpdated(st) {
  const g = st.meta && st.meta.generated_at;
  $('#updated').textContent = g ? `Updated ${relTime(g)}. Numbers refresh from the server every hour.` : '';
}

/* ---- News --------------------------------------------------------------------- */
const KINDS = {
  achievement: { label: 'Achievement', cls: 'tag--orange' },
  shop: { label: 'New shop', cls: 'tag--teal' },
  event: { label: 'Event', cls: 'tag--amber' },
  note: { label: 'News', cls: '' },
};

async function buildNews(st) {
  const [manual, shops] = await Promise.all([getJSON('news.json', { items: [] }), getJSON('shops.json', [])]);
  const now = Date.now();
  const items = [];
  for (const m of manual.items || []) {
    const at = Date.parse(m.at || m.date || '') || now;
    if (m.type === 'event' && at < now - DAY) continue; // an event that ended yesterday is no longer news
    items.push({ kind: KINDS[m.type] ? m.type : 'note', title: m.title, body: m.body, at, pin: !!m.pin, link: m.link, player: m.player });
  }
  for (const a of st.big.slice(0, 6)) {
    const at = Date.parse(a.at);
    if (now - at < 30 * DAY) items.push({ kind: 'achievement', title: a.name, at, player: a.player, verb: a.type === 'goal' ? 'reached the goal' : 'completed the challenge', earners: a.earners });
  }
  for (const s of shops) {
    const at = Date.parse(s.added || '');
    if (at && now - at < 21 * DAY) items.push({ kind: 'shop', title: s.label, at, player: s.owner, shop: s });
  }
  return items;
}

function pickNews(items) {
  const now = Date.now();
  const upcoming = items.filter((i) => i.kind === 'event' && i.at > now).sort((a, b) => a.at - b.at);
  const featured = items.find((i) => i.pin) || upcoming[0] || [...items].sort((a, b) => b.at - a.at)[0];
  const rest = items.filter((i) => i !== featured && !(i.kind === 'event' && i.at < now)).sort((a, b) => b.at - a.at).slice(0, 3);
  return { featured, rest };
}

let countdownTimer = null;
function countdown(at) {
  const cells = ['days', 'hours', 'minutes', 'seconds'].map((u) => el('div', {}, el('span', { class: 'num' }, '00'), el('span', { class: 'label' }, u)));
  const wrap = el('div', { class: 'countdown', role: 'timer' }, cells);
  const tick = () => {
    const s = Math.max(0, Math.floor((at - Date.now()) / 1000));
    [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
      .forEach((n, i) => { cells[i].firstChild.textContent = String(n).padStart(2, '0'); });
  };
  tick();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
  return wrap;
}

const whenText = (at) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(at) + ' (Dutch time)';
const findHref = (label) => url('map/') + '?find=' + encodeURIComponent(label);

function featuredCard(it) {
  const k = KINDS[it.kind];
  const card = el('article', { class: 'card card--leaf news-featured' });
  card.append(el('div', { class: 'news-featured__top' }, el('span', { class: `tag ${k.cls}` }, k.label), el('span', { class: 'small' }, it.kind === 'event' ? '' : relTime(it.at))));
  card.append(el('h3', { class: 'headline' }, it.title));
  if (it.kind === 'achievement') {
    card.append(el('div', { class: 'news-featured__who' }, faceEl(it.player, 'lg'),
      el('p', {}, el('strong', {}, it.player), ` ${it.verb}. `, el('span', { class: 'small' }, it.earners === 1 ? 'Nobody else has this one yet.' : `${it.earners} players have it.`))));
  } else if (it.kind === 'shop') {
    card.append(el('div', { class: 'news-featured__who' }, el('span', { class: 'shop-chip' }, el('img', { src: url('assets/shop-icon.png'), alt: '' })),
      el('p', {}, it.player ? [el('strong', {}, it.player), ' opened a shop. '] : 'A new shop is open. ')));
    card.append(el('a', { class: 'btn', href: findHref(it.title) }, 'Find it on the map'));
  } else if (it.kind === 'event') {
    if (it.body) card.append(el('p', {}, it.body));
    card.append(countdown(it.at), el('p', { class: 'small' }, whenText(it.at)));
    if (it.link) card.append(el('a', { class: 'btn', href: it.link }, 'Details'));
  } else {
    if (it.body) card.append(el('p', {}, it.body));
    if (it.link) card.append(el('a', { class: 'btn', href: it.link }, 'Read more'));
  }
  return card;
}

function listItem(it) {
  const visual = it.kind === 'shop'
    ? el('span', { class: 'shop-chip' }, el('img', { src: url('assets/shop-icon.png'), alt: '' }))
    : it.player ? faceEl(it.player) : el('span', { class: 'shop-chip', 'aria-hidden': 'true' });
  const title = it.kind === 'achievement' ? `${it.player} ${it.verb}: ${it.title}` : it.title;
  const meta = it.kind === 'event' ? whenText(it.at) : `${KINDS[it.kind].label}, ${relTime(it.at)}`;
  return el('li', { class: 'news-item' }, visual, el('div', { class: 'news-item__body' }, el('p', { class: 'news-item__title' }, title), el('p', { class: 'small' }, meta)));
}

async function renderNews(st) {
  const items = await buildNews(st);
  if (!items.length) return;
  const { featured, rest } = pickNews(items);
  const body = $('#news-body');
  body.replaceChildren(featuredCard(featured));
  if (rest.length) body.append(el('ul', { class: 'news-list' }, rest.map(listItem)));
  $('#news').hidden = false;
}

/* ---- Stats overview ------------------------------------------------------------- */
const BOARDS = {
  playtime: { label: 'Playtime', caption: 'Hours played since launch', show: (v) => fmtHours(v) },
  deaths: { label: 'Deaths', caption: 'Deaths since launch', show: (v) => fmtInt(v) },
  advancements: { label: 'Advancements', caption: 'Advancement points: task 1, goal 3, challenge 5', show: (v) => `${fmtInt(v)} pts` },
  chat: { label: 'Chat', caption: 'Chat messages sent', show: (v) => fmtInt(v) },
};
let boardKey = 'playtime';

function tile(num, label, extra) {
  return el('div', { class: 'card tile' }, el('span', { class: 'num' }, num), el('p', { class: 'small' }, label), extra);
}

/* The advancement race: running points per player, a step at every advancement. Five players, told
   apart by colour and by line pattern (so it doesn't rely on hue alone), with a legend underneath. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const RACE_STYLES = [
  { color: 'var(--teal-text)', dash: '' },
  { color: 'var(--rust)', dash: '' },
  { color: 'var(--ink)', dash: '' },
  { color: 'var(--teal)', dash: '8 4' },
  { color: 'var(--ink-muted)', dash: '2 4' },
];
const dayLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' });

function niceStep(max) {
  const raw = max / 3, pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}

function raceChart(st) {
  const { start, end, series } = st.race;
  if (!series.length) return null;
  const W = 320, H = 200, L = 34, R = 8, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const span = Math.max(end - start, DAY);
  const step = niceStep(series[0].total), yMax = Math.ceil(series[0].total / step) * step;
  const x = (t) => (L + ((Math.min(t, end) - start) / span) * pw).toFixed(1);
  const y = (v) => (T + ph - (v / yMax) * ph).toFixed(1);

  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'race', role: 'img',
    'aria-label': `Advancement points over time. ${series.map((s) => `${s.name} ${s.total}`).join(', ')}.` });
  for (let v = 0; v <= yMax; v += step) {
    svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'race__grid' }));
    const t = sv('text', { x: L - 6, y: Number(y(v)) + 4, 'text-anchor': 'end' }); t.textContent = v; svg.append(t);
  }
  const every = (span > 12 * DAY ? 7 : 2) * DAY;
  for (let t = start; t <= end; t += every) {
    const label = sv('text', { x: x(t), y: H - 8, 'text-anchor': t === start ? 'start' : 'middle' });
    label.textContent = dayLabel.format(t); svg.append(label);
  }
  // Lowest-ranked first, so the leader is drawn on top.
  series.map((s, i) => ({ s, i })).reverse().forEach(({ s, i }) => {
    let d = `M${x(start)} ${y(0)}`;
    for (const p of s.steps) d += ` H${x(p.t)} V${y(p.v)}`;
    d += ` H${x(end)}`;
    svg.append(sv('path', { d, fill: 'none', style: `stroke:${RACE_STYLES[i].color};stroke-width:2.5;stroke-linejoin:miter;stroke-dasharray:${RACE_STYLES[i].dash || 'none'}` }));
  });
  return svg;
}

function raceBlock(st) {
  const chart = raceChart(st);
  if (!chart) return [];
  const sample = (i) => { const s = sv('svg', { viewBox: '0 0 28 8', class: 'race-swatch', 'aria-hidden': 'true' });
    s.append(sv('path', { d: 'M0 4H28', style: `stroke:${RACE_STYLES[i].color};stroke-width:3;stroke-dasharray:${RACE_STYLES[i].dash || 'none'}` })); return s; };
  return [
    el('p', { class: 'label', style: 'margin-top:24px' }, 'Advancement race'),
    chart,
    el('ul', { class: 'race-legend' }, st.race.series.map((s, i) =>
      el('li', {}, sample(i), faceEl(s.name, 'sm'), el('span', { class: 'race-legend__name' }, s.name), el('span', { class: 'small' }, `${fmtInt(s.total)} pts`)))),
  ];
}

function renderBoard(st, holder) {
  const b = BOARDS[boardKey];
  const rows = st.boards[boardKey].slice(0, 5);
  const max = rows[0] ? rows[0].value : 1;
  holder.replaceChildren(
    el('div', { class: 'chips', role: 'tablist', 'aria-label': 'Leaderboard' }, Object.entries(BOARDS).map(([key, v]) =>
      el('button', { class: 'chip', role: 'tab', 'aria-selected': String(key === boardKey), onclick: () => { boardKey = key; renderBoard(st, holder); } }, v.label))),
    el('p', { class: 'label' }, b.caption),
    el('ul', { class: 'rows', role: 'tabpanel' }, rows.map((r, i) =>
      el('li', {}, el('a', { class: 'row', href: playerHref(r.name) },
        el('span', { class: 'row__rank' }, i + 1), faceEl(r.name),
        el('span', { class: 'row__name' }, r.name), el('span', { class: 'row__value' }, b.show(r.value)),
        el('span', { class: 'row__bar', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.max(3, (r.value / max) * 100)}%` })))))),
    ...(boardKey === 'advancements' ? raceBlock(st) : []),
    el('p', { class: 'card__foot' }, el('a', { href: url('players/') }, `See all ${st.overview.playerCount} players`)),
  );
}

function renderStats(st) {
  const o = st.overview;
  const delta = o.changePct == null ? null : `${o.changePct > 0 ? '+' : ''}${o.changePct}% on the week before`;
  const tiles = el('div', { class: 'tiles' },
    tile(`${fmtInt(o.totalHours)} h`, 'played since launch'),
    tile(fmtInt(o.playerCount), 'players so far'),
    tile(`${o.last7Avg} h`, 'per day this week', delta ? el('p', { class: 'small tile__delta' }, delta) : null),
    tile(hourLabel(o.busiestHour), 'busiest hour'));

  const boardCard = el('div', { class: 'card' });
  renderBoard(st, boardCard);

  const max = Math.max(...st.byHourAll) || 1;
  const top = st.byHourAll.indexOf(Math.max(...st.byHourAll));
  const rhythm = el('div', { class: 'card' },
    el('p', { class: 'label' }, 'When people play'),
    el('div', { class: 'rhythm', role: 'img', 'aria-label': `Playtime by hour of the day. Busiest around ${hourLabel(top)}.` },
      st.byHourAll.map((m, h) => el('i', { class: h === top ? 'top' : '', style: `height:${Math.max(3, (m / max) * 100)}%`, title: hourLabel(h) }))),
    el('div', { class: 'rhythm-axis small', 'aria-hidden': 'true' }, ['00', '06', '12', '18', '24'].map((t) => el('span', {}, t))),
    el('p', { class: 'small', style: 'margin-top:8px' }, `Dutch time. Most online at once: ${o.peakPlayers}${o.peakAt ? ', ' + fmtDay(o.peakAt) : ''}.`));

  $('#stats-body').replaceChildren(tiles, el('div', { class: 'stats-grid', style: 'margin-top:16px' }, boardCard, rhythm));
}

/* ---- Players -------------------------------------------------------------------- */
function renderPlayers(st) {
  const list = st.roster_sorted;
  $('#players-grid').replaceChildren(...list.slice(0, 12).map((p) =>
    el('li', {}, el('a', { class: 'pcell', href: playerHref(p.name) },
      el('span', { class: 'pface' }, faceEl(p.name, 'lg'), p.online ? el('span', { class: 'dot-online', title: 'Online now' }) : null),
      el('span', { class: 'pcell__name' }, p.name)))));
  $('#players-all').textContent = `All ${list.length} players`;
}

/* ---- Map preview ------------------------------------------------------------------ */
function initPreview() {
  const holder = $('#preview-map'), loading = $('#preview-loading');
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    try {
      const { createWorldMap } = await import('./map-core.js');
      const { map, tiles } = await createWorldMap(holder, { interactive: false, labels: false, center: { x: 40, z: 120 }, zoom: 10.5, workers: 2, shopSize: 24 });
      tiles.once('load', () => { loading.hidden = true; });
      setTimeout(() => { loading.hidden = true; }, 8000);
      new ResizeObserver(() => map.invalidateSize()).observe(holder);
    } catch (e) {
      console.error(e);
      loading.textContent = 'The preview could not load. Open the full map instead.';
    }
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
    io.observe(holder);
    // Observers only report once the page is painting; if it's already near the viewport, don't wait for that.
    setTimeout(() => { const r = holder.getBoundingClientRect(); if (r.top < innerHeight + 300 && r.bottom > -300) start(); }, 1200);
  } else start();
}

/* ---- Go ----------------------------------------------------------------------------- */
async function render(st) {
  renderHero(st);
  renderUpdated(st);
  renderStats(st);
  renderPlayers(st);
  await renderNews(st);
}

initPreview();
loadStats().then(render).catch((e) => {
  console.error(e);
  $('#stats-body').replaceChildren(el('p', {}, "The numbers couldn't load. Try again in a moment."));
});
// Keep an open tab fresh: re-read the data every 5 minutes, and the "updated" text every minute.
setInterval(() => loadStats(true).then(render).catch(() => {}), 5 * 60 * 1000);
setInterval(() => loadStats().then(renderUpdated).catch(() => {}), 60 * 1000);
