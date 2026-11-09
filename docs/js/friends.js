/* Who knows who on the homepage: the chart, a name switch and a card for whoever is tapped. */
import { byId, el, svgEl, getJSON, faceEl, fmtHours } from './ui.js?v=4d932c1e';
import { loadStats } from './data.js?v=f15302e2';
import { chipRow } from './widgets.js?v=d7485e33';
import { friendsChart, HEART } from './friends-core.js?v=b92f2984';

const NAMES_KEY = 'voxel-friends-names';
const LEGEND = [
  ['fc-key fc-key--direct', 'direct'],
  ['fc-key fc-key--via', 'via a friend'],
  ['fc-key fc-key--family', 'siblings'],
  ['love', 'couple'],
];

/**
 * Only people who are in the stats (have played) are on the chart. Their Minecraft name takes the spelling
 * from the stats, so the face matches. Groups and couples keep the people still shown; whoever a hidden
 * person brought in is linked to whoever brought that person in. Without stats everyone is shown.
 */
function onlyPlayed(data, st) {
  if (!st?.players) return data;
  const played = new Map(Object.keys(st.players).map((n) => [n.toLowerCase(), n]));
  const people = data.people
    .filter((p) => p.id === 'me' || (p.mc && played.has(p.mc.toLowerCase())))
    .map((p) => (p.mc ? { ...p, mc: played.get(p.mc.toLowerCase()) ?? p.mc } : { ...p }));
  const all = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const on = new Set(people.map((p) => p.id));
  const reach = (id, seen = new Set()) =>
    on.has(id) || seen.has(id) ? [id] : (seen.add(id), (all[id]?.via ?? []).flatMap((v) => reach(v, seen)));
  for (const p of people) p.via = [...new Set(p.via.flatMap((v) => reach(v)))].filter((v) => on.has(v));
  for (const p of people) if (p.id !== 'me' && !p.via.length) p.via = ['me'];
  return {
    ...data,
    people,
    groups: data.groups
      .map((g) => ({ ...g, members: g.members.filter((m) => on.has(m)) }))
      .filter((g) => g.members.length),
    rels: data.rels
      .map((r) => ({ ...r, members: r.members.filter((m) => on.has(m)) }))
      .filter((r) => r.members.length > 1),
  };
}

function savedNames() {
  try {
    return localStorage.getItem(NAMES_KEY) === 'player' ? 'player' : 'real';
  } catch {
    return 'real';
  }
}

/** Fills #fc-chart, #fc-names, #fc-legend, #fc-groups and #fc-card. */
export async function mountFriends() {
  const [raw, st] = await Promise.all([getJSON('data/friends.json', null), loadStats().catch(() => null)]);
  const data = raw && onlyPlayed(raw, st);
  if (!data) {
    byId('friends').setAttribute('hidden', '');
    return;
  }
  const hours = (p) => (p.mc && st?.players?.[p.mc] ? st.players[p.mc].minutes / 60 : null);
  let names = savedNames();

  const chart = friendsChart(data, { names, onSelect: (id) => card(id) });
  byId('fc-chart').replaceChildren(chart.svg);
  chart.place();
  document.fonts?.ready.then(() => chart.place());

  // Two short rows: what the lines mean, then the group colours.
  const key = (cls) => el('span', { class: cls, 'aria-hidden': 'true' });
  const heart = svgEl(
    'svg',
    { class: 'fc-key--love', viewBox: '-8 -7 16 14', 'aria-hidden': 'true' },
    svgEl('path', { d: HEART, class: 'fc-heart' }),
  );
  byId('fc-legend').replaceChildren(
    ...LEGEND.map(([cls, text]) => el('li', {}, cls === 'love' ? heart : key(cls), text)),
  );
  byId('fc-groups').replaceChildren(
    ...data.groups.map((g) => el('li', {}, key(`fc-key fc-key--group fc-key--${g.cls}`), g.name)),
  );

  function namesRow() {
    byId('fc-names').replaceChildren(
      chipRow({
        options: [
          ['real', 'Real names'],
          ['player', 'Player names'],
        ],
        value: names,
        label: 'Names',
        onPick: (next) => {
          names = next;
          try {
            localStorage.setItem(NAMES_KEY, next);
          } catch {
            /* the choice just isn't remembered */
          }
          chart.setNames(next);
          namesRow();
          card(selected);
        },
      }),
    );
  }

  let selected = null;
  function card(id) {
    selected = id;
    const p = id ? chart.byId[id] : chart.me;
    const tags = chart.tags(p).map((t) => el('span', { class: `tag fc-tag fc-tag--${t.kind}` }, t.text));
    const face = p.mc ? faceEl(p.mc, 'lg') : el('span', { class: 'face face--lg face--letter' }, p.name[0]);
    let line;
    if (!id) {
      line = el(
        'p',
        { class: 'small' },
        el('b', {}, chart.counts.direct),
        ' direct · ',
        el('b', {}, chart.counts.via),
        ' via a friend',
      );
    } else {
      const h = hours(p);
      line = el(
        'p',
        { class: 'small' },
        chart.route(p).flatMap((r, i) => [i ? el('br') : null, el('span', { class: 'fc-path' }, r)]),
        ' · ',
        p.mc ? (h == null ? 'played' : fmtHours(h) + ' played') : 'never played',
      );
    }
    byId('fc-card').replaceChildren(
      face,
      el(
        'div',
        { class: 'fc-card__body' },
        el(
          'h2',
          { class: 'fc-card__name' },
          chart.shown(p),
          ' ',
          el('span', { class: 'small' }, chart.other(p)),
        ),
        line,
        tags.length ? el('div', { class: 'fc-tags' }, tags) : null,
      ),
    );
  }

  namesRow();
  card(null);
}
