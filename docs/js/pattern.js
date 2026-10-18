// The brand's pattern grammar as SVG: a square grid, cut by quarter circles, outlined in a bold line.
// Four building blocks on a 64px module, every line stroke-4, per the brand guide.
// Fills are drawn first with no outline, then all the lines on top, so the grid lines and the arcs
// come out the same thickness (outlining each cell separately doubled the lines between cells).
// Decorative only: callers put it where no text sits on top of it.

const NS = 'http://www.w3.org/2000/svg';
const CELL = 64, STROKE = 4;
const R = CELL;

// Each block: fills (drawn under the lines) and arcs (the curved lines), in cell coordinates.
const BLOCKS = {
  square: () => ({ fills: [['rect', { width: CELL, height: CELL }, 'teal']], lines: [] }),
  disc: (c = 'rust') => ({
    fills: [
      ['rect', { width: CELL, height: CELL }, 'teal'],
      ['path', { d: `M0 ${CELL} V0 A${R} ${R} 0 0 1 ${CELL} ${CELL} Z` }, c],
    ],
    lines: [`M0 0 A${R} ${R} 0 0 1 ${CELL} ${CELL}`],
  }),
  leaf: () => ({
    fills: [
      ['rect', { width: CELL, height: CELL }, 'teal'],
      ['path', { d: `M0 ${CELL} A${R} ${R} 0 0 1 ${CELL} 0 A${R} ${R} 0 0 1 0 ${CELL} Z` }, 'orange'],
    ],
    lines: [`M0 ${CELL} A${R} ${R} 0 0 1 ${CELL} 0`, `M${CELL} 0 A${R} ${R} 0 0 1 0 ${CELL}`],
  }),
  cut: () => ({
    fills: [
      ['rect', { width: CELL, height: CELL }, 'amber'],
      ['path', { d: `M0 0 H${CELL} V${CELL} A${R} ${R} 0 0 1 0 0 Z` }, 'teal'],
    ],
    lines: [`M${CELL} ${CELL} A${R} ${R} 0 0 1 0 0`],
  }),
};

const make = (tag, attrs = {}, cls) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (cls) n.setAttribute('class', cls);
  return n;
};

/**
 * pattern(['square', 'disc@90', 'leaf', 'cut@180'], {rows: 1})
 * One string per cell, optionally rotated with @90/@180/@270; cells fill rows left to right.
 */
export function pattern(spec, { rows = 1 } = {}) {
  const cols = Math.ceil(spec.length / rows);
  const W = cols * CELL, H = rows * CELL;
  const svg = make('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
  svg.setAttribute('class', 'pattern');

  const fills = make('g'), arcs = make('g');
  spec.forEach((item, i) => {
    const [kind, rot = '0'] = item.split('@');
    const block = kind === 'disc-amber' ? BLOCKS.disc('amber') : BLOCKS[kind]();
    const place = `translate(${(i % cols) * CELL} ${Math.floor(i / cols) * CELL}) rotate(${rot} ${CELL / 2} ${CELL / 2})`;
    const f = make('g', { transform: place });
    for (const [tag, attrs, color] of block.fills) f.append(make(tag, attrs, `pat-fill pat-fill--${color}`));
    fills.append(f);
    const a = make('g', { transform: place });
    for (const d of block.lines) a.append(make('path', { d }, 'pat-line'));
    arcs.append(a);
  });

  // The grid: one frame (kept inside the picture) and one line on every boundary between cells.
  const grid = make('g', {}, 'pat-line');
  grid.append(make('rect', { x: STROKE / 2, y: STROKE / 2, width: W - STROKE, height: H - STROKE }));
  for (let c = 1; c < cols; c++) grid.append(make('path', { d: `M${c * CELL} 0 V${H}` }));
  for (let r = 1; r < rows; r++) grid.append(make('path', { d: `M0 ${r * CELL} H${W}` }));

  svg.append(fills, arcs, grid);
  return svg;
}
