// Badges page: the community badges from the VoxelBadges plugin, who holds the most valuable set, and how
// each tier is earned. Everything comes from badges.json:
//   badges   the plugin's badges (id, name, and what each of the four tiers needs), as in its config.yml
//   players  per Minecraft name, the tier of each badge they hold (1 bronze … 4 diamond), as in badges.yml
//   points   what a badge is worth at each tier; a player's total decides their place on the board
// Like in game, a player only ever shows their highest tier of a badge.
import { el, byId as $, url, getJSON, faceEl, playerHref, bar, barLength } from './ui.js?v=4d932c1e';

const TIERS = ['bronze', 'silver', 'gold', 'diamond'];
const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Diamond'];
const pts = (n) => `${n} ${n === 1 ? 'point' : 'points'}`;

/** A badge's pixel art at a tier (1 to 4), the same 10x10 PNG the plugin uses. */
function iconEl(def, level, size = 'md') {
  return el('img', {
    class: `bicon bicon--${size}`,
    src: url(`assets/badges/community/${TIERS[level - 1]}_${def.id}.png`),
    alt: '',
    width: 10,
    height: 10,
  });
}

/** Everyone who holds a badge, most points first; equal points: more diamonds, then golds, and so on. */
function rank(defs, players, points) {
  const list = Object.entries(players)
    .map(([name, held]) => {
      const kinds = Object.entries(held || {})
        .filter(([id, level]) => defs.has(id) && level >= 1 && level <= 4)
        .sort(([a, x], [b, y]) => y - x || [...defs.keys()].indexOf(a) - [...defs.keys()].indexOf(b));
      const total = kinds.reduce((sum, [, level]) => sum + points[level - 1], 0);
      const levels = kinds.map(([, level]) => level).join('');
      return { name, kinds, points: total, levels };
    })
    .filter((h) => h.kinds.length)
    .sort((a, b) => b.points - a.points || b.levels.localeCompare(a.levels) || a.name.localeCompare(b.name));
  list.forEach((h, i) => (h.rank = i && list[i - 1].points === h.points ? list[i - 1].rank : i + 1));
  return list;
}

/** The badges someone holds, each at their highest tier. */
function minis(defs, h, size = 'sm') {
  return el(
    'span',
    { class: 'bmini' },
    h.kinds.map(([id, level]) =>
      el(
        'span',
        { class: 'bmini__item', title: `${defs.get(id).name}, ${TIER_NAMES[level - 1]}` },
        iconEl(defs.get(id), level, size),
      ),
    ),
  );
}

const summary = (h) => `${pts(h.points)} from ${h.kinds.length} ${h.kinds.length === 1 ? 'badge' : 'badges'}`;

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
      el('span', { class: 'small' }, summary(h)),
      minis(defs, h, 'md'),
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
  return [
    ...holders.filter((h) => h.rank === 1).map((h) => mvp(defs, h)),
    holders.some((h) => h.rank !== 1)
      ? el(
          'ul',
          { class: 'plist' },
          holders.filter((h) => h.rank !== 1).map((h) => row(defs, h, max)),
        )
      : null,
  ];
}

/** One badge: its four tiers, what each needs and is worth, and who holds it at which tier. */
function card(def, players, points) {
  const holders = Object.entries(players)
    .map(([name, held]) => [name, (held || {})[def.id] || 0])
    .filter(([, level]) => level >= 1 && level <= 4)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return el(
    'li',
    { class: 'card bcard', id: def.id },
    el('div', { class: 'bcard__top' }, iconEl(def, 3, 'lg'), el('h3', {}, def.name)),
    el(
      'ol',
      { class: 'btiers' },
      def.tiers.map((need, i) =>
        el(
          'li',
          { class: 'btier' },
          iconEl(def, i + 1, 'md'),
          el(
            'span',
            { class: 'btier__text' },
            el('span', { class: 'btier__name' }, TIER_NAMES[i]),
            el('span', { class: 'small' }, need),
          ),
          el('span', { class: 'btier__pts small' }, pts(points[i])),
        ),
      ),
    ),
    el(
      'div',
      { class: 'bcard__foot small' },
      holders.length
        ? holders.map(([name, level]) =>
            el(
              'a',
              { class: 'bholder', href: playerHref(name), title: `${name}, ${TIER_NAMES[level - 1]}` },
              faceEl(name, 'sm'),
              iconEl(def, level, 'sm'),
            ),
          )
        : 'Nobody has this one yet',
    ),
  );
}

getJSON('badges.json', null)
  .then((data) => {
    if (!data) throw new Error('No badges.json');
    const points = data.points || [1, 2, 3, 5];
    const players = data.players || {};
    const defs = new Map(data.badges.map((b) => [b.id, b]));
    $('board').replaceChildren(...board(defs, rank(defs, players, points)));
    $('blist').replaceChildren(...data.badges.map((d) => card(d, players, points)));
  })
  .catch((e) => {
    console.error(e);
    $('board').replaceChildren(
      el('p', { class: 'empty' }, "The badges couldn't load. Try again in a moment."),
    );
    $('blist').replaceChildren();
  });
