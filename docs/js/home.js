// Homepage: news, map preview, stats overview and who knows who.
import { loadStats } from './data.js?v=f15302e2';
import {
  el,
  byId,
  url,
  faceEl,
  playerHref,
  fmtInt,
  fmtHours,
  relTime,
  fmtDay,
  hourLabel,
  bar,
  getJSON,
  loadLeaflet,
  barLength,
  findOnMapHref,
  DAY,
} from './ui.js?v=4d932c1e';
import { pattern } from './pattern.js?v=9f404389';
import { shopIconEl, shopHref, isOpen, ownersOf } from './shops-core.js?v=6be4719b';
import { raceBlock } from './race.js?v=c045db3d';
import { mountFriends } from './friends.js?v=0798e1ae';
import { statTile, hourChart, chipRow } from './widgets.js?v=d7485e33';

document
  .querySelector('[data-frieze]')
  .append(pattern(['square', 'disc', 'leaf', 'square', 'cut@90', 'disc@180']));

function renderUpdated(st) {
  const generated = st.meta && st.meta.generated_at;
  byId('updated').textContent = generated
    ? `Updated ${relTime(generated)}. Numbers refresh from the server every 15 minutes or so.`
    : '';
}

/* ---- News ------------------------------------------------------------------------ */

const KINDS = {
  achievement: { label: 'Achievement', cls: 'tag--orange' },
  shop: { label: 'New shop', cls: 'tag--teal' },
  event: { label: 'Event', cls: 'tag--amber' },
  note: { label: 'News', cls: '' },
};
// How long things stay news.
const ADVANCEMENT_NEWS_DAYS = 30;
const SHOP_NEWS_DAYS = 21;

/** "A", "A and B", "A, B and C". */
const namesText = (names) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';

/** Everything that could be news: hand-written items (news.json), big advancements and new shops. */
async function buildNews(st) {
  const [manual, shops] = await Promise.all([getJSON('news.json', { items: [] }), getJSON('shops.json', [])]);
  const now = Date.now();
  const items = [];

  for (const m of manual.items || []) {
    const at = Date.parse(m.at || m.date || '') || now;
    if (m.type === 'event' && at < now - DAY) continue; // an event that ended yesterday is no longer news
    items.push({
      kind: KINDS[m.type] ? m.type : 'note',
      title: m.title,
      body: m.body,
      at,
      pin: !!m.pin,
      link: m.link,
      player: m.player,
    });
  }

  for (const a of st.big.slice(0, 6)) {
    const at = Date.parse(a.at);
    if (now - at > ADVANCEMENT_NEWS_DAYS * DAY) continue;
    items.push({
      kind: 'achievement',
      title: a.name,
      at,
      player: a.player,
      verb: a.type === 'goal' ? 'reached the goal' : 'completed the challenge',
      earners: a.earners,
    });
  }

  for (const s of shops.filter(isOpen)) {
    const at = Date.parse(s.added || '');
    if (at && now - at < SHOP_NEWS_DAYS * DAY)
      items.push({ kind: 'shop', title: s.label, at, player: namesText(ownersOf(s)), shop: s });
  }
  return items;
}

/** The featured item (pinned, else the next event, else the newest) and the three newest after it. */
function pickNews(items) {
  const now = Date.now();
  const upcoming = items.filter((i) => i.kind === 'event' && i.at > now).sort((a, b) => a.at - b.at);
  const newestFirst = [...items].sort((a, b) => b.at - a.at);
  const featured = items.find((i) => i.pin) || upcoming[0] || newestFirst[0];
  const rest = newestFirst.filter((i) => i !== featured && !(i.kind === 'event' && i.at < now)).slice(0, 3);
  return { featured, rest };
}

let countdownTimer = null;
function countdown(at) {
  const cells = ['days', 'hours', 'minutes', 'seconds'].map((unit) =>
    el('div', {}, el('span', { class: 'num' }, '00'), el('span', { class: 'label' }, unit)),
  );
  const tick = () => {
    const s = Math.max(0, Math.floor((at - Date.now()) / 1000));
    const parts = [
      Math.floor(s / 86400),
      Math.floor((s % 86400) / 3600),
      Math.floor((s % 3600) / 60),
      s % 60,
    ];
    parts.forEach((n, i) => {
      cells[i].firstChild.textContent = String(n).padStart(2, '0');
    });
  };
  tick();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
  return el('div', { class: 'countdown', role: 'timer' }, cells);
}

const whenFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});
const whenText = (at) => `${whenFormat.format(at)} (Dutch time)`;

/** Buttons under a news item, side by side; the first is the main one. */
const actions = (...links) =>
  el(
    'div',
    { class: 'actions' },
    links
      .filter(Boolean)
      .map(([href, text], i) => el('a', { class: i ? 'btn' : 'btn btn--primary', href }, text)),
  );

function featuredCard(it) {
  const kind = KINDS[it.kind];
  const card = el(
    'article',
    { class: 'card card--leaf news-featured' },
    el(
      'div',
      { class: 'news-featured__top' },
      el('span', { class: `tag ${kind.cls}` }, kind.label),
      el('span', { class: 'small' }, it.kind === 'event' ? '' : relTime(it.at)),
    ),
    el('h3', { class: 'headline' }, it.title),
  );

  if (it.kind === 'achievement') {
    const others = it.earners === 1 ? 'Nobody else has this one yet.' : `${it.earners} players have it.`;
    card.append(
      el(
        'div',
        { class: 'news-featured__who' },
        faceEl(it.player, 'lg'),
        el('p', {}, el('strong', {}, it.player), ` ${it.verb}. `, el('span', { class: 'small' }, others)),
      ),
    );
  } else if (it.kind === 'shop') {
    const hasProducts = (it.shop.products || []).length > 0;
    card.append(
      el(
        'div',
        { class: 'news-featured__who' },
        el('span', { class: 'shop-chip' }, shopIconEl(it.shop)),
        el('p', {}, it.player ? [el('strong', {}, it.player), ' opened a shop.'] : 'A new shop is open.'),
      ),
      actions(hasProducts && [shopHref(it.shop), 'What it sells'], [
        findOnMapHref(it.title),
        'Find it on the map',
      ]),
    );
  } else if (it.kind === 'event') {
    if (it.body) card.append(el('p', {}, it.body));
    card.append(countdown(it.at), el('p', { class: 'small' }, whenText(it.at)));
    if (it.link) card.append(actions([it.link, 'Details']));
  } else {
    if (it.body) card.append(el('p', {}, it.body));
    if (it.link) card.append(actions([it.link, 'Read more']));
  }
  return card;
}

function listItem(it) {
  let visual;
  if (it.kind === 'shop') visual = el('span', { class: 'shop-chip' }, shopIconEl(it.shop));
  else if (it.player) visual = faceEl(it.player);
  else visual = el('span', { class: 'shop-chip', 'aria-hidden': 'true' });

  const title = it.kind === 'achievement' ? `${it.player} ${it.verb}: ${it.title}` : it.title;
  const meta = it.kind === 'event' ? whenText(it.at) : `${KINDS[it.kind].label}, ${relTime(it.at)}`;
  return el(
    'li',
    { class: 'news-item' },
    visual,
    el(
      'div',
      { class: 'news-item__body' },
      el(
        'p',
        { class: 'news-item__title' },
        it.kind === 'shop' ? el('a', { href: shopHref(it.shop) }, title) : title,
      ),
      el('p', { class: 'small' }, meta),
    ),
  );
}

async function renderNews(st) {
  const items = await buildNews(st);
  if (!items.length) return;
  const { featured, rest } = pickNews(items);
  const body = byId('news-body');
  body.replaceChildren(featuredCard(featured));
  if (rest.length) body.append(el('ul', { class: 'news-list' }, rest.map(listItem)));
  byId('news').hidden = false;
}

/* ---- Stats overview ----------------------------------------------------------------- */

const BOARDS = {
  playtime: { label: 'Playtime', caption: 'Hours played since launch', show: (v) => fmtHours(v) },
  deaths: { label: 'Deaths', caption: 'Deaths since launch', show: (v) => fmtInt(v) },
  advancements: {
    label: 'Advancements',
    caption: 'Advancement points: task 1, goal 3, challenge 5',
    show: (v) => `${fmtInt(v)} pts`,
  },
  chat: { label: 'Chat', caption: 'Chat messages sent', show: (v) => fmtInt(v) },
};
let boardKey = 'playtime';

function boardRow(board, row, rank, max) {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'row', href: playerHref(row.name) },
      el('span', { class: 'row__rank' }, rank),
      faceEl(row.name),
      el('span', { class: 'row__name' }, row.name),
      el('span', { class: 'row__value' }, board.show(row.value)),
      el('span', { class: 'row__bar', 'aria-hidden': 'true' }, bar(barLength(row.value, max))),
    ),
  );
}

function renderBoard(st, holder) {
  const board = BOARDS[boardKey];
  const rows = st.boards[boardKey].slice(0, 5);
  const max = rows[0] ? rows[0].value : 1;
  const tabs = chipRow({
    options: Object.entries(BOARDS).map(([key, b]) => [key, b.label]),
    value: boardKey,
    label: 'Leaderboard',
    panel: 'board-panel',
    onPick: (key) => {
      boardKey = key;
      renderBoard(st, holder);
      holder.querySelector('[aria-selected="true"]').focus();
    },
  });
  holder.replaceChildren(
    tabs,
    el('p', { class: 'label' }, board.caption),
    el(
      'ul',
      { class: 'rows', id: 'board-panel', role: 'tabpanel', 'aria-label': board.label },
      rows.map((r, i) => boardRow(board, r, i + 1, max)),
    ),
    ...(boardKey === 'advancements' ? raceBlock(st) : []),
    el(
      'p',
      { class: 'card__foot' },
      el('a', { href: url('players/') }, `See all ${st.overview.playerCount} players`),
    ),
  );
}

function renderStats(st) {
  const o = st.overview;
  const delta =
    o.changePct == null ? null : `${o.changePct > 0 ? '+' : ''}${o.changePct}% on the week before`;
  const tiles = el(
    'div',
    { class: 'tiles' },
    statTile(`${fmtInt(o.totalHours)} h`, 'played since launch'),
    statTile(fmtInt(o.playerCount), 'players so far'),
    statTile(`${o.last7Avg} h`, 'per day this week', delta && el('p', { class: 'small tile__delta' }, delta)),
    statTile(hourLabel(o.busiestHour), 'busiest hour'),
  );

  const boardCard = el('div', { class: 'card' });
  renderBoard(st, boardCard);

  const peak = `${o.peakPlayers}${o.peakAt ? ', ' + fmtDay(o.peakAt) : ''}`;
  const hours = hourChart({
    byHour: st.byHourAll,
    byWeekHour: st.byWeekHourAll,
    heading: 'When people play',
    caption: `Dutch time. Most online at once: ${peak}.`,
  });

  byId('stats-body').replaceChildren(tiles, el('div', { class: 'stats-grid' }, boardCard, hours));
}

/* ---- Players ---------------------------------------------------------------------- */

function renderPlayers(st) {
  byId('players-all').textContent = `All ${st.recent.length} players`;
}

/* ---- Map preview ------------------------------------------------------------------- */

// The preview starts loading this far before it scrolls into view, and stops waiting for slow tiles after a while.
const PREVIEW_MARGIN_PX = 300;
const PREVIEW_WAIT_MS = 8000;

/** The map preview loads only once it scrolls near the screen, so it never slows the top of the page. */
function initPreview() {
  const holder = byId('preview-map');
  const loading = byId('preview-loading');
  let started = false;

  const start = async () => {
    if (started) return;
    started = true;
    try {
      await loadLeaflet();
      const { createWorldMap } = await import('./map-core.js?v=6a906fb8');
      const { map, tiles } = await createWorldMap(holder, {
        interactive: false,
        labels: false,
        center: { x: 40, z: 120 },
        zoom: 10.5,
        shopSize: 24,
      });
      if (!tiles) throw new Error('tiles/manifest.json did not load');
      // The tiles may have finished before this point, so check before waiting for them.
      if (tiles && tiles.isLoading()) tiles.once('load', () => (loading.hidden = true));
      else loading.hidden = true;
      setTimeout(() => (loading.hidden = true), PREVIEW_WAIT_MS); // don't wait forever on a slow tile
      new ResizeObserver(() => map.invalidateSize()).observe(holder);
    } catch (e) {
      console.error(e);
      loading.textContent = 'The preview could not load. Open the full map instead.';
    }
  };

  if (!('IntersectionObserver' in window)) return start();
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((x) => x.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { rootMargin: `${PREVIEW_MARGIN_PX}px` },
  );
  observer.observe(holder);
  // Observers only report once the page paints; if the preview is already close, don't wait for that.
  setTimeout(() => {
    const r = holder.getBoundingClientRect();
    if (r.top < innerHeight + PREVIEW_MARGIN_PX && r.bottom > -PREVIEW_MARGIN_PX) start();
  }, 1200);
}

/* ---- Go ------------------------------------------------------------------------------ */

async function render(st) {
  renderUpdated(st);
  renderStats(st);
  renderPlayers(st);
  await renderNews(st);
}

initPreview();
mountFriends();
loadStats()
  .then(render)
  .catch((e) => {
    console.error(e);
    byId('stats-body').replaceChildren(el('p', {}, "The numbers couldn't load. Try again in a moment."));
  });

// Keep an open tab fresh: the data every 5 minutes, the "updated" line every minute.
setInterval(
  () =>
    loadStats(true)
      .then(render)
      .catch(() => {}),
  5 * 60 * 1000,
);
setInterval(
  () =>
    loadStats()
      .then(renderUpdated)
      .catch(() => {}),
  60 * 1000,
);
