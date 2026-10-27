// One player's page: face, status, a few numbers, when they play, who they play with,
// where their base and shop are, and what they achieved lately. Opened as player/?name=Name.
import { loadStats } from './data.js?v=f15302e2';
import { raceBlock } from './race.js?v=c045db3d';
import { shopIconEl, shopHref, isOpen, ownersOf } from './shops-core.js?v=6be4719b';
import { statTile, hourChart } from './widgets.js?v=d7485e33';
import {
  el,
  svgEl,
  byId,
  url,
  getJSON,
  faceEl,
  playerHref,
  fmtInt,
  fmtHours,
  relTime,
  hourLabel,
  bar,
  lastSeen,
} from './ui.js?v=4d932c1e';

const name = new URLSearchParams(location.search).get('name') || '';

const mapHref = (x, z) => `${url('map/')}?x=${Math.round(x)}&z=${Math.round(z)}&zoom=12`;
const badgeSrc = (badge) => url(`assets/badges/${badge.toLowerCase().replace(/[^a-z]+/g, '-')}.svg`);

const pinIcon = () =>
  svgEl(
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svgEl('path', { d: 'M12 22C12 22 4.5 14.5 4.5 9.5a7.5 7.5 0 0 1 15 0C19.5 14.5 12 22 12 22Z' }),
    svgEl('circle', { cx: 12, cy: 9.5, r: 2.5 }),
  );

/** The middle of an outline's bounding box. */
function middle(points) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

function missing(page) {
  document.title = 'Player not found · Voxel';
  page.replaceChildren(
    el(
      'div',
      { class: 'page-head' },
      el('h1', {}, 'No player by that name'),
      el(
        'p',
        { class: 'small' },
        name ? `We have not seen ${name} on the server.` : 'Pick someone from the list.',
      ),
    ),
    el('a', { class: 'btn', href: url('players/') }, 'See all players'),
  );
}

function hero(st, p) {
  const status = [`Last seen ${lastSeen(p.lastEnd)}`];
  if (st.meta && st.meta.generated_at) status.push(`stats updated ${relTime(st.meta.generated_at)}`);
  const badges = p.badges.map((b) =>
    el(
      'span',
      { class: 'badge' },
      el('span', { class: 'badge__icon' }, el('img', { src: badgeSrc(b), alt: '' })),
      b,
    ),
  );
  return el(
    'section',
    { class: 'page-head' },
    el('a', { class: 'back', href: url('players/') }, '← All players'),
    el(
      'div',
      { class: 'phero' },
      el('span', { class: 'pface' }, faceEl(p.name, 'xl')),
      el(
        'div',
        { class: 'phero__who' },
        el('h1', {}, p.name),
        el('p', { class: 'small' }, status.join(' · ')),
      ),
    ),
    badges.length ? el('div', { class: 'badges' }, badges) : null,
  );
}

/** Time online: the logged time split into active, AFK and admin work. */
function timeOnline(p) {
  const parts = [
    ['active', 'Active', p.minutes],
    ['afk', 'AFK', p.afkMin],
    ['admin', 'Admin', p.adminMin],
  ].filter(([, , minutes]) => minutes > 0);
  // Rounded widths that always add up to 100: the last part takes what is left.
  let remaining = 100;
  const widths = parts.map(([, , minutes], i) => {
    const w = i === parts.length - 1 ? remaining : Math.round((minutes / p.loggedMin) * 100);
    remaining -= w;
    return w;
  });
  const summary = parts.map(([, label, minutes]) => `${label} ${fmtHours(minutes / 60)}`).join(', ');
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'label' }, 'Time online'),
    el(
      'div',
      { class: 'tbar', role: 'img', 'aria-label': summary },
      bar(parts.map(([key], i) => [widths[i], `tbar__seg--${key}`])),
    ),
    el(
      'ul',
      { class: 'tlegend' },
      parts.map(([key, label, minutes]) =>
        el(
          'li',
          {},
          el('i', { class: `tbar__seg--${key}` }),
          el('span', {}, label),
          el('span', { class: 'tlegend__value' }, fmtHours(minutes / 60)),
        ),
      ),
    ),
  );
}

/** Places: the borders this player owns, and their shops. */
function placesCard(places) {
  const row = (place) => {
    const isShop = place.kind === 'shop';
    const hasProducts = isShop && isOpen(place.shop) && (place.shop.products || []).length > 0;
    return el(
      'li',
      { class: 'place' },
      el('span', { class: 'place__icon' }, isShop ? shopIconEl(place.shop) : pinIcon()),
      el(
        'div',
        {},
        el('strong', {}, place.label),
        el(
          'p',
          { class: 'small' },
          `${isShop ? 'Shop' : 'Base'}, X ${Math.round(place.x)}, Z ${Math.round(place.z)}`,
        ),
      ),
      el(
        'span',
        { class: 'place__links' },
        hasProducts ? el('a', { href: shopHref(place.shop) }, 'Products') : null,
        el('a', { href: place.href }, 'On the map'),
      ),
    );
  };
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'label' }, 'Places'),
    el('ul', { class: 'places' }, places.map(row)),
  );
}

/** Plays with: each bar is that partner's share of this player's time. */
function playsWith(p) {
  const withOthers = Math.round(p.togetherShare * 100);
  const split = `${withOthers}% with others, ${100 - withOthers}% on their own`;
  const buddy = (b) =>
    el(
      'li',
      {},
      el(
        'a',
        { class: 'brow', href: playerHref(b.name) },
        faceEl(b.name),
        el(
          'span',
          { class: 'pcard__body' },
          el(
            'span',
            { class: 'pcard__top' },
            el('span', { class: 'pcard__name' }, b.name),
            el('span', { class: 'pcard__value' }, fmtHours(b.hours)),
          ),
          el('span', { class: 'pbar', 'aria-hidden': 'true' }, bar(b.share)),
          el('span', { class: 'small' }, `${b.share}% of their time`),
        ),
      ),
    );
  return el(
    'div',
    { class: 'card' },
    el('p', { class: 'label' }, 'Plays with'),
    el('div', { class: 'split', role: 'img', 'aria-label': `${split}.` }, bar(withOthers)),
    el('p', { class: 'small split__caption' }, split),
    el('ul', { class: 'arows' }, p.buddies.map(buddy)),
  );
}

/** Advancements: the points, the rarest one, the race against the leaders and the latest few. */
function advancements(st, p) {
  const count = `points from ${p.advCount} ${p.advCount === 1 ? 'advancement' : 'advancements'}`;
  const latest = (a) =>
    el(
      'li',
      { class: 'arow' },
      el(
        'div',
        { class: 'arow__name' },
        a.name,
        el('p', { class: 'small' }, a.earners === 1 ? 'Only they have it' : `${a.earners} players have it`),
      ),
      el('span', { class: 'small' }, `+${a.points} · ${relTime(a.at)}`),
    );
  // Full width under the other cards: the numbers and latest on one side, the race chart on the other.
  return el(
    'div',
    { class: 'card adv-card' },
    el(
      'div',
      {},
      el('p', { class: 'label' }, 'Advancements'),
      el(
        'div',
        { class: 'adv-head' },
        el('span', { class: 'num' }, fmtInt(p.advPoints)),
        el('span', { class: 'small' }, count),
      ),
      p.rarest ? el('p', { class: 'small mt-1' }, `Rarest: ${p.rarest}`) : null,
      el('p', { class: 'label mt-4' }, 'Latest'),
      el('ul', { class: 'arows mt-1' }, p.latestAdv.map(latest)),
    ),
    el('div', {}, ...raceBlock(st, { focus: p.name, heading: 'Compared with the leaders' })),
  );
}

function render(st, places) {
  const page = byId('page');
  const p = st.players[name];
  if (!p) return missing(page);
  document.title = `${p.name} · Voxel`;

  const cause = p.topCause ? `mostly ${p.topCause.toLowerCase()}` : null;
  const tiles = el(
    'div',
    { class: 'tiles tiles--2' },
    statTile(fmtHours(p.minutes / 60), 'played', `#${p.rank} of ${Object.keys(st.players).length}`),
    statTile(fmtInt(p.deaths), p.deaths === 1 ? 'death' : 'deaths', cause),
  );

  // Two columns on a wide screen, one below the other on a phone; advancements across the full width below.
  // Plays with is the tallest card, so it gets a column to itself; without it, places takes that column.
  const left = [];
  const right = [];
  if (p.favHour != null) {
    left.push(
      hourChart({
        byHour: p.byHour,
        byWeekHour: p.byWeekHour,
        heading: 'When they play',
        caption: `Usually around ${hourLabel(p.favHour)}, Dutch time.`,
      }),
    );
  }
  if (p.loggedMin > 0) left.push(timeOnline(p));
  if (p.buddies.length) right.push(playsWith(p));
  if (places.length) (right.length ? left : right).push(placesCard(places));

  page.replaceChildren(
    hero(st, p),
    tiles,
    el('div', { class: 'pgrid' }, el('div', { class: 'pcol' }, left), el('div', { class: 'pcol' }, right)),
    p.latestAdv.length ? advancements(st, p) : null,
  );
}

async function placesFor(player) {
  const [borders, shops] = await Promise.all([getJSON('borders.json', []), getJSON('shops.json', [])]);
  const out = [];
  for (const b of borders) {
    if ((b.owners || []).includes(player) && b.points?.length) {
      out.push({ kind: 'base', label: b.label || 'Base', ...middle(b.points) });
    }
  }
  for (const s of shops) {
    if (ownersOf(s).includes(player))
      out.push({ kind: 'shop', label: s.label || 'Shop', x: s.x, z: s.z, shop: s });
  }
  for (const o of out) o.href = mapHref(o.x, o.z);
  return out;
}

Promise.all([loadStats(), placesFor(name)])
  .then(([st, places]) => render(st, places))
  .catch((e) => {
    console.error(e);
    byId('page').replaceChildren(
      el('p', { class: 'small pad-block-5' }, "This page couldn't load. Try again in a moment."),
    );
  });
