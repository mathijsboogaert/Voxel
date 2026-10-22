// Small building blocks shared by the pages: chips, stat tiles and the hour chart.
import { el, hourLabel, columns, barLength } from './ui.js?v=4d932c1e';

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
  const heights = byHour.map((minutes) => barLength(minutes, max));
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

/**
 * A row of chips with one picked (the segmented control in site.css).
 *   options  [[key, label], ...]
 *   value    the picked key
 *   onPick   called with a key when another chip is picked
 *   label    what the row is for, read out by screen readers
 *   panel    the id of the element the chips switch: they are then tabs, moved between with the arrow keys.
 *            Without it they are a filter (toggle buttons).
 */
export function chipRow({ options, value, onPick, label, panel = null }) {
  const chips = options.map(([key, text]) => {
    const on = key === value;
    const state = panel
      ? { role: 'tab', 'aria-selected': String(on), 'aria-controls': panel, tabindex: on ? '0' : '-1' }
      : { 'aria-pressed': String(on) };
    return el('button', { type: 'button', class: 'chip', ...state, onclick: () => on || onPick(key) }, text);
  });
  const row = el(
    'div',
    { class: `chips chips--${options.length}`, role: panel ? 'tablist' : 'group', 'aria-label': label },
    chips,
  );
  if (panel) {
    row.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = (options.findIndex(([key]) => key === value) + step + options.length) % options.length;
      onPick(options[next][0]);
    });
  }
  return row;
}
