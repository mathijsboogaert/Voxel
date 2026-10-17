// The brand's pattern grammar as SVG: a square grid, cut by quarter circles, outlined in a bold line.
// Four building blocks, always on a 64px module and outlined at stroke-4, per the brand guide.
// Decorative only: callers put it where no text sits on top of it.

const NS = 'http://www.w3.org/2000/svg';
const fill = (c) => `fill:var(--${c});stroke:var(--line);stroke-width:4;stroke-linejoin:miter`;
const CELL = 64, IN = 2, FAR = CELL - IN; // outline sits half a stroke inside the cell

// Each block: list of [tag, attributes, color]
const BLOCKS = {
  square: () => [['rect', { x: IN, y: IN, width: CELL - 2 * IN, height: CELL - 2 * IN }, 'teal']],
  disc: (c = 'rust') => [
    ['rect', { x: IN, y: IN, width: CELL - 2 * IN, height: CELL - 2 * IN }, 'teal'],
    ['path', { d: `M${IN} ${FAR} V${IN} A${FAR - IN} ${FAR - IN} 0 0 1 ${FAR} ${FAR} Z` }, c],
  ],
  leaf: () => [
    ['rect', { x: IN, y: IN, width: CELL - 2 * IN, height: CELL - 2 * IN }, 'teal'],
    ['path', { d: `M${IN} ${FAR} A${FAR - IN} ${FAR - IN} 0 0 1 ${FAR} ${IN} A${FAR - IN} ${FAR - IN} 0 0 1 ${IN} ${FAR} Z` }, 'orange'],
  ],
  cut: () => [
    ['rect', { x: IN, y: IN, width: CELL - 2 * IN, height: CELL - 2 * IN }, 'amber'],
    ['path', { d: `M${IN} ${IN} H${FAR} V${FAR} A${FAR - IN} ${FAR - IN} 0 0 1 ${IN} ${IN} Z` }, 'teal'],
  ],
};

/**
 * pattern(['square', 'disc@90', 'leaf', 'cut@180'], {rows: 1})
 * One string per cell, optionally rotated with @90/@180/@270; cells fill rows left to right.
 */
export function pattern(spec, { rows = 1 } = {}) {
  const cols = Math.ceil(spec.length / rows);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cols * CELL} ${rows * CELL}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.overflow = 'visible';
  spec.forEach((item, i) => {
    const [kind, rot = '0'] = item.split('@');
    const parts = kind === 'disc-amber' ? BLOCKS.disc('amber') : BLOCKS[kind]();
    const g = document.createElementNS(NS, 'g');
    const x = (i % cols) * CELL, y = Math.floor(i / cols) * CELL;
    g.setAttribute('transform', `translate(${x} ${y}) rotate(${rot} ${CELL / 2} ${CELL / 2})`);
    for (const [tag, attrs, color] of parts) {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      n.setAttribute('style', fill(color));
      g.append(n);
    }
    svg.append(g);
  });
  return svg;
}
