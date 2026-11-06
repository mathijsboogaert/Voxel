// Badges page: the community badges, who holds the most valuable set, and how each one is earned.
// Everything comes from badges.json, written by hand: `badges` (what can be earned, worth how many points)
// and `awards` (who earned which one, for what, when). A badge can be earned more than once.
import { el, byId as $, url, getJSON, faceEl, playerHref, bar, barLength, fmtDay } from './ui.js?v=4d932c1e';

const iconSrc = (id) => url(`assets/badges/community/${id}.svg`);
const pts = (n) => `${n} ${n === 1 ? 'point' : 'points'}`;

/** A badge's icon. Without an icon file it falls back to the badge's first letter. */
function iconEl(def) {
  const img = el('img', { src: iconSrc(def.id), alt: '' });
  img.addEventListener(
    'error',
    () => img.replaceWith(el('span', { class: 'bicon__letter' }, def.name.charAt(0))),
    { once: true },
  );
  return img;
}

/**
 * Everyone who holds a badge, most points first. Equal points: more badges first, then whoever got
 * there first. Players with the same points share a rank.
 */
function rank(defs, awards) {
  const by = new Map();
  for (const a of awards) {
    const def = defs.get(a.badge);
    if (!def || !a.player) continue;
    const h = by.get(a.player) || { name: a.player, points: 0, count: 0, kinds: new Map(), last: '' };
    h.points += def.points;
    h.count += 1;
    h.kinds.set(def.id, (h.kinds.get(def.id) || 0) + 1);
    if ((a.date || '') > h.last) h.last = a.date || '';
    by.set(a.player, h);
  }
  const list = [...by.values()].sort(
    (a, b) => b.points - a.points || b.count - a.count || a.last.localeCompare(b.last),
  );
  list.forEach((h, i) => (h.rank = i && list[i - 1].points === h.points ? list[i - 1].rank : i + 1));
  return list;
}

/** The small icons of what someone holds, with a count when they earned one more than once. */
function minis(defs, h) {
  return el(
    'span',
    { class: 'bmini' },
    [...h.kinds].map(([id, n]) =>
      el(
        'span',
        { class: 'bmini__item', title: defs.get(id).name },
        el('span', { class: 'bicon bicon--sm' }, iconEl(defs.get(id))),
        n > 1 ? el('span', { class: 'small' }, `×${n}`) : null,
      ),
    ),
  );
}

function mvp(defs, h) {
  return el(
    'a',
    { class: 'card card--leaf bmvp', href: playerHref(h.name) },
    el('span', { class: 'pface' }, faceEl(h.name, 'xl')),
    el(
      'span',
      { class: 'bmvp__body' },
      el('span', { class: 'label eyebrow' }, 'Most valuable badge holder'),
      el('span', { class: 'bmvp__name' }, h.name),
      el(
        'span',
        { class: 'small' },
        `${pts(h.points)} from ${h.count} ${h.count === 1 ? 'badge' : 'badges'}`,
      ),
      minis(defs, h),
    ),
  );
}

function row(defs, h, max) {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'pcard', href: playerHref(h.name) },
      el('span', { class: 'pface' }, faceEl(h.name, 'lg')),
      el(
        'span',
        { class: 'pcard__body' },
        el(
          'span',
          { class: 'pcard__top' },
          el('span', { class: 'pcard__name' }, `${h.rank}. ${h.name}`),
          el('span', { class: 'pcard__value' }, pts(h.points)),
        ),
        el('span', { class: 'pbar', 'aria-hidden': 'true' }, bar(barLength(h.points, max))),
        minis(defs, h),
      ),
    ),
  );
}

function board(defs, holders) {
  if (!holders.length) {
    return [
      el(
        'div',
        { class: 'card card--leaf bempty' },
        el('p', { class: 'bempty__title' }, 'Nobody has a badge yet'),
        el('p', { class: 'small' }, 'Build something for everyone and you could be first on this board.'),
      ),
    ];
  }
  const max = holders[0].points;
  const top = holders.filter((h) => h.rank === 1);
  const rest = holders.filter((h) => h.rank !== 1);
  return [
    ...top.map((h) => mvp(defs, h)),
    rest.length
      ? el(
          'ul',
          { class: 'plist' },
          rest.map((h) => row(defs, h, max)),
        )
      : null,
  ];
}

function card(def, awards) {
  const mine = awards.filter((a) => a.badge === def.id);
  const names = [...new Set(mine.map((a) => a.player))];
  const latest = mine.reduce((a, b) => ((b.date || '') > (a.date || '') ? b : a), mine[0]);
  return el(
    'li',
    { class: 'card bcard', id: def.id },
    el(
      'div',
      { class: 'bcard__top' },
      el('span', { class: 'bicon' }, iconEl(def)),
      el(
        'div',
        { class: 'bcard__title' },
        el('h3', {}, def.name),
        el('span', { class: 'tag tag--amber' }, pts(def.points)),
      ),
    ),
    el('p', {}, def.how),
    el(
      'div',
      { class: 'bcard__foot small' },
      mine.length
        ? [
            el(
              'span',
              { class: 'bcard__faces' },
              names.map((n) => faceEl(n, 'sm')),
            ),
            el(
              'span',
              {},
              `Earned ${mine.length === 1 ? 'once' : `${mine.length} times`}` +
                (latest && latest.date
                  ? `, latest by ${latest.player} on ${fmtDay(latest.date)}` +
                    (latest.for ? ` (${latest.for})` : '')
                  : ''),
            ),
          ]
        : 'Not earned yet',
    ),
  );
}

getJSON('badges.json', null)
  .then((data) => {
    if (!data) throw new Error('No badges.json');
    const defs = new Map(data.badges.map((b) => [b.id, b]));
    const awards = (data.awards || []).filter((a) => defs.has(a.badge));
    $('board').replaceChildren(...board(defs, rank(defs, awards)));
    $('blist').replaceChildren(...data.badges.map((d) => card(d, awards)));
  })
  .catch((e) => {
    console.error(e);
    $('board').replaceChildren(
      el('p', { class: 'empty' }, "The badges couldn't load. Try again in a moment."),
    );
    $('blist').replaceChildren();
  });
