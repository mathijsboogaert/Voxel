// Shops and the items they sell: the item list (docs/data/items.json, built by tools/build_items.py from the
// game's own 26.3 data), each shop's icon, product lines, and the item search that also finds shops selling
// the parts of what you want (looking for planks finds the shop with logs).
import { url, el } from './ui.js?v=4d932c1e';

let itemsPromise = null;

/** loadItems() -> {items: [{i, id, name}], byId, byName, tags, recipes, enchants, enchantById}. Loaded once per page. */
export function loadItems() {
  if (!itemsPromise) {
    itemsPromise = fetch(url('data/items.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return null;
        const items = d.items.map(([id, name], i) => ({ i, id, name, lower: name.toLowerCase() }));
        const byId = new Map(items.map((it) => [it.id, it]));
        const byName = new Map(items.map((it) => [it.lower, it]));
        const recipes = new Map(Object.entries(d.recipes).map(([k, v]) => [Number(k), v]));
        const enchants = (d.enchants || []).map(([id, name, max]) => ({
          id,
          name,
          max,
          lower: name.toLowerCase(),
        }));
        const enchantById = new Map(enchants.map((e) => [e.id, e]));
        return { version: d.version, items, byId, byName, tags: d.tags, recipes, enchants, enchantById };
      })
      .catch(() => null);
  }
  return itemsPromise;
}

export const itemName = (db, id) =>
  db && db.byId.get(id) ? db.byId.get(id).name : String(id || '').replaceAll('_', ' ');

/* ---- Enchanted books ----------------------------------------------------------------------- */
// A line can be an enchanted book with its enchantment: {item: 'enchanted_book', enchant: 'mending', level: 1}.
// The level is optional (a shop may not say which).

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const BOOK = 'Enchanted Book';

/** "Mending", "Efficiency V": an enchantment's name, with its level when it has more than one. */
export function enchantText(db, id, level) {
  const e = db && db.enchantById.get(id);
  const name = e ? e.name : String(id || '').replaceAll('_', ' ');
  return level && (!e || e.max > 1) ? `${name} ${ROMAN[level] || level}` : name;
}

/** An item line's name: "Oak Log", or "Enchanted Book: Mending" for a book. */
export const lineItemName = (db, p) =>
  p.enchant ? `${BOOK}: ${enchantText(db, p.enchant, p.level)}` : itemName(db, p.item);

/**
 * What a typed name is: {item} for a Minecraft item, {item: 'enchanted_book', enchant, level?} for a book, or null.
 * A book can be typed as "Enchanted Book: Mending", "Mending", "Mending book" or "Efficiency V" / "Efficiency 5".
 */
export function parseItem(db, typed) {
  if (!db) return null;
  const text = String(typed || '')
    .trim()
    .toLowerCase();
  const item = db.byName.get(text);
  if (item) return { item: item.id };
  const m = text
    .replace(/^enchanted book\s*[:(-]?\s*/, '')
    .replace(/\)$/, '')
    .replace(/\s+(enchanted\s+)?book$/, '')
    .match(/^(.+?)(?:\s+(\d+|[ivx]+))?$/);
  if (!m) return null;
  const enchant = db.enchants.find((e) => e.lower === m[1].trim());
  if (!enchant) return null;
  const level = !m[2] ? 0 : /^\d+$/.test(m[2]) ? Number(m[2]) : ROMAN.indexOf(m[2].toUpperCase());
  if (m[2] && !(level >= 1 && level <= enchant.max)) return null;
  return { item: 'enchanted_book', enchant: enchant.id, ...(level && enchant.max > 1 ? { level } : {}) };
}

/** A shop's own 16x16 icon (shown pixelated), or the general shop icon if it has none. */
export function shopIconEl(shop) {
  const own = !!(shop && shop.icon);
  return el('img', {
    class: own ? 'shop-icon' : 'shop-icon shop-icon--default',
    src: own ? shop.icon : url('assets/shop-icon.png?v=00997138'),
    alt: '',
    width: 16,
    height: 16,
    decoding: 'async',
  });
}

/** "64× Oak Log", or just the name for one. */
export function amountText(db, id, n) {
  const name = itemName(db, id);
  return n && n !== 1 ? `${n}\u00d7 ${name}` : name;
}
/**
 * A shop's lines are of three kinds: a Minecraft item ({item}), something else for sale that isn't an item,
 * like a Happy Ghast ({name}), or a service, like Delivery ({service}). What a shop is follows from its lines,
 * so one shop can both sell things and offer services.
 */
export const lineKind = (p) => (p.service ? 'service' : p.item ? 'item' : 'other');
const linesOf = (s) => (s && s.products) || [];
/** Sells things: items or other products. */
export const sellsGoods = (s) => linesOf(s).some((p) => lineKind(p) !== 'service');
/** Offers services. A shop without lines yet can still be marked as a service shop (kind: 'service'). */
export const offersServices = (s) =>
  linesOf(s).some((p) => lineKind(p) === 'service') || (!linesOf(s).length && !!s && s.kind === 'service');
/** Only services, nothing for sale. */
export const isService = (s) => offersServices(s) && !sellsGoods(s);
/** "Shop", "Service" or "Shop & service". */
export const kindLabel = (s) =>
  sellsGoods(s) && offersServices(s) ? 'Shop & service' : offersServices(s) ? 'Service' : 'Shop';
/**
 * A shop behind a spoiler wall is still being built: it shows on the map and its owner's page,
 * but not on the Shops page or in the homepage news until the wall comes down.
 */
export const isOpen = (s) => !!s && !s.spoiler;
/** What a line offers: "64× Oak Log" for an item, "2× Happy Ghast" for another product, the text for a service. */
export function offerText(db, p) {
  if (p.service) return p.service;
  const name = p.item ? lineItemName(db, p) : p.name || '';
  return p.amount > 1 ? `${p.amount}\u00d7 ${name}` : name;
}
/** A line's own name, without the amount: for listing the kinds in a group. */
export const lineName = (db, p) => p.service || (p.item ? lineItemName(db, p) : p.name || '');

/** A shop's owners (Minecraft names). Older shops have one `owner`; newer ones a list of `owners`. */
export const ownersOf = (s) => (s && (s.owners || (s.owner ? [s.owner] : []))) || [];

/**
 * A shop's product lines as rows for its price list. Lines with the same group name (p.group, like "Logs")
 * and the same amount and price become one row, so a shop with many kinds of one thing stays short.
 * Rows keep the order of their first line. Each row: {lines, group}; group is '' for a single line.
 */
export function productRows(shop) {
  const rows = new Map();
  for (const p of shop.products || []) {
    const key = p.group ? [p.group, p.amount, p.price, p.priceItem, p.free].join('|') : Symbol();
    if (!rows.has(key)) rows.set(key, { lines: [], group: p.group || '' });
    rows.get(key).lines.push(p);
  }
  return [...rows.values()].map((r) => (r.lines.length > 1 ? r : { lines: r.lines, group: '' }));
}

/** "1 Diamond", "Free", or '' when the shop has not set a price. */
export function priceText(db, p) {
  if (p.free) return 'Free';
  if (!p.price) return '';
  return amountText(db, p.priceItem || 'diamond', p.price);
}

/** A price to show: a number with the diamond icon for diamonds, "Free", other currencies as text, or null when unset. */
export function priceEl(db, p) {
  if (p.free) return 'Free';
  if (!p.price) return null;
  if ((p.priceItem || 'diamond') !== 'diamond') return priceText(db, p);
  const label = `${p.price} ${p.price === 1 ? 'diamond' : 'diamonds'}`;
  return el(
    'span',
    { class: 'price', title: label },
    el('span', { class: 'sr-only' }, label),
    el('span', { 'aria-hidden': 'true' }, String(p.price)),
    el('img', {
      class: 'price__icon',
      src: url('assets/icons/diamond.png?v=fd11635e'),
      alt: '',
      width: 16,
      height: 16,
    }),
  );
}

/** A stable anchor for a shop on the Shops page. */
export const shopSlug = (s) =>
  String(s.label || 'shop')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'shop';
export const shopHref = (s) => url('shops/') + '#' + shopSlug(s);

/* ---- Item search -------------------------------------------------------------------- */

const VERB = { c: 'crafts into', f: 'smelts into', s: 'cuts into', m: 'upgrades to', t: 'turns into' };
const BIG_SLOT = 40; // a slot that takes any of 40+ items (any wool, any planks of a huge tag) is too vague to follow twice

/** The items a query is about: every word must appear in the name. "logs" also tries "log". */
export function matchItems(db, query, limit = 60) {
  if (!db) return [];
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const variants = (w) =>
    [w, w.replace(/es$/, ''), w.replace(/s$/, '')].filter((v, i, a) => v.length > 1 && a.indexOf(v) === i);
  const hit = (it) => words.every((w) => variants(w).some((v) => it.lower.includes(v) || it.id.includes(v)));
  const found = db.items.filter(hit);
  const q = words.join(' ');
  const rank = (it) => (it.lower === q ? 0 : it.lower.startsWith(q) ? 1 : 2) * 1000 + it.name.length;
  return found.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

const slotItems = (db, s) => (typeof s === 'string' ? db.tags[s.slice(1)] || [] : [s]);

/** The items a shop sells: item index -> its product line. */
function itemsSold(db, shop) {
  const sold = new Map();
  for (const p of shop.products || []) {
    const it = db && db.byId.get(p.item);
    if (it) sold.set(it.i, p);
  }
  return sold;
}

/** A shop that sells something in one of target's recipes: [score, reason]s. More of the recipe covered scores higher. */
function partMatches(db, items, target) {
  const found = [];
  for (const [kind, , slots] of db.recipes.get(target.i) || []) {
    let covered = 0;
    let part = null;
    for (const slot of slots) {
      const got = slotItems(db, slot).find((a) => a !== target.i && items.has(a));
      if (got != null) {
        covered++;
        part ??= got;
      }
    }
    if (part != null) {
      const reason = `Sells ${db.items[part].name}, which ${VERB[kind] || 'makes'} ${target.name}`;
      found.push([3 + covered / slots.length / 2, reason]);
    }
  }
  return found;
}

/** A shop that sells a part of a part (logs -> planks -> sticks): reasons, all scoring 2. */
function partOfPartMatches(db, items, target) {
  const found = [];
  const smallSlots = (recipes) =>
    recipes.flatMap(([kind, , slots]) =>
      slots.map((slot) => [kind, slotItems(db, slot)]).filter(([, alts]) => alts.length <= BIG_SLOT),
    );
  for (const [, alts] of smallSlots(db.recipes.get(target.i) || [])) {
    for (const mid of alts) {
      if (mid === target.i) continue;
      for (const [kind, alts2] of smallSlots(db.recipes.get(mid) || [])) {
        const got = alts2.find((a) => a !== target.i && a !== mid && items.has(a));
        if (got != null) {
          const [part, step] = [db.items[got].name, db.items[mid].name];
          found.push(`Sells ${part}, which ${VERB[kind] || 'makes'} ${step}, for ${target.name}`);
        }
      }
    }
  }
  return found;
}

/**
 * findShops(db, shops, query) -> [{shop, score, reason, direct}] best first.
 *   score 5: the shop's name matches     score 4: sells the item itself
 *   score 3: sells a part of it          score 2: sells a part of a part
 * Each shop appears once, with its best reason. Reasons are lists of text and nodes (prices show the diamond icon).
 */
export function findShops(db, shops, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const targets = matchItems(db, q);
  // When the query names an item exactly ("chest"), only that item's parts count, not those of
  // everything with the word in it ("iron chestplate").
  const singular = q.replace(/s$/, '');
  const exact = targets.filter((t) => t.lower === q || t.lower === singular);
  const partTargets = exact.length ? exact : targets;

  const lineText = (p) => {
    const price = priceEl(db, p);
    return [offerText(db, p), p.free ? ', free' : price ? [' for ', price] : ''].flat();
  };
  const joinLines = (lines) => lines.flatMap((p, i) => (i ? [', ', ...lineText(p)] : lineText(p)));

  const best = new Map();
  const offer = (shop, score, reason, direct = null) => {
    const cur = best.get(shop);
    if (!cur || score > cur.score) best.set(shop, { shop, score, reason, direct });
  };
  const scoreOf = (shop) => (best.get(shop) || {}).score;

  for (const s of shops) {
    // A service, another product or a book matches on its own words ("ghast" finds "Ghast storage" and
    // "Happy Ghast", "mending" finds "Enchanted Book: Mending").
    const texts = (s.products || []).filter((p) => {
      const text = (
        p.service ||
        (p.enchant && lineItemName(db, p)) ||
        (!p.item && p.name) ||
        ''
      ).toLowerCase();
      return text && words.every((w) => text.includes(w));
    });
    const sold = texts.filter((p) => !p.service);
    const offered = texts.filter((p) => p.service);
    if (sold.length) offer(s, 4.5, ['Sells ', ...joinLines(sold.slice(0, 2))], sold[0]);
    if (offered.length) offer(s, 4.5, ['Offers ', ...joinLines(offered.slice(0, 2))], offered[0]);
    if (offersServices(s) && words.every((w) => 'services'.startsWith(w))) offer(s, 3, 'Offers services');

    // Sells it outright (all the matching lines, a couple named).
    const items = itemsSold(db, s);
    const direct = targets.filter((t) => items.has(t.i)).map((t) => items.get(t.i));
    const more = direct.length > 2 ? `, and ${direct.length - 2} more` : '';
    const directText = direct.length ? ['Sells ', ...joinLines(direct.slice(0, 2)), more] : '';
    if (s.label && s.label.toLowerCase().includes(q)) {
      offer(s, 5, directText || (best.get(s) || {}).reason || '', direct[0] || null);
    }
    if (direct.length) offer(s, exact.some((t) => items.has(t.i)) ? 4.5 : 4, directText, direct[0]);
    if (!items.size || !targets.length || scoreOf(s) >= 4) continue;

    // Sells what it is made from.
    for (const t of partTargets) {
      if (items.has(t.i)) continue;
      for (const [score, reason] of partMatches(db, items, t)) offer(s, score, reason);
      if (scoreOf(s) >= 3) continue;
      for (const reason of partOfPartMatches(db, items, t)) offer(s, 2, reason);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.shop.label.localeCompare(b.shop.label));
}
