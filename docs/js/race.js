// The advancement race: running advancement points over time, a step at every advancement.
// Used on the homepage (the top five) and on player pages (this player highlighted against the leaders).
// Lines differ in colour and in pattern so they don't rely on hue alone.
import { el, svgEl as sv, faceEl, fmtInt, DAY } from './ui.js?v=4d932c1e';
const dayLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Amsterdam',
});

// Each line is a class in site.css (race-line--0 .. --4, --focus): colour, weight and dash pattern live there.
const STYLES = ['0', '1', '2', '3', '4'];
// On a player page their own line is the bold rust one; the leaders use the other four styles.
const FOCUS = 'focus';
const OTHERS = [STYLES[0], STYLES[2], STYLES[3], STYLES[4]];

/** The lines to draw: the top five, or this player plus the top four others. */
export function raceSeries(st, focus) {
  const ranked = Object.values(st.players)
    .filter((p) => p.advPoints > 0)
    .sort((a, b) => b.advPoints - a.advPoints);
  const make = (p, style) => ({ name: p.name, total: p.advPoints, steps: p.advSteps, style });
  if (!focus) return ranked.slice(0, 5).map((p, i) => make(p, STYLES[i]));
  const me = st.players[focus];
  if (!me || !me.advPoints) return [];
  return [
    make(me, FOCUS),
    ...ranked
      .filter((p) => p.name !== focus)
      .slice(0, 4)
      .map((p, i) => make(p, OTHERS[i])),
  ];
}

function niceStep(max) {
  const raw = max / 3,
    pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
}

function raceChart(st, series) {
  const { start, end } = st.race;
  const top = Math.max(...series.map((s) => s.total));
  // The chart's size and its margins (left for the numbers, bottom for the dates).
  const W = 320;
  const H = 200;
  const PAD = { left: 34, right: 8, top: 10, bottom: 26 };
  const pw = W - PAD.left - PAD.right;
  const ph = H - PAD.top - PAD.bottom;
  const span = Math.max(end - start, DAY);
  const step = niceStep(top),
    yMax = Math.ceil(top / step) * step;
  const x = (t) => (PAD.left + ((Math.min(t, end) - start) / span) * pw).toFixed(1);
  const y = (v) => (PAD.top + ph - (v / yMax) * ph).toFixed(1);

  const svg = sv('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'race',
    role: 'img',
    'aria-label': `Advancement points over time. ${series.map((s) => `${s.name} ${s.total}`).join(', ')}.`,
  });
  for (let v = 0; v <= yMax; v += step) {
    svg.append(sv('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: 'race__grid' }));
    svg.append(sv('text', { x: PAD.left - 6, y: Number(y(v)) + 4, 'text-anchor': 'end' }, v));
  }
  const every = (span > 12 * DAY ? 7 : 2) * DAY;
  for (let t = start; t <= end; t += every) {
    svg.append(
      sv('text', { x: x(t), y: H - 8, 'text-anchor': t === start ? 'start' : 'middle' }, dayLabel.format(t)),
    );
  }
  // First series is the one that matters (the leader, or the player in focus), so it is drawn last, on top.
  [...series].reverse().forEach((s) => {
    let d = `M${x(start)} ${y(0)}`;
    for (const [t, v] of s.steps) d += ` H${x(t)} V${y(v)}`;
    d += ` H${x(end)}`;
    svg.append(sv('path', { d, class: `race-line race-line--${s.style}` }));
  });
  return svg;
}

const swatch = (style) =>
  sv(
    'svg',
    { viewBox: '0 0 28 8', class: 'race-swatch', 'aria-hidden': 'true' },
    sv('path', { d: 'M0 4H28', class: `race-line race-line--${style}` }),
  );

/** Heading, chart and legend as an array of elements. focus = a player name for the player-page version. */
export function raceBlock(st, { focus = null, heading = 'Advancement race' } = {}) {
  const series = raceSeries(st, focus);
  if (!series.length) return [];
  return [
    el('p', { class: 'label mt-4' }, heading),
    raceChart(st, series),
    el(
      'ul',
      { class: 'race-legend' },
      series.map((s) =>
        el(
          'li',
          {},
          swatch(s.style),
          faceEl(s.name, 'sm'),
          el('span', { class: 'race-legend__name' }, s.name),
          el('span', { class: 'small' }, `${fmtInt(s.total)} pts`),
        ),
      ),
    ),
  ];
}
