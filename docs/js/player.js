// One player's page: face, status, a few fun numbers, when they play, who they play with,
// where their base and shop are, and what they achieved lately. Opened as player/?name=Name.
import { loadStats } from './data.js';
import { raceBlock } from './race.js';
import { shopIconEl, shopHref } from './shops-core.js';
import { el, url, faceEl, playerHref, fmtInt, fmtHours, relTime, hourLabel, widthClass, heightClass, lastSeen } from './ui.js';

const $ = (id) => document.getElementById(id);
const name = new URLSearchParams(location.search).get('name') || '';

async function getJSON(path, fallback) {
  try { const r = await fetch(url(path), { cache: 'no-cache' }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

const pinIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12 22C12 22 4.5 14.5 4.5 9.5a7.5 7.5 0 0 1 15 0C19.5 14.5 12 22 12 22Z"/><circle cx="12" cy="9.5" r="2.5"/>';
  return svg;
};

const mapHref = (x, z) => `${url('map/')}?x=${Math.round(x)}&z=${Math.round(z)}&zoom=12`;
const center = (pts) => {
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
};

function missing(page) {
  document.title = 'Player not found · Voxel';
  page.replaceChildren(el('div', { class: 'page-head' },
    el('h1', {}, 'No player by that name'),
    el('p', { class: 'small' }, name ? `We have not seen ${name} on the server.` : 'Pick someone from the list.')),
  el('a', { class: 'btn', href: url('players/') }, 'See all players'));
}

function tile(num, label, extra) {
  return el('div', { class: 'card tile' }, el('span', { class: 'num' }, num), el('p', { class: 'small' }, label), extra ? el('p', { class: 'small' }, extra) : null);
}

function render(st, places) {
  const page = $('page');
  const p = st.players[name];
  if (!p) return missing(page);
  document.title = `${p.name} · Voxel`;

  const hero = el('section', { class: 'page-head' },
    el('p', {}, el('a', { class: 'back', href: url('players/') }, '← All players')),
    el('div', { class: 'phero' },
      el('span', { class: 'pface' }, faceEl(p.name, 'xl')),
      el('div', { class: 'phero__who' },
        el('h1', {}, p.name),
        el('div', { class: 'status' },
          el('span', { class: 'small' }, `Last seen ${lastSeen(p.lastEnd)}`),
          st.meta && st.meta.generated_at ? el('span', { class: 'small' }, ` · stats updated ${relTime(st.meta.generated_at)}`) : null))),
    p.badges.length ? el('div', { class: 'badges' }, p.badges.map((b) => el('span', { class: 'badge' },
      el('span', { class: 'badge__icon' }, el('img', { src: url(`assets/badges/${b.toLowerCase().replace(/[^a-z]+/g, '-')}.svg`), alt: '' })), b))) : null);

  const cause = p.topCause ? `mostly ${p.topCause.toLowerCase()}` : null;
  const tiles = el('div', { class: 'tiles tiles--2' },
    tile(fmtHours(p.hours), 'played', `#${p.rank} of ${Object.keys(st.players).length}`),
    tile(fmtInt(p.deaths), p.deaths === 1 ? 'death' : 'deaths', cause));

  // Two columns on a wide screen (one below the other on a phone): rhythm and time on the left, the rest on the right.
  const left = [], right = [];

  // When they play
  const max = Math.max(...p.byHour) || 1;
  if (p.favHour != null) {
    left.push(el('div', { class: 'card' },
      el('p', { class: 'label' }, 'When they play'),
      el('div', { class: 'rhythm', role: 'img', 'aria-label': `Usually online around ${hourLabel(p.favHour)}.` },
        p.byHour.map((m, h) => el('i', { class: (h === p.favHour ? 'top ' : '') + heightClass(Math.max(3, (m / max) * 100)), title: hourLabel(h) }))),
      el('div', { class: 'rhythm-axis small', 'aria-hidden': 'true' }, ['00', '06', '12', '18', '24'].map((t) => el('span', {}, t))),
      el('p', { class: 'small mt-2' }, `Usually around ${hourLabel(p.favHour)}, Dutch time.`)));
  }

  // Time online: the logged time split into active (teal), AFK (light teal) and admin work (yellow).
  if (p.loggedMin > 0) {
    const parts = [['active', 'Active', p.minutes], ['afk', 'AFK', p.afkMin], ['admin', 'Admin', p.adminMin]].filter(([, , m]) => m > 0);
    let left100 = 100;
    const widths = parts.map(([, , m], i) => { const w = i === parts.length - 1 ? left100 : Math.round((m / p.loggedMin) * 100); left100 -= w; return w; });
    left.push(el('div', { class: 'card' },
      el('p', { class: 'label' }, 'Time online'),
      el('div', { class: 'tbar', role: 'img', 'aria-label': parts.map(([, name, m]) => `${name} ${fmtHours(m / 60)}`).join(', ') },
        parts.map(([k], i) => el('i', { class: `tbar__seg tbar__seg--${k} ${widthClass(widths[i])}` }))),
      el('ul', { class: 'tlegend' }, parts.map(([k, name, m]) =>
        el('li', {}, el('i', { class: `tbar__seg tbar__seg--${k}` }), el('span', {}, name), el('span', { class: 'tlegend__value' }, fmtHours(m / 60)))))));
  }

  // Places: borders owned by this player, and their shops
  if (places.length) {
    left.push(el('div', { class: 'card' },
      el('p', { class: 'label' }, 'Places'),
      el('div', { class: 'mt-2' }, places.map((pl) =>
        el('div', { class: 'place' },
          el('span', { class: 'place__icon' }, pl.kind === 'shop' ? shopIconEl(pl.shop) : pinIcon()),
          el('div', {}, el('strong', {}, pl.label), el('p', { class: 'small' }, `${pl.kind === 'shop' ? 'Shop' : 'Base'}, X ${Math.round(pl.x)}, Z ${Math.round(pl.z)}`)),
          el('span', { class: 'place__links' },
            pl.kind === 'shop' ? el('a', { href: shopHref(pl.shop) }, 'Shop') : null,
            el('a', { href: pl.href }, 'Map')))))));
  }

  // Plays with: each bar is that partner's share of their time, out of 100%
  if (p.buddies.length) {
    const withOthers = Math.round(p.togetherShare * 100);
    right.push(el('div', { class: 'card' },
      el('p', { class: 'label' }, 'Plays with'),
      el('div', { class: 'split', role: 'img', 'aria-label': `${withOthers}% of their time with others, ${100 - withOthers}% on their own` },
        el('i', { class: widthClass(withOthers) })),
      el('p', { class: 'small split__caption' }, `${withOthers}% with others, ${100 - withOthers}% on their own`),
      el('ul', { class: 'arows' }, p.buddies.map((b) =>
        el('li', {}, el('a', { class: 'brow', href: playerHref(b.name) }, faceEl(b.name),
          el('span', { class: 'pcard__body' },
            el('span', { class: 'pcard__top' }, el('span', { class: 'pcard__name' }, b.name), el('span', { class: 'pcard__value' }, fmtHours(b.hours))),
            el('span', { class: 'pbar', 'aria-hidden': 'true' }, el('i', { class: widthClass(b.share) })),
            el('span', { class: 'small' }, `${b.share}% of their time`))))))));
  }

  // Advancements: the count lives here, with the rarest and the latest few
  const recent = [...p.adv].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);
  if (recent.length) {
    right.push(el('div', { class: 'card' },
      el('p', { class: 'label' }, 'Advancements'),
      el('div', { class: 'adv-head' },
        el('span', { class: 'num' }, fmtInt(p.advPoints)),
        el('span', { class: 'small' }, `points from ${p.adv.length} ${p.adv.length === 1 ? 'advancement' : 'advancements'}`)),
      p.rarest ? el('p', { class: 'small mt-1' }, `Rarest: ${p.rarest.name}`) : null,
      ...raceBlock(st, { focus: p.name, heading: 'Compared with the leaders' }),
      el('p', { class: 'label mt-4' }, 'Latest'),
      el('ul', { class: 'arows mt-1' }, recent.map((a) =>
        el('li', { class: 'arow' },
          el('div', { class: 'arow__name' }, a.name, el('p', { class: 'small' }, a.earners === 1 ? 'Only they have it' : `${a.earners} players have it`)),
          el('span', { class: 'small' }, `+${a.points} \u00b7 ${relTime(a.at)}`))))));
  }

  page.replaceChildren(hero, tiles, el('div', { class: 'psection pgrid' }, el('div', { class: 'pcol' }, left), el('div', { class: 'pcol' }, right)));
}

async function placesFor(player) {
  const [borders, shops] = await Promise.all([getJSON('borders.json', []), getJSON('shops.json', [])]);
  const out = [];
  for (const b of borders) if ((b.owners || []).includes(player) && b.points?.length) out.push({ kind: 'base', label: b.label || 'Base', ...center(b.points), href: '' });
  for (const s of shops) if (s.owner === player) out.push({ kind: 'shop', label: s.label || 'Shop', x: s.x, z: s.z, href: '', shop: s });
  for (const o of out) o.href = mapHref(o.x, o.z);
  return out;
}

Promise.all([loadStats(), placesFor(name)]).then(([st, places]) => render(st, places)).catch((e) => {
  console.error(e);
  $('page').replaceChildren(el('p', { class: 'small pad-block-5' }, "This page couldn't load. Try again in a moment."));
});
