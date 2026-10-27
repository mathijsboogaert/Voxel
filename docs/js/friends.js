/* Who knows who on the homepage: the chart, a name switch and a card for whoever is tapped. */
import { byId, el, getJSON, faceEl, fmtHours } from './ui.js?v=4d932c1e';
import { loadStats } from './data.js?v=f15302e2';
import { chipRow } from './widgets.js?v=d7485e33';
import { friendsChart } from './friends-core.js?v=e3143fd5';

const NAMES_KEY = 'voxel-friends-names';
const LEGEND = [
  ['fc-key fc-key--direct', 'direct'],
  ['fc-key fc-key--via', 'via a friend'],
  ['fc-key fc-key--family', 'siblings'],
  ['fc-key fc-key--love', 'couple'],
  ['fc-key fc-key--ghost', 'never played'],
];

function savedNames() {
  try {
    return localStorage.getItem(NAMES_KEY) === 'player' ? 'player' : 'real';
  } catch {
    return 'real';
  }
}

/** Fills #fc-chart, #fc-names, #fc-legend and #fc-card. */
export async function mountFriends() {
  const [data, st] = await Promise.all([getJSON('data/friends.json', null), loadStats().catch(() => null)]);
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

  byId('fc-legend').replaceChildren(
    ...LEGEND.map(([cls, text]) => el('li', {}, el('span', { class: cls, 'aria-hidden': 'true' }), text)),
    ...data.groups.map((g) =>
      el(
        'li',
        {},
        el('span', { class: `fc-key fc-key--group fc-key--${g.cls}`, 'aria-hidden': 'true' }),
        g.name,
      ),
    ),
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
