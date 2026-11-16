// Badges page: every community badge with its four tiers and who holds each, then a list of holders.
// Deep link: badges/#road_runner scrolls to one badge.
import { el, byId, faceEl, playerHref, url } from './ui.js?v=4d932c1e';
import { TIERS, iconEl, loadBadges } from './badges-core.js?v=dec7bc9f';

const tierTag = (tier) =>
  el('span', { class: `ttag ttag--${TIERS[tier - 1].toLowerCase()}` }, TIERS[tier - 1]);

const personLink = (name) =>
  el(
    'a',
    { class: 'bperson', href: playerHref(name), title: name },
    faceEl(name, 'sm'),
    el('span', {}, name),
  );

/** One badge: its gold icon and name on top, then the four tiers with what each takes and who is on it. */
function card(b, holders) {
  const onTier = (t) => holders.filter((h) => h.badges[b.id] === t).map((h) => h.name);
  const total = holders.filter((h) => h.badges[b.id]).length;
  const tiers = TIERS.map((_, i) => {
    const t = i + 1;
    const who = onTier(t);
    return el(
      'li',
      { class: 'tier' },
      el('span', { class: 'tier__icon' }, iconEl(b.id, t, 'pix')),
      el(
        'div',
        { class: 'tier__body' },
        tierTag(t),
        el('p', { class: 'tier__req' }, b.tiers[i] || ''),
        who.length ? el('div', { class: 'tier__who' }, who.map(personLink)) : null,
      ),
    );
  });
  return el(
    'li',
    { class: 'bcard', id: b.id },
    el(
      'div',
      { class: 'bcard__head' },
      el('span', { class: 'bcard__icon' }, iconEl(b.id, 3, 'pix')),
      el(
        'div',
        {},
        el(
          'p',
          { class: 'label eyebrow' },
          total ? `${total} ${total === 1 ? 'holder' : 'holders'}` : 'Badge',
        ),
        el('h2', {}, b.name),
        total
          ? el(
              'a',
              { class: 'small', href: `${url('players/')}?badge=${encodeURIComponent(b.id)}` },
              'Show in player list',
            )
          : null,
      ),
    ),
    el('ol', { class: 'tiers' }, tiers),
  );
}

/** One holder: face and name, then the icon of their highest tier for every badge they have. */
function holderRow(h, badges) {
  const icons = badges
    .filter((b) => h.badges[b.id])
    .map((b) => {
      const t = h.badges[b.id];
      const label = `${b.name}, ${TIERS[t - 1]}`;
      return el(
        'a',
        { class: 'hbadge', href: `#${b.id}`, title: label, 'aria-label': label },
        iconEl(b.id, t, 'pix'),
      );
    });
  return el(
    'li',
    { class: 'hrow' },
    el('a', { class: 'hrow__who', href: playerHref(h.name) }, faceEl(h.name), el('span', {}, h.name)),
    el('div', { class: 'hrow__badges' }, icons),
  );
}

async function main() {
  const data = await loadBadges();
  const badges = data.badges || [];
  const holders = data.holders || [];

  const grid = byId('bgrid');
  grid.replaceChildren(...badges.map((b) => card(b, holders)));
  grid.removeAttribute('aria-busy');

  byId('hlist').replaceChildren(...holders.map((h) => holderRow(h, badges)));
  byId('hnone').hidden = holders.length > 0;

  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

main();
