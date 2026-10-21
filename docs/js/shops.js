// Shops page: every shop with its icon, owner, place and what it sells for how much.
// The search box takes an item or a shop name and also finds shops that sell the parts of an item
// (see findShops in shops-core.js). Deep link: shops/#shop-slug scrolls to one shop, shops/?q=... searches.
import { el, byId, url, getJSON, faceEl, playerHref } from './ui.js?v=28a5c906';
import {
  loadItems,
  findShops,
  matchItems,
  shopIconEl,
  offerText,
  priceEl,
  shopSlug,
  isService,
  isOpen,
  productRows,
  itemName,
} from './shops-core.js?v=b4c787b7';

const mapHref = (s) => url('map/') + '?find=' + encodeURIComponent(s.label);

/** What a row offers: one item or service, or a group that opens to show every kind in it. */
function offerCell(db, { lines, group }) {
  if (!group) return offerText(db, lines[0]);
  const amount = lines[0].amount > 1 ? `${lines[0].amount}× ` : '';
  return el(
    'details',
    { class: 'pgroup' },
    el('summary', {}, `${amount}${group}`, el('span', { class: 'small' }, ` · ${lines.length} kinds`)),
    el('p', { class: 'small' }, lines.map((p) => itemName(db, p.item)).join(', ')),
  );
}

function productTable(db, s) {
  const lines = s.products || [];
  const service = isService(s);
  if (!lines.length) {
    const empty = service
      ? 'No services listed yet. Ask the owner what they offer.'
      : 'No products listed yet. Drop by and have a look.';
    return el('p', { class: 'small' }, empty);
  }
  return el(
    'table',
    { class: 'ptable' },
    el(
      'tbody',
      {},
      productRows(s).map((row) =>
        el('tr', {}, el('td', {}, offerCell(db, row)), el('td', {}, priceEl(db, row.lines[0]) || 'Ask')),
      ),
    ),
  );
}

/**
 * One shop: its icon, kind (Shop or Service) and name on top, what it offers in the middle,
 * and its owner and the way to it on the map at the bottom.
 */
function card(db, s, reason) {
  const owner = s.owner
    ? el(
        'a',
        { class: 'scard__owner', href: playerHref(s.owner) },
        faceEl(s.owner, 'sm'),
        el('span', {}, s.owner),
      )
    : el('span');
  return el(
    'li',
    { class: 'scard', id: shopSlug(s) },
    el(
      'div',
      { class: 'scard__head' },
      el('span', { class: 'scard__icon' }, shopIconEl(s)),
      el(
        'div',
        { class: 'scard__title' },
        el('p', { class: 'label eyebrow' }, isService(s) ? 'Service' : 'Shop'),
        el('h2', {}, s.label),
      ),
    ),
    reason ? el('p', { class: 'scard__why' }, reason) : null,
    productTable(db, s),
    el('div', { class: 'scard__foot' }, owner, el('a', { href: mapHref(s) }, 'On the map')),
  );
}

// Which shops to show: all, the ones selling items, or the services.
const KINDS = { all: 'All', items: 'Items', services: 'Services' };
let kind = 'all';
const ofKind = (s) => kind === 'all' || (kind === 'services') === isService(s);

/** The filter: one button per kind, with how many shops it shows. */
function renderChips(db, shops) {
  const count = { all: shops.length, services: shops.filter(isService).length };
  count.items = count.all - count.services;
  const chips = Object.entries(KINDS).map(([key, label]) =>
    el(
      'button',
      {
        class: 'chip',
        role: 'tab',
        'aria-selected': String(key === kind),
        onclick: () => {
          kind = key;
          renderChips(db, shops);
          render(db, shops, byId('filter').value);
        },
      },
      label,
      el('span', { class: 'chip__count' }, count[key]),
    ),
  );
  byId('kinds').replaceChildren(...chips);
}

function render(db, all, query) {
  const shops = all.filter(ofKind);
  const q = query.trim();
  const none = byId('none');
  if (!q) {
    none.hidden = true;
    byId('slist').replaceChildren(...shops.map((s) => card(db, s, '')));
    return;
  }
  const hits = findShops(db, shops, q);
  byId('slist').replaceChildren(...hits.map((h) => card(db, h.shop, h.reason)));
  none.hidden = hits.length > 0;
  const item = matchItems(db, q, 1)[0];
  none.textContent = item
    ? `No shop sells ${item.name}, or anything it's made from, yet.`
    : 'No shop or item by that name.';
}

Promise.all([loadItems(), getJSON('shops.json', [])])
  .then(([db, data]) => {
    const shops = data.filter((s) => s.label && isOpen(s)).sort((a, b) => a.label.localeCompare(b.label));
    const input = byId('filter');
    const q = new URLSearchParams(location.search).get('q');
    if (q) input.value = q;
    renderChips(db, shops);
    render(db, shops, input.value);
    input.addEventListener('input', () => render(db, shops, input.value));

    const target = location.hash && byId(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      target.classList.add('scard--focus');
      target.scrollIntoView({ block: 'start' });
    }
  })
  .catch((e) => {
    console.error(e);
    byId('slist').replaceChildren(
      el('li', { class: 'empty' }, "The shops couldn't load. Try again in a moment."),
    );
  });
