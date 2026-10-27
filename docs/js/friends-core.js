/* Who knows who: the ring chart. Mathijs in the middle, the people he knows on the first ring, the people they
   brought in on the outer ring. Groups are soft shapes that reach the middle, couples a line with a heart,
   siblings a dotted line. Shared by the homepage preview and the friends page. Data: data/friends.json. */
import { svgEl, url } from './ui.js?v=4d932c1e';

const C = 350;
const R1 = 168;
const R2 = 284;
const SIZE = { 0: 64, 1: 42, 2: 38 };
// Ring-to-ring links bow outward a little, so they don't cut through faces.
const BOW = 1.12;
// Smallest gap between neighbours on the outer ring (radians).
const OUTER_GAP = 0.3;
// How far a dashed outline (the flatmates) sits outside its members.
const OUTLINE_PAD = 46;
export const HEART =
  'M0,6 C-9,0 -7,-7 -3.5,-6.5 C-1.5,-6.2 -0.5,-4.8 0,-3.8 C0.5,-4.8 1.5,-6.2 3.5,-6.5 C7,-7 9,0 0,6 Z';
const REL_WORD = { siblings: 'sibling of', married: 'married to', couple: 'together with' };

const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
const pairKey = (a, b) => [a, b].sort().join('|');

/** Convex hull (monotone chain). */
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  const up = [];
  for (const p of pts) {
    while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop();
    lo.push(p);
  }
  for (const p of pts.reverse()) {
    while (up.length > 1 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** A hull grown outward by pad, with rounded corners. */
function roundOutline(h, pad) {
  const out = [];
  for (let i = 0; i < h.length; i++) {
    const p = h[(i - 1 + h.length) % h.length];
    const c = h[i];
    const n = h[(i + 1) % h.length];
    const n1 = Math.atan2(c[1] - p[1], c[0] - p[0]) - Math.PI / 2;
    let n2 = Math.atan2(n[1] - c[1], n[0] - c[0]) - Math.PI / 2;
    while (n2 > n1) n2 -= 2 * Math.PI;
    const end = n1 - n2 > Math.PI ? n2 + 2 * Math.PI : n2;
    for (let k = 0; k <= 6; k++) {
      const a = n1 + ((end - n1) * k) / 6;
      out.push([c[0] + pad * Math.cos(a), c[1] + pad * Math.sin(a)]);
    }
  }
  return out;
}
const pathOf = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L') + ' Z';

/**
 * Builds the chart. Returns { svg, place, select, setNames, ... }. Call place() once the svg is in the page
 * (labels are measured), and again after the web font loads.
 */
export function friendsChart(data, { names = 'real', interactive = true, onSelect = () => {} } = {}) {
  const people = data.people.map((p) => ({ ...p }));
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const me = byId.me;
  let nameMode = names;
  const shown = (p) => (nameMode === 'real' ? p.name : p.label);
  const other = (p) => (nameMode === 'real' ? p.label : p.name);

  /* ---- Layout ---- */
  const direct = (p) => p.via.length === 1 && p.via[0] === 'me';
  const ring1 = people.filter(direct);
  const ring2 = people.filter((p) => p.id !== 'me' && !direct(p));
  ring1.forEach((p, i) =>
    Object.assign(p, { a: -Math.PI / 2 + (i * 2 * Math.PI) / ring1.length, r: R1, step: 1 }),
  );
  Object.assign(me, { a: 0, r: 0, step: 0 });
  // Outer ring: at the average angle of whoever brought them in, then pushed apart.
  for (const p of ring2) {
    const ps = p.via.map((v) => byId[v]).filter((q) => q.r > 0);
    p.a = Math.atan2(
      ps.reduce((t, q) => t + Math.sin(q.a), 0),
      ps.reduce((t, q) => t + Math.cos(q.a), 0),
    );
    Object.assign(p, { r: R2, step: 2 });
  }
  ring2.sort((x, y) => x.a - y.a);
  for (let k = 0; k < 200; k++) {
    let moved = false;
    for (let i = 0; i < ring2.length; i++) {
      const a = ring2[i];
      const b = ring2[(i + 1) % ring2.length];
      const d = b.a - a.a + (i === ring2.length - 1 ? 2 * Math.PI : 0);
      if (d < OUTER_GAP) {
        a.a -= (OUTER_GAP - d) / 2;
        b.a += (OUTER_GAP - d) / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const p of people) {
    p.s = SIZE[p.step];
    [p.x, p.y] = polar(p.r, p.a);
  }

  /* ---- Drawing ---- */
  const svg = svgEl('svg', {
    class: 'fc',
    viewBox: '0 0 700 700',
    role: 'img',
    'aria-label': 'Who knows who',
  });
  const layer = () => svg.appendChild(svgEl('g', {}));
  svg.append(
    svgEl('circle', { cx: C, cy: C, r: R1, class: 'fc-ring' }),
    svgEl('circle', { cx: C, cy: C, r: R2, class: 'fc-ring' }),
  );
  const blobG = layer();
  const edgeG = layer();
  const relG = layer();
  const nodeG = layer();
  const labelG = layer();
  const dimmable = []; // { ids, els }: dims unless it involves the selected person

  const groupHas = (g, id) => g.members.includes(id) || (id === 'me' && !!g.withMe);
  for (const g of data.groups) {
    const members = people.filter((p) => groupHas(g, p.id));
    let pts = hull(members.map((p) => [p.x, p.y]));
    if (g.outline) pts = roundOutline(pts, OUTLINE_PAD);
    const e = blobG.appendChild(svgEl('path', { d: pathOf(pts), class: `fc-blob fc-blob--${g.cls}` }));
    dimmable.push({ ids: members.map((p) => p.id), els: [e] });
  }

  // A couple line replaces the normal link between those two.
  const coupled = new Set(
    data.rels
      .filter((r) => r.kind !== 'siblings')
      .flatMap((r) => r.members.slice(1).map((m, i) => pairKey(r.members[i], m))),
  );
  const edges = [];
  for (const p of people) {
    for (const v of p.via) {
      if (coupled.has(pairKey(p.id, v))) continue;
      const q = byId[v];
      let d = `M${q.x},${q.y} L${p.x},${p.y}`;
      if (v !== 'me' && p.step === 2) {
        const mx = (q.x + p.x) / 2;
        const my = (q.y + p.y) / 2;
        d = `M${q.x},${q.y} Q${C + (mx - C) * BOW},${C + (my - C) * BOW} ${p.x},${p.y}`;
      }
      const e = edgeG.appendChild(
        svgEl('path', { d, class: `fc-edge fc-edge--${v === 'me' ? 'direct' : 'via'}` }),
      );
      edges.push({ from: v, to: p.id, e });
    }
  }

  for (const r of data.rels) {
    const els = [];
    for (let i = 0; i + 1 < r.members.length; i++) {
      const a = byId[r.members[i]];
      const b = byId[r.members[i + 1]];
      els.push(
        relG.appendChild(
          svgEl('path', { d: `M${a.x},${a.y} L${b.x},${b.y}`, class: `fc-rel fc-rel--${r.kind}` }),
        ),
      );
      if (r.kind !== 'siblings') {
        const t = a.id === 'me' ? 0.54 : 0.5;
        const hx = a.x + (b.x - a.x) * t;
        const hy = a.y + (b.y - a.y) * t;
        els.push(
          relG.appendChild(
            svgEl('path', { d: HEART, transform: `translate(${hx},${hy}) scale(1.25)`, class: 'fc-heart' }),
          ),
        );
      }
    }
    dimmable.push({ ids: r.members, els });
  }

  for (const p of people) {
    const h = p.s / 2;
    const g = nodeG.appendChild(svgEl('g', { class: 'fc-node', transform: `translate(${p.x},${p.y})` }));
    if (p.mc) {
      g.append(
        svgEl('rect', { x: -h, y: -h, width: p.s, height: p.s, class: 'fc-frame' }),
        svgEl('image', {
          href: url('faces/' + encodeURIComponent(p.mc) + '.png'),
          x: -h + 2,
          y: -h + 2,
          width: p.s - 4,
          height: p.s - 4,
          class: 'fc-face',
        }),
      );
    } else {
      g.append(
        svgEl('rect', { x: -h, y: -h, width: p.s, height: p.s, class: 'fc-frame fc-frame--ghost' }),
        svgEl('text', { x: 0, y: 0, class: 'fc-initial' }, p.name[0]),
      );
    }
    p.g = g;
    p.lab = labelG.appendChild(
      svgEl('text', { class: 'fc-name' + (p.step ? '' : ' fc-name--me') }, shown(p)),
    );
    if (interactive) {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', p.name === p.label ? p.name : `${p.name} (${p.label})`);
      const pick = (e) => {
        e.stopPropagation();
        select(p.id);
      };
      g.addEventListener('click', pick);
      p.lab.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        pick(e);
      });
    }
  }

  /* ---- Labels: the first free spot around their face, never closer to someone else's face ---- */
  function place() {
    const near = people.map((p) => {
      const h = p.s / 2 + 7;
      return [p.x - h, p.y - h, p.x + h, p.y + h];
    });
    const overlap = (a, b) =>
      Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const gap = (box, q) => {
      const r = q.s / 2;
      return Math.hypot(
        Math.max(0, box[0] - q.x - r, q.x - r - box[2]),
        Math.max(0, box[1] - q.y - r, q.y - r - box[3]),
      );
    };
    const placed = [];
    for (const p of [...people].sort((a, b) => a.step - b.step)) {
      const h = p.s / 2;
      const w = p.lab.getComputedTextLength() + 6;
      const lh = p.step ? 17 : 24;
      const out = p.x >= C ? 1 : -1;
      const below = p.y + h + 3 + lh / 2;
      const above = p.y - h - 3 - lh / 2;
      const side = h + 5 + w / 2;
      const shift = w / 2 - h;
      const spots = [
        [p.x, below],
        [p.x, above],
        [p.x + out * side, p.y],
        [p.x - out * side, p.y],
        [p.x + out * shift, below],
        [p.x - out * shift, below],
        [p.x + out * shift, above],
        [p.x - out * shift, above],
      ];
      let best = null;
      let bestCost = Infinity;
      for (const [cx, cy] of spots) {
        const box = [cx - w / 2, cy - lh / 2, cx + w / 2, cy + lh / 2];
        let cost = 0;
        near.forEach((b, i) => {
          const o = people[i] === p ? 0 : overlap(box, b);
          cost += o + (o > 0 ? 60 : 0);
        });
        placed.forEach((b) => (cost += overlap(box, b) * 2));
        const own = gap(box, p);
        for (const q of people) if (q !== p && gap(box, q) < own + 4) cost += 3000;
        if (box[0] < 4 || box[2] > 696 || box[1] < 4 || box[3] > 696) cost += 5000;
        if (cost < bestCost - 1) {
          bestCost = cost;
          best = box;
        }
        if (cost === 0) break;
      }
      placed.push(best);
      p.lab.setAttribute('x', ((best[0] + best[2]) / 2).toFixed(1));
      p.lab.setAttribute('y', ((best[1] + best[3]) / 2).toFixed(1));
    }
  }

  /* ---- Paths and selection ---- */
  const paths = (id) =>
    id === 'me' ? [['me']] : byId[id].via.flatMap((v) => paths(v).map((t) => [id, ...t]));
  let current = null;
  function select(id) {
    current = current === id ? null : id;
    const ps = current ? paths(current) : [];
    const on = new Set(ps.flat());
    const hot = new Set(ps.flatMap((t) => t.slice(1).map((v, i) => t[i] + '>' + v)));
    if (current) {
      for (const p of people) {
        if (p.via.includes(current)) {
          on.add(p.id);
          hot.add(p.id + '>' + current);
        }
      }
    }
    for (const p of people) {
      p.g.classList.toggle('is-dim', !!current && !on.has(p.id));
      p.lab.classList.toggle('is-dim', !!current && !on.has(p.id));
    }
    for (const x of edges) {
      const lit = hot.has(x.to + '>' + x.from);
      x.e.classList.toggle('is-dim', !!current && !lit);
      x.e.classList.toggle('is-hot', lit);
    }
    for (const x of dimmable)
      for (const e of x.els) e.classList.toggle('is-dim', !!current && !x.ids.includes(current));
    onSelect(current);
  }
  if (interactive) svg.addEventListener('click', () => current && select(current));

  function setNames(mode) {
    nameMode = mode;
    for (const p of people) p.lab.textContent = shown(p);
    place();
  }

  /** "the band" when everyone who brought this person in is one group. */
  function viaGroup(p) {
    if (p.via.length < 2) return null;
    const g = data.groups.find((g) => !g.members.includes(p.id) && p.via.every((v) => g.members.includes(v)));
    return g ? g.name.charAt(0).toLowerCase() + g.name.slice(1) : null;
  }
  /** The path to the middle in words: "Tyler → Iris → Mathijs". */
  function route(p) {
    const vg = viaGroup(p);
    if (vg) return [`${shown(p)} → ${vg} → ${shown(me)}`];
    return paths(p.id).map((t) => t.map((id) => shown(byId[id])).join(' → '));
  }
  /** Groups and family for the card: [{ text, kind }]. */
  function tags(p) {
    const out = data.groups.filter((g) => groupHas(g, p.id)).map((g) => ({ text: g.name, kind: g.cls }));
    for (const r of data.rels) {
      if (!r.members.includes(p.id)) continue;
      const others = r.members.filter((id) => id !== p.id).map((id) => shown(byId[id]));
      out.push({
        text: `${REL_WORD[r.kind]} ${others.join(' & ')}`,
        kind: r.kind === 'siblings' ? 'family' : 'love',
      });
    }
    return out;
  }

  return {
    svg,
    place,
    select,
    setNames,
    people,
    byId,
    me,
    shown,
    other,
    route,
    tags,
    counts: {
      direct: ring1.length + ring2.filter((p) => p.via.includes('me')).length,
      via: ring2.filter((p) => !p.via.includes('me')).length,
    },
  };
}
