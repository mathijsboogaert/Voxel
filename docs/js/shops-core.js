// Shops and the items they sell: the item list (docs/data/items.json, built by tools/build_items.py from the
// game's own 26.3 data), each shop's icon, product lines, and the item search that also finds shops selling
// the parts of what you want (looking for planks finds the shop with logs).
import { url, el } from './ui.js';

let itemsPromise = null;

/** loadItems() -> {items: [{i, id, name}], byId, byName, tags, recipes}. Loaded once per page. */
export function loadItems() {
  if (!itemsPromise) {
    itemsPromise = fetch(url('data/items.json')).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return null;
      const items = d.items.map(([id, name], i) => ({ i, id, name, lower: name.toLowerCase() }));
      const byId = new Map(items.map((it) => [it.id, it]));
      const byName = new Map(items.map((it) => [it.lower, it]));
      const recipes = new Map(Object.entries(d.recipes).map(([k, v]) => [Number(k), v]));
      return { version: d.version, items, byId, byName, tags: d.tags, recipes };
    }).catch(() => null);
  }
  return itemsPromise;
}

export const itemName = (db, id) => (db && db.byId.get(id) ? db.byId.get(id).name : String(id || '').replaceAll('_', ' '));

/** A shop's own 16x16 icon (shown pixelated), or the general shop icon if it has none. */
export function shopIconEl(shop) {
  const own = !!(shop && shop.icon);
  return el('img', { class: own ? 'shop-icon' : 'shop-icon shop-icon--default', src: own ? shop.icon : url('assets/shop-icon.png'), alt: '', width: 16, height: 16, decoding: 'async' });
}

/** "64× Oak Log", or just the name for one. */
export function amountText(db, id, n) {
  const name = itemName(db, id);
  return n && n !== 1 ? `${n}\u00d7 ${name}` : name;
}
/** A service shop (storage, lawsuits, a taxi) offers services written as text instead of Minecraft items. */
export const isService = (s) => !!s && s.kind === 'service';
/** What a line offers: "64× Oak Log" for an item, the text itself for a service. */
export const offerText = (db, p) => (p.service ? p.service : amountText(db, p.item, p.amount));

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
  return el('span', { class: 'price', title: label },
    el('span', { class: 'sr-only' }, label),
    el('span', { 'aria-hidden': 'true' }, String(p.price)),
    el('img', { class: 'price__icon', src: url('assets/diamond.png'), alt: '', width: 16, height: 16 }));
}

/** A stable anchor for a shop on the Shops page. */
export const shopSlug = (s) => String(s.label || 'shop').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
export const shopHref = (s) => url('shops/') + '#' + shopSlug(s);

/* ---- Item search -------------------------------------------------------------------- */

const VERB = { c: 'crafts into', f: 'smelts into', s: 'cuts into', m: 'upgrades to', t: 'turns into' };
const BIG_SLOT = 40;   // a slot that takes any of 40+ items (any wool, any planks of a huge tag) is too vague to follow twice

/** The items a query is about: every word must appear in the name. "logs" also tries "log". */
export function matchItems(db, query, limit = 60) {
  if (!db) return [];
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const variants = (w) => [w, w.replace(/es$/, ''), w.replace(/s$/, '')].filter((v, i, a) => v.length > 1 && a.indexOf(v) === i);
  const hit = (it) => words.every((w) => variants(w).some((v) => it.lower.includes(v) || it.id.includes(v)));
  const found = db.items.filter(hit);
  const q = words.join(' ');
  const rank = (it) => (it.lower === q ? 0 : it.lower.startsWith(q) ? 1 : 2) * 1000 + it.name.length;
  return found.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

const slotItems = (db, s) => (typeof s === 'string' ? db.tags[s.slice(1)] || [] : [s]);

/**
 * findShops(db, shops, query) -> [{shop, score, reason, direct}] best first.
 *   score 5: the shop's name matches     score 4: sells the item itself
 *   score 3: sells a part of it          score 2: sells a part of a part
 * Each shop appears once, with its best reason.
 */
export function findShops(db, shops, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const targets = matchItems(db, q);
  const best = new Map();
  const offer = (shop, score, reason, direct = null) => {
    const cur = best.get(shop);
    if (!cur || score > cur.score) best.set(shop, { shop, score, reason, direct });
  };

  // What each shop sells, by item index.
  const sells = new Map();
  for (const s of shops) {
    const set = new Map();
    for (const p of s.products || []) { const it = db && db.byId.get(p.item); if (it) set.set(it.i, p); }
    sells.set(s, set);
  }
  const name = (i) => db.items[i].name;

  // When the query names an item exactly ("chest"), only that item's parts count, not those of
  // everything with the word in it ("iron chestplate").
  const singular = q.replace(/s$/, '');
  const exact = targets.filter((t) => t.lower === q || t.lower === singular);
  const partTargets = exact.length ? exact : targets;
  // Reasons are lists of text and nodes (prices show the diamond icon); el() takes them as children.
  const lineText = (p) => { const price = priceEl(db, p); return [offerText(db, p), p.free ? ', free' : price ? [' for ', price] : ''].flat(); };
  const joinLines = (lines) => lines.flatMap((p, i) => (i ? [', ', ...lineText(p)] : lineText(p)));
  const words = q.split(/\s+/).filter(Boolean);

  for (const s of shops) {
    // A service matches on its own words ("ghast" finds "Ghast storage").
    const services = (s.products || []).filter((p) => p.service && words.every((w) => p.service.toLowerCase().includes(w)));
    if (services.length) offer(s, 4.5, ['Offers ', ...joinLines(services.slice(0, 2))], services[0]);
    if (isService(s) && words.every((w) => 'service'.startsWith(w) || 'services'.startsWith(w))) offer(s, 3, 'Offers services');
    const sold = sells.get(s);
    // Sells it outright (all the matching lines, a couple named).
    const direct = targets.filter((t) => sold.has(t.i)).map((t) => sold.get(t.i));
    const more = direct.length > 2 ? `, and ${direct.length - 2} more` : '';
    const directText = direct.length ? ['Sells ', ...joinLines(direct.slice(0, 2)), more] : '';
    if (s.label && s.label.toLowerCase().includes(q)) offer(s, 5, directText || (best.get(s) || {}).reason || '', direct[0] || null);
    if (direct.length) offer(s, 4 + (exact.some((t) => sold.has(t.i)) ? 0.5 : 0), directText, direct[0]);
    if (!sold.size || !targets.length || (best.get(s) || {}).score >= 4) continue;

    for (const t of partTargets) {
      if (sold.has(t.i)) continue;
      // Sells a part: something in one of its recipes. The more of the recipe the shop covers, the better.
      for (const [kind, , slots] of db.recipes.get(t.i) || []) {
        let covered = 0, part = null;
        for (const sl of slots) {
          const alts = slotItems(db, sl).filter((a) => a !== t.i);
          const got = alts.find((a) => sold.has(a));
          if (got != null) { covered++; part = part ?? got; }
        }
        if (part != null) offer(s, 3 + covered / slots.length / 2, `Sells ${name(part)}, which ${VERB[kind] || 'makes'} ${t.name}`);
      }
      if ((best.get(s) || {}).score >= 3) continue;
      // A part of a part (logs -> planks -> sticks).
      for (const [kind, , slots] of db.recipes.get(t.i) || []) {
        for (const sl of slots) {
          const alts = slotItems(db, sl);
          if (alts.length > BIG_SLOT) continue;
          for (const mid of alts) {
            if (mid === t.i) continue;
            for (const [kind2, , slots2] of db.recipes.get(mid) || []) {
              for (const sl2 of slots2) {
                const alts2 = slotItems(db, sl2);
                if (alts2.length > BIG_SLOT) continue;
                const got = alts2.find((a) => a !== t.i && a !== mid && sold.has(a));
                if (got != null) offer(s, 2, `Sells ${name(got)}, which ${VERB[kind2] || 'makes'} ${name(mid)}, for ${t.name}`);
              }
            }
          }
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.shop.label.localeCompare(b.shop.label));
}
