// Players list: everyone with a face, the number they're sorted by and when they were last on, plus their badges.
// Sort by playtime, advancements, deaths or badges; filter by name, a badge or an advancement.
// Every choice is kept in the address, so a filtered list can be shared:
//   players/?sort=adv   players/?badge=road_runner   players/?adv=Monsters%20Hunted   players/?q=emrys
import { loadStats } from './data.js?v=f15302e2';
import {
  el,
  byId as $,
  faceEl,
  playerHref,
  fmtHours,
  fmtInt,
  bar,
  barLength,
  lastSeen,
} from './ui.js?v=4d932c1e';
import { chipRow } from './widgets.js?v=d7485e33';
import { TIERS, iconEl, loadBadges } from './badges-core.js?v=dec7bc9f';

const SORTS = [
  ['time', 'Playtime'],
  ['adv', 'Advancements'],
  ['deaths', 'Deaths'],
  ['badges', 'Badges'],
];

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') || '',
  sort: SORTS.some(([k]) => k === params.get('sort')) ? params.get('sort') : 'time',
  badge: params.get('badge') || '',
  adv: params.get('adv') || '',
};

/** Keeps the choices in the address without adding a history step for every keystroke. */
function saveState() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'time') p.set('sort', state.sort);
  if (state.badge) p.set('badge', state.badge);
  if (state.adv) p.set('adv', state.adv);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

/** What a player is sorted by: [number for sorting, how it shows on the card]. */
function metric(p, held) {
  if (state.sort === 'adv') return [p.advPoints, `${fmtInt(p.advPoints)} pts`];
  if (state.sort === 'deaths')
    return [p.deaths, `${fmtInt(p.deaths)} ${p.deaths === 1 ? 'death' : 'deaths'}`];
  if (state.sort === 'badges') {
    const tiers = Object.values(held).reduce((a, b) => a + b, 0);
    return [tiers, `${tiers} ${tiers === 1 ? 'tier' : 'tiers'}`];
  }
  return [p.minutes, fmtHours(p.minutes / 60)];
}

/** The player's badges as small icons, each at their highest tier. */
function badgeIcons(held, badges) {
  const mine = badges.filter((b) => held[b.id]);
  if (!mine.length) return null;
  return el(
    'span',
    { class: 'pcard__badges' },
    mine.map((b) => {
      const t = held[b.id];
      const label = `${b.name}, ${TIERS[t - 1]}`;
      return el(
        'span',
        { class: 'pcard__badge', title: label, 'aria-label': label, role: 'img' },
        iconEl(b.id, t, 'pix'),
      );
    }),
  );
}

function card(p, rank, value, max, held, badges) {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'pcard', href: playerHref(p.name) },
      el('span', { class: 'pface' }, faceEl(p.name, 'lg')),
      el(
        'span',
        { class: 'pcard__body' },
        el(
          'span',
          { class: 'pcard__top' },
          el('span', { class: 'pcard__name' }, `${rank}. ${p.name}`),
          el('span', { class: 'pcard__value' }, value[1]),
        ),
        el('span', { class: 'pbar', 'aria-hidden': 'true' }, bar(barLength(value[0], max))),
        el('span', { class: 'small' }, `Last seen ${lastSeen(p.lastEnd)}`),
        badgeIcons(held, badges),
      ),
    ),
  );
}

/** The line under the heading: how many players are shown, and by what. */
function countLine(shown, total, badges) {
  const by = SORTS.find(([k]) => k === state.sort)[1].toLowerCase();
  const filters = [];
  if (state.badge) filters.push(`the ${badges.find((b) => b.id === state.badge)?.name || state.badge} badge`);
  if (state.adv) filters.push(`“${state.adv}”`);
  if (!filters.length && !state.q)
    return `${total} players since launch, most ${by} first. Tap a face for their page.`;
  return `${shown} of ${total} players${filters.length ? ` with ${filters.join(' and ')}` : ''}, most ${by} first.`;
}

function render(st, bdata) {
  const badges = bdata.badges || [];
  const heldBy = Object.fromEntries((bdata.holders || []).map((h) => [h.name, h.badges]));
  const all = Object.values(st.players);

  const q = state.q.trim().toLowerCase();
  const adv = state.adv.trim().toLowerCase();
  const rows = all
    .filter((p) => p.name.toLowerCase().includes(q))
    .filter((p) => !state.badge || (heldBy[p.name] || {})[state.badge])
    .filter((p) => !adv || (p.advs || []).some((a) => a.toLowerCase().includes(adv)))
    .map((p) => {
      const held = heldBy[p.name] || {};
      return { p, held, value: metric(p, held) };
    })
    .sort((a, b) => b.value[0] - a.value[0] || b.p.minutes - a.p.minutes);

  const max = rows[0]?.value[0] || 1;
  $('count').textContent = countLine(rows.length, all.length, badges);
  $('none').hidden = rows.length > 0;
  $('plist').replaceChildren(...rows.map((r, i) => card(r.p, i + 1, r.value, max, r.held, badges)));
}

/** Fills the badge menu and the advancement suggestions, and wires every control to re-render. */
function wire(st, bdata) {
  const badges = bdata.badges || [];
  const held = new Set((bdata.holders || []).flatMap((h) => Object.keys(h.badges)));
  $('badge').append(
    ...badges.filter((b) => held.has(b.id)).map((b) => el('option', { value: b.id }, b.name)),
  );
  const earners = new Map();
  for (const p of Object.values(st.players))
    for (const a of p.advs || []) earners.set(a, (earners.get(a) || 0) + 1);
  $('adv-list').append(
    ...[...earners.keys()]
      .sort()
      .map((a) =>
        el('option', { value: a }, `${earners.get(a)} ${earners.get(a) === 1 ? 'player' : 'players'}`),
      ),
  );

  const update = () => {
    const active = [state.badge, state.adv].filter(Boolean).length;
    $('filters-toggle').textContent = active ? `Filters (${active})` : 'Filters';
    saveState();
    render(st, bdata);
  };
  const drawSort = () =>
    $('sort').replaceChildren(
      chipRow({
        options: SORTS,
        value: state.sort,
        label: 'Sort players by',
        onPick: (key) => {
          state.sort = key;
          drawSort();
          update();
        },
      }),
    );
  drawSort();

  $('filter').value = state.q;
  $('badge').value = state.badge;
  if ($('badge').value !== state.badge) state.badge = ''; // an unknown badge in the address
  $('adv').value = state.adv;

  $('filter').addEventListener('input', (e) => {
    state.q = e.target.value;
    update();
  });
  $('badge').addEventListener('change', (e) => {
    state.badge = e.target.value;
    update();
  });
  $('adv').addEventListener('input', (e) => {
    state.adv = e.target.value;
    update();
  });
  // On a phone the filters fold away behind a button, unless one is in use.
  const toggle = $('filters-toggle');
  const showFilters = (open) => {
    $('filters').classList.toggle('is-closed', !open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  showFilters(Boolean(state.badge || state.adv));
  toggle.addEventListener('click', () => showFilters(toggle.getAttribute('aria-expanded') !== 'true'));

  $('clear').addEventListener('click', () => {
    Object.assign(state, { q: '', badge: '', adv: '' });
    $('filter').value = $('adv').value = $('badge').value = '';
    update();
  });
  update();
}

Promise.all([loadStats(), loadBadges()])
  .then(([st, bdata]) => wire(st, bdata))
  .catch((e) => {
    console.error(e);
    $('plist').replaceChildren(
      el('li', { class: 'empty' }, "The players couldn't load. Try again in a moment."),
    );
  });
