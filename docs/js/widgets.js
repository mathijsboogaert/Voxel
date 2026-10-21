// Small building blocks shared by the homepage and the player page.
import { el, hourLabel, columns } from './ui.js';

/** A stat tile: a big number, what it counts, and an optional extra line (text or an element). */
export function statTile(num, label, extra) {
  return el(
    'div',
    { class: 'card tile' },
    el('span', { class: 'num' }, num),
    el('p', { class: 'small' }, label),
    typeof extra === 'string' ? el('p', { class: 'small' }, extra) : extra,
  );
}

/**
 * The time-of-day chart: one bar per hour, the busiest hour in rust.
 *   byHour   minutes played in each of the 24 hours
 *   heading  the card's label
 *   caption  the line under the chart
 */
export function hourChart({ byHour, heading, caption }) {
  const max = Math.max(...byHour) || 1;
  const top = byHour.indexOf(Math.max(...byHour));
  const heights = byHour.map((minutes) => Math.max(3, (minutes / max) * 100));
  const chart = columns(heights, (hour) => (hour === top ? 'bar__fill bar__fill--top' : 'bar__fill'));
  return el(
    'div',
    { class: 'card hours' },
    el('p', { class: 'label' }, heading),
    el(
      'div',
      {
        class: 'rhythm',
        role: 'img',
        'aria-label': `Time played by hour of the day. Busiest around ${hourLabel(top)}.`,
      },
      chart,
    ),
    el(
      'div',
      { class: 'rhythm-axis small', 'aria-hidden': 'true' },
      ['00', '06', '12', '18', '24'].map((t) => el('span', {}, t)),
    ),
    el('p', { class: 'small mt-2' }, caption),
  );
}
