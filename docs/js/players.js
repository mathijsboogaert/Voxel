// Players list: everyone with a face, playtime and when they were last on, most playtime first.
import { loadStats } from './data.js?v=2048caf9';
import { el, byId as $, faceEl, playerHref, fmtHours, bar, lastSeen } from './ui.js?v=28a5c906';

let query = '';

function render(st) {
  const all = Object.values(st.players).sort((a, b) => b.minutes - a.minutes);
  const max = all[0] ? all[0].minutes : 1;
  $('count').textContent =
    `${all.length} players since launch, most playtime first. Tap a face for their page.`;

  const q = query.trim().toLowerCase();
  const rows = all.filter((p) => p.name.toLowerCase().includes(q));
  $('none').hidden = rows.length > 0;
  $('plist').replaceChildren(
    ...rows.map((p) =>
      el(
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
              el('span', { class: 'pcard__name' }, `${p.rank}. ${p.name}`),
              el('span', { class: 'pcard__value' }, fmtHours(p.minutes / 60)),
            ),
            el('span', { class: 'pbar', 'aria-hidden': 'true' }, bar(Math.max(3, (p.minutes / max) * 100))),
            el('span', { class: 'small' }, `Last seen ${lastSeen(p.lastEnd)}`),
          ),
        ),
      ),
    ),
  );
}

loadStats()
  .then((st) => {
    render(st);
    $('filter').addEventListener('input', (e) => {
      query = e.target.value;
      render(st);
    });
  })
  .catch((e) => {
    console.error(e);
    $('plist').replaceChildren(
      el('li', { class: 'empty' }, "The players couldn't load. Try again in a moment."),
    );
  });
