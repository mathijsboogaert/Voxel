// Players list: everyone with a face, playtime and when they were last on. Filter and sort.
import { loadStats } from './data.js';
import { el, faceEl, playerHref, fmtHours, relTime } from './ui.js';

const $ = (id) => document.getElementById(id);
const SORTS = {
  recent: { label: 'Recent', fn: (a, b) => (b.online - a.online) || (a.lastEnd < b.lastEnd ? 1 : -1) },
  playtime: { label: 'Playtime', fn: (a, b) => b.minutes - a.minutes },
  name: { label: 'Name', fn: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) },
};
let sort = 'recent', query = '';

function render(st) {
  const all = Object.values(st.players);
  $('count').textContent = `${all.length} players since launch. Tap a face for their page.`;
  $('sorts').replaceChildren(...Object.entries(SORTS).map(([key, s]) =>
    el('button', { class: 'chip', role: 'tab', 'aria-selected': String(key === sort), onclick: () => { sort = key; render(st); } }, s.label)));

  const q = query.trim().toLowerCase();
  const rows = all.filter((p) => p.name.toLowerCase().includes(q)).sort(SORTS[sort].fn);
  $('none').hidden = rows.length > 0;
  $('plist').replaceChildren(...rows.map((p) =>
    el('li', {}, el('a', { class: 'pcard', href: playerHref(p.name) },
      el('span', { class: 'pface' }, faceEl(p.name, 'lg'), p.online ? el('span', { class: 'dot-online', title: 'Online now' }) : null),
      el('span', { class: 'pcard__body' },
        el('p', { class: 'pcard__name' }, p.name),
        el('p', { class: 'small' }, `${fmtHours(p.minutes / 60)} played`),
        el('p', { class: 'small' }, p.online ? 'Online now' : `Last seen ${relTime(p.lastEnd)}`))))));
}

loadStats().then((st) => {
  render(st);
  $('filter').addEventListener('input', (e) => { query = e.target.value; render(st); });
}).catch((e) => {
  console.error(e);
  $('plist').replaceChildren(el('li', { class: 'empty' }, "The players couldn't load. Try again in a moment."));
});
