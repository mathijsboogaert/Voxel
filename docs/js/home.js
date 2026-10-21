// Homepage: hero status, news, map preview, stats overview, player faces.
import { loadStats } from './data.js';
import { el, url, faceEl, playerHref, fmtInt, fmtHours, relTime, fmtDay, hourLabel, widthClass, heightClass } from './ui.js';
import { pattern } from './pattern.js';
import { raceBlock } from './race.js';
import { shopIconEl, shopHref } from './shops-core.js';

const $ = (sel) => document.querySelector(sel);
const DAY = 864e5;

async function getJSON(path, fallback) {
  try { const r = await fetch(url(path), { cache: 'no-cache' }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

$('[data-frieze]').append(pattern(['square', 'disc', 'leaf', 'square', 'cut@90', 'disc@180']));

function renderUpdated(st) {
  const g = st.meta && st.meta.generated_at;
  $('#updated').textContent = g ? `Updated ${relTime(g)}. Numbers refresh from the server every 15 minutes or so.` : '';
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
    card.append(el('div', { class: 'news-featured__who' }, el('span', { class: 'shop-chip' }, shopIconEl(it.shop)),
      el('p', {}, it.player ? [el('strong', {}, it.player), ' opened a shop. '] : 'A new shop is open. ')));
    card.append(el('div', { class: 'hero__cta' }, el('a', { class: 'btn btn--primary', href: shopHref(it.shop) }, 'See what it sells'), el('a', { class: 'btn', href: findHref(it.title) }, 'Find it on the map')));
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
    ? el('span', { class: 'shop-chip' }, shopIconEl(it.shop))
    : it.player ? faceEl(it.player) : el('span', { class: 'shop-chip', 'aria-hidden': 'true' });
  const title = it.kind === 'achievement' ? `${it.player} ${it.verb}: ${it.title}` : it.title;
  const meta = it.kind === 'event' ? whenText(it.at) : `${KINDS[it.kind].label}, ${relTime(it.at)}`;
  const titleEl = it.kind === 'shop' ? el('a', { href: shopHref(it.shop) }, title) : title;
  return el('li', { class: 'news-item' }, visual, el('div', { class: 'news-item__body' }, el('p', { class: 'news-item__title' }, titleEl), el('p', { class: 'small' }, meta)));
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
        el('span', { class: 'row__bar', 'aria-hidden': 'true' }, el('i', { class: widthClass(Math.max(3, (r.value / max) * 100)) })))))),
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
      st.byHourAll.map((m, h) => el('i', { class: (h === top ? 'top ' : '') + heightClass(Math.max(3, (m / max) * 100)), title: hourLabel(h) }))),
    el('div', { class: 'rhythm-axis small', 'aria-hidden': 'true' }, ['00', '06', '12', '18', '24'].map((t) => el('span', {}, t))),
    el('p', { class: 'small mt-2' }, `Dutch time. Most online at once: ${o.peakPlayers}${o.peakAt ? ', ' + fmtDay(o.peakAt) : ''}.`));

  $('#stats-body').replaceChildren(tiles, el('div', { class: 'stats-grid mt-3' }, boardCard, rhythm));
}

/* ---- Players -------------------------------------------------------------------- */
function renderPlayers(st) {
  const list = st.roster_sorted;
  $('#players-grid').replaceChildren(...list.slice(0, 12).map((p) =>
    el('li', {}, el('a', { class: 'pcell', href: playerHref(p.name) },
      el('span', { class: 'pface' }, faceEl(p.name, 'lg')),
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
      const { map, tiles } = await createWorldMap(holder, { interactive: false, labels: false, center: { x: 40, z: 120 }, zoom: 10.5, shopSize: 24 });
      if (tiles) tiles.once('load', () => { loading.hidden = true; }); else loading.hidden = true;
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
