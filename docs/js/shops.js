// Shops page: every shop with its icon, owner, place and what it sells for how much.
// The search box takes an item or a shop name and also finds shops that sell the parts of an item
// (see findShops in shops-core.js). Deep link: shops/#shop-slug scrolls to one shop, shops/?q=... searches.
import { el, byId, url, getJSON, faceEl, playerHref, fmtInt } from './ui.js';
import {
  loadItems,
  findShops,
  matchItems,
  shopIconEl,
  offerText,
  priceEl,
  shopSlug,
  isService,
} from './shops-core.js';

const mapHref = (s) => url('map/') + '?find=' + encodeURIComponent(s.label);
const plural = (n, word) => `${n} ${n === 1 ? word : word + 's'}`;

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
      'thead',
      {},
      el(
        'tr',
        {},
        el('th', { scope: 'col' }, service ? 'Service' : 'Item'),
        el('th', { scope: 'col' }, 'Price'),
      ),
    ),
    el(
      'tbody',
      {},
      lines.map((p) => el('tr', {}, el('td', {}, offerText(db, p)), el('td', {}, priceEl(db, p) || 'Ask'))),
    ),
  );
}

function card(db, s, reason) {
  const owner = s.owner
    ? el('a', { class: 'scard__owner', href: playerHref(s.owner) }, faceEl(s.owner, 'sm'), s.owner)
    : null;
  const tag = isService(s) ? el('span', { class: 'tag tag--amber' }, 'Service') : null;
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
        el('h2', {}, s.label),
        el('div', { class: 'scard__meta' }, owner, tag),
      ),
    ),
    reason ? el('p', { class: 'scard__why' }, reason) : null,
    productTable(db, s),
    el(
      'div',
      { class: 'scard__foot' },
      el('span', { class: 'small' }, `X ${fmtInt(s.x)}, Z ${fmtInt(s.z)}`),
      el('a', { href: mapHref(s) }, 'On the map'),
    ),
  );
}

// Which shops to show: all, the ones selling items, or the services.
const KINDS = { all: 'All', items: 'Items', services: 'Services' };
let kind = 'all';
const ofKind = (s) => kind === 'all' || (kind === 'services') === isService(s);

function renderChips(db, shops) {
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
    ),
  );
  byId('kinds').replaceChildren(...chips);
}

function render(db, all, query) {
  const services = all.filter(isService).length;
  const items = all.reduce((n, s) => n + (isService(s) ? 0 : (s.products || []).length), 0);
  byId('count').textContent =
    `${plural(all.length - services, 'shop')} selling ${plural(items, 'item')}, and ${plural(services, 'service')}. ` +
    "Search for an item and it also finds shops that sell what it's made from.";

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
    const shops = data.filter((s) => s.label).sort((a, b) => a.label.localeCompare(b.label));
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
