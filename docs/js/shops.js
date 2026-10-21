// Shops page: every shop with its own icon, owner, place and what it sells for how much.
// The search box takes an item or a shop name and also finds shops that sell the parts of an item
// (see findShops in shops-core.js). Deep link: shops/#shop-slug scrolls to one shop.
import { el, url, faceEl, playerHref, fmtInt } from './ui.js';
import { loadItems, findShops, matchItems, shopIconEl, amountText, priceText, shopSlug } from './shops-core.js';

const $ = (id) => document.getElementById(id);
const mapHref = (s) => url('map/') + '?find=' + encodeURIComponent(s.label);

function productTable(db, s) {
  const lines = s.products || [];
  if (!lines.length) return el('p', { class: 'small scard__none' }, 'No products listed yet. Drop by and have a look.');
  return el('table', { class: 'ptable' },
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Item'), el('th', { scope: 'col' }, 'Price'))),
    el('tbody', {}, lines.map((p) => el('tr', {},
      el('td', {}, amountText(db, p.item, p.amount)),
      el('td', {}, priceText(db, p) || 'Ask')))));
}

function card(db, s, reason) {
  return el('li', { class: 'scard', id: shopSlug(s) },
    el('div', { class: 'scard__head' },
      el('span', { class: 'scard__icon' }, shopIconEl(s)),
      el('div', { class: 'scard__title' },
        el('h2', {}, s.label),
        s.owner ? el('a', { class: 'scard__owner', href: playerHref(s.owner) }, faceEl(s.owner, 'sm'), s.owner) : null)),
    reason ? el('p', { class: 'scard__why' }, reason) : null,
    productTable(db, s),
    el('div', { class: 'scard__foot' }, el('span', { class: 'small' }, `X ${fmtInt(s.x)}, Z ${fmtInt(s.z)}`),
      el('a', { class: 'scard__map', href: mapHref(s) }, 'On the map')));
}

function render(db, shops, query) {
  const q = query.trim();
  const listed = shops.reduce((n, s) => n + (s.products || []).length, 0);
  $('count').textContent = `${shops.length} shops, ${listed} items listed. Search for an item and it also finds shops that sell what it's made from.`;
  if (!q) {
    $('none').hidden = true;
    $('slist').replaceChildren(...shops.map((s) => card(db, s, '')));
    return;
  }
  const hits = findShops(db, shops, q);
  $('slist').replaceChildren(...hits.map((h) => card(db, h.shop, h.reason)));
  $('none').hidden = hits.length > 0;
  const item = matchItems(db, q, 1)[0];
  $('none').textContent = item ? `No shop sells ${item.name}, or anything it's made from, yet.` : 'No shop or item by that name.';
}

Promise.all([
  loadItems(),
  fetch(url('shops.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])),
]).then(([db, data]) => {
  const shops = data.filter((s) => s.label).sort((a, b) => a.label.localeCompare(b.label));
  const input = $('filter');
  const params = new URLSearchParams(location.search);
  if (params.get('q')) input.value = params.get('q');
  render(db, shops, input.value);
  input.addEventListener('input', () => render(db, shops, input.value));
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) { target.classList.add('scard--focus'); target.scrollIntoView({ block: 'start' }); }
  }
}).catch((e) => {
  console.error(e);
  $('slist').replaceChildren(el('li', { class: 'empty' }, "The shops couldn't load. Try again in a moment."));
});
