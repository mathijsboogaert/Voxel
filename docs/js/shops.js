// Shops page: every shop with its icon, owners, place and what it sells for how much.
// The search box takes an item or a shop name and also finds shops that sell the parts of an item
// (see findShops in shops-core.js). Deep link: shops/#shop-slug scrolls to one shop, shops/?q=... searches.
import { el, byId, getJSON, faceEl, playerHref, findOnMapHref } from './ui.js?v=4d932c1e';
import {
  loadItems,
  findShops,
  matchItems,
  shopIconEl,
  offerText,
  priceEl,
  rowPriceEl,
  samePrice,
  shopSlug,
  isService,
  kindLabel,
  sellsGoods,
  offersServices,
  lineName,
  isOpen,
  productRows,
  ownersOf,
} from './shops-core.js?v=6be4719b';
import { chipRow } from './widgets.js?v=d7485e33';

/**
 * What a row offers: one item or service, or a group that opens to show every kind in it. When the kinds
 * cost different amounts, each is listed with its own price.
 */
function offerCell(db, { lines, group }) {
  if (!group) return offerText(db, lines[0]);
  const amount = lines[0].amount > 1 ? `${lines[0].amount}× ` : '';
  const kinds = samePrice(lines)
    ? el('p', { class: 'small' }, lines.map((p) => lineName(db, p)).join(', '))
    : el(
        'ul',
        { class: 'pgroup__list small' },
        lines.map((p) => el('li', {}, el('span', {}, lineName(db, p)), priceEl(db, p) || 'Ask')),
      );
  return el(
    'details',
    { class: 'pgroup' },
    el('summary', {}, `${amount}${group}`, el('span', { class: 'small' }, ` · ${lines.length} kinds`)),
    kinds,
  );
}

function productTable(db, s) {
  if (!(s.products || []).length) {
    const empty = isService(s)
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
        el('tr', {}, el('td', {}, offerCell(db, row)), el('td', {}, rowPriceEl(db, row.lines) || 'Ask')),
      ),
    ),
  );
}

/**
 * One shop: its icon, kind (Shop, Service, or Shop & service) and name on top, what it offers in the middle,
 * and its owners and the way to it on the map at the bottom.
 */
function card(db, s, reason) {
  const owners = el(
    'div',
    { class: 'scard__owners' },
    ownersOf(s).map((name) =>
      el('a', { class: 'scard__owner', href: playerHref(name) }, faceEl(name, 'sm'), el('span', {}, name)),
    ),
  );
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
        el('p', { class: 'label eyebrow' }, kindLabel(s)),
        el('h2', {}, s.label),
      ),
    ),
    el(
      'div',
      { class: 'scard__body' },
      reason ? el('p', { class: 'scard__why' }, reason) : null,
      productTable(db, s),
    ),
    el('div', { class: 'scard__foot' }, owners, el('a', { href: findOnMapHref(s.label) }, 'On the map')),
  );
}

// Which shops to show: all, the ones that sell things, or the ones that offer services.
// A shop that does both shows under both.
const KINDS = [
  ['all', 'All'],
  ['goods', 'Shops'],
  ['services', 'Services'],
];
let kind = 'all';
const ofKind = (s) => kind === 'all' || (kind === 'services' ? offersServices(s) : sellsGoods(s));

function renderChips(db, shops) {
  const pick = (key) => {
    kind = key;
    renderChips(db, shops);
    render(db, shops, byId('filter').value);
  };
  byId('kinds').replaceWith(
    Object.assign(chipRow({ options: KINDS, value: kind, onPick: pick, label: 'Show' }), { id: 'kinds' }),
  );
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

Promise.all([loadItems(), getJSON('shops.json', null)])
  .then(([db, data]) => {
    if (!data) throw new Error('shops.json did not load');
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
