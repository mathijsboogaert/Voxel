// The search box over a full-screen map (map page and editor): opens from #btn-search,
// lists results as you type, and picks one with a click, Enter or the arrow keys.
import { el, byId } from './ui.js?v=4d932c1e';

/**
 * mapSearch({ search, row, choose, onOpen })
 *   search(query)   -> results for a non-empty, lower-case query, or an element to show instead (no matches)
 *   row(result)     -> [icon element, title, subtitle] for one result
 *   choose(result)  what picking a result does; the search closes afterwards
 *   onOpen()        optional, runs each time the search opens (to load what it needs on first use)
 * Returns { render } to redraw the results, for when the data behind them arrives late.
 */
export function mapSearch({ search, row, choose, onOpen = () => {} }) {
  const box = byId('msearch');
  const input = byId('search-input');
  const list = byId('search-results');
  const openBtn = byId('btn-search');
  let results = [];
  let active = -1;

  // A combobox for screen readers: the input owns the list, the highlighted result is its active option,
  // and a hidden status line says how many results there are.
  const status = el('p', { class: 'sr-only', role: 'status' });
  box.append(status);
  for (const [k, v] of Object.entries({
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-controls': list.id,
    'aria-expanded': 'false',
  }))
    input.setAttribute(k, v);
  const optionId = (i) => `search-option-${i}`;

  const open = () => {
    box.classList.add('open');
    openBtn.setAttribute('aria-expanded', 'true');
    input.focus();
    onOpen();
  };
  const close = () => {
    box.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');
    input.value = '';
    render();
    input.blur();
  };
  const pick = (i) => {
    if (!results[i]) return;
    choose(results[i]);
    close();
  };
  const markActive = () => {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    if (active >= 0) input.setAttribute('aria-activedescendant', optionId(active));
    else input.removeAttribute('aria-activedescendant');
  };

  function render() {
    const q = input.value.trim().toLowerCase();
    const found = q ? search(q) : [];
    results = Array.isArray(found) ? found : [];
    active = results.length ? 0 : -1;
    input.setAttribute('aria-expanded', String(results.length > 0));
    if (!q) {
      list.replaceChildren();
      status.textContent = '';
    } else if (!results.length) {
      const empty = found.nodeType ? found : el('li', { class: 'msearch__empty' }, 'No matches');
      list.replaceChildren(empty);
      status.textContent = empty.textContent;
    } else {
      list.replaceChildren(
        ...results.map((r, i) => {
          const [icon, title, sub] = row(r);
          return el(
            'li',
            { class: 'sresult', id: optionId(i), role: 'option', onclick: () => pick(i) },
            el('span', { class: 'sresult__icon' }, icon),
            el('span', {}, title, el('small', {}, sub)),
          );
        }),
      );
      status.textContent = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
    }
    markActive();
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
