// The search box over a full-screen map (map page and editor): opens from #btn-search,
// lists results as you type, and picks one with a click, Enter or the arrow keys.
import { el, byId } from './ui.js?v=28a5c906';

/**
 * mapSearch({ search, row, choose })
 *   search(query)   -> results for a non-empty, lower-case query, or an element to show instead (no matches)
 *   row(result)     -> [icon element, title, subtitle] for one result
 *   choose(result)  what picking a result does; the search closes afterwards
 * Returns { render } to redraw the results, for when the data behind them arrives late.
 */
export function mapSearch({ search, row, choose }) {
  const box = byId('msearch');
  const input = byId('search-input');
  const list = byId('search-results');
  const openBtn = byId('btn-search');
  let results = [];
  let active = -1;

  const open = () => {
    box.classList.add('open');
    openBtn.setAttribute('aria-expanded', 'true');
    input.focus();
  };
  const close = () => {
    box.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');
    input.value = '';
    list.replaceChildren();
    results = [];
    active = -1;
    input.blur();
  };
  const pick = (i) => {
    if (!results[i]) return;
    choose(results[i]);
    close();
  };
  const markActive = () =>
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));

  function render() {
    const q = input.value.trim().toLowerCase();
    const found = q ? search(q) : [];
    results = Array.isArray(found) ? found : [];
    active = results.length ? 0 : -1;
    if (!q) return list.replaceChildren();
    if (!results.length) {
      return list.replaceChildren(
        found.nodeType ? found : el('li', { class: 'msearch__empty' }, 'No matches'),
      );
    }
    list.replaceChildren(
      ...results.map((r, i) => {
        const [icon, title, sub] = row(r);
        return el(
          'li',
          { class: 'sresult', role: 'option', 'aria-selected': String(i === active), onclick: () => pick(i) },
          el('span', { class: 'sresult__icon' }, icon),
          el('span', {}, title, el('small', {}, sub)),
        );
      }),
    );
  }

  openBtn.addEventListener('click', open);
  byId('search-close').addEventListener('click', close);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep the map's own keyboard shortcuts out of the text box
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && results.length) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      markActive();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (box.classList.contains('open') && !box.contains(e.target) && !openBtn.contains(e.target)) close();
  });

  return { render };
}
