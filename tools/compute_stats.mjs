#!/usr/bin/env node
// Turns the stats CSVs (written by build_stats.py and read_scoreboard.py) into docs/data/stats.json: the numbers the
// site shows, already worked out, so a visitor downloads one small summary instead of every log line.
//
// Usage:  node tools/compute_stats.mjs [data-folder]      (default docs/data)
//
// Reads voxel-sessions.csv, voxel-hourly.csv, voxel-events.csv, afk-history.csv, players.json, meta.json and
// adjust.json from the folder. The stats job runs it after every update; run it by hand after editing adjust.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Days before this were testing. Everything below counts from here.
const LAUNCH = '2026-10-01';
// The playtime datapack's AFK counter went live here; its first reading holds everything counted since.
const AFK_LIVE_FROM = Date.parse('2026-10-18T09:30:00Z');

const MINUTE = 6e4;
const HOUR = 36e5;
const DAY = 864e5;

const BIG = ['challenge', 'goal']; // the advancements the game itself calls big
const ADV = ['advancement', 'goal', 'challenge'];

// Advancement scoring, from the server's advancement datapack: a task is worth 1, a goal 3, a challenge 5,
// and the rarest of all, "How Did We Get Here?", 10. The log names the kind (task, goal, challenge);
// an exact name in POINTS_BY_NAME overrides it. Change the numbers here and everything follows.
const ADV_POINTS = { advancement: 1, goal: 3, challenge: 5 };
const POINTS_BY_NAME = { 'how did we get here?': 10 };
const pointsFor = (type, name) => POINTS_BY_NAME[String(name).trim().toLowerCase()] ?? ADV_POINTS[type] ?? 0;

// What killed someone, in a few words for "mostly ...": the mob that did it ("guardians"), other players ("players"),
// or the thing itself ("falling", "lava"). The log line after the player's name is in the events' detail.
const PLURAL = { wolf: 'wolves', enderman: 'endermen', silverfish: 'silverfish', drowned: 'drowned', bogged: 'bogged' };
const plural = (name) => {
  const n = name.toLowerCase().replace(/^elder /, '');
  const last = n.split(' ').pop();
  if (PLURAL[last]) return n.slice(0, n.length - last.length) + PLURAL[last];
  if (/(s|x|z|ch|sh)$/.test(n)) return n + 'es';
  return n + 's';
};
const SURROUNDINGS = [
  [/lava/, 'lava'],
  [/fire|flames|burn|crisp/, 'fire'],
  [/fell|hit the ground|doomed to fall|high place|ladder|scaffolding|vines/, 'falling'],
  [/drowned/, 'drowning'],
  [/stalagmite/, 'stalagmites'],
  [/suffocated/, 'suffocation'],
  [/cactus|pricked/, 'cacti'],
  [/berry|bush/, 'berry bushes'],
  [/froze/, 'freezing'],
  [/starved/, 'starvation'],
  [/lightning/, 'lightning'],
  [/anvil|squashed/, 'falling blocks'],
  [/kinetic energy/, 'elytra crashes'],
  [/withered/, 'withering'],
  [/blew up|exploded|firework/, 'explosions'],
];
export const deathCause = (e) => {
  const msg = String(e.detail || '');
  if (e.category === 'PvP') return 'players';
  const designed = msg.match(/\[(.+?)\]/);
  if (designed) return designed[1].toLowerCase();
  const killer = msg.match(/\bby (.+?)(?: using .+)?$/) || msg.match(/(?:escape|fighting|hurt) (.+?)$/);
  if (killer && !/^(a|an|the)\b/i.test(killer[1])) return plural(killer[1]);
  for (const [re, name] of SURROUNDINGS) if (re.test(msg)) return name;
  return String(e.category || 'other').toLowerCase();
};

// Time together counts once two players shared this much time.
const PARTNER_MIN_MS = 30 * MINUTE;
// A day counts towards streaks and "different days" with this much play.
const ACTIVE_DAY_MIN = 10;

// Labels: anyone who clears a label's bar gets it, so there is no limit on how many people hold one. Edit the bars
// here. `score` is how far past the bar the player is (1 = just clears it). A player holds at most MAX_LABELS, the
// ones they clear by the widest margin. `minHours` stops a few hours from counting as a habit (all solo, or twenty
// messages in one short visit).
const MAX_LABELS = 3;
const LABELS = [
  {
    badge: 'Night owl',
    score: (p) => p.nightMin / 60,
    label: (p) => `${r1(p.nightMin / 60)} h between 01:00 and 05:00`,
  },
  {
    badge: 'Early bird',
    score: (p) => p.earlyMin / 60,
    label: (p) => `${r1(p.earlyMin / 60)} h between 05:00 and 09:00`,
  },
  {
    badge: 'Marathon',
    score: (p) => p.longestMin / 240,
    label: (p) => `${Math.floor(p.longestMin / 60)} h ${Math.round(p.longestMin % 60)} min in one go`,
  },
  { badge: 'On a streak', score: (p) => p.streak / 5, label: (p) => `${p.streak} days in a row` },
  { badge: 'Regular', score: (p) => p.days / 7, label: (p) => `online on ${p.days} different days` },
  {
    badge: 'Weekend warrior',
    minHours: 5,
    score: (p) => p.weekendShare / 0.5,
    label: (p) => `${Math.round(p.weekendShare * 100)}% of their time on Sat and Sun`,
  },
  {
    badge: 'Social butterfly',
    score: (p) => p.partners / 10,
    label: (p) => `played with ${p.partners} different people`,
  },
  {
    badge: 'Lone wolf',
    minHours: 5,
    score: (p) => p.soloShare / 0.3,
    label: (p) => `${Math.round(p.soloShare * 100)}% of their time on their own`,
  },
  {
    badge: 'Chatterbox',
    minHours: 3,
    score: (p) => p.chatPerHour / 7,
    label: (p) => `${r1(p.chatPerHour)} messages per hour played`,
  },
];

const r1 = (x) => Math.round(x * 10) / 10;
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const byKey =
  (key, desc = false) =>
  (a, b) =>
    (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1);
const argMax = (list) => list.reduce((best, v, i) => (v > list[best] ? i : best), 0);
const isNight = (hr) => hr >= 1 && hr < 5;
const isEarly = (hr) => hr >= 5 && hr < 9;

/** Parses a CSV into an array of row objects. Handles quoted fields. */
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const head = rows.shift() || [];
  return rows
    .filter((r) => r.length > 1 || r[0])
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** A player's running totals, filled in step by step below. */
const newPlayer = (name) => ({
  name,
  minutes: 0,
  longestMin: 0,
  lastEnd: '',
  byHour: new Array(24).fill(0),
  byWeekHour: Array.from({ length: 7 }, () => new Array(24).fill(0)), // [Monday .. Sunday][hour], minutes
  weekendMin: 0,
  nightMin: 0,
  earlyMin: 0,
  dayMin: {},
  deaths: 0,
  deathCauses: {},
  chat: 0,
  adv: [],
});

/* ---- AFK -------------------------------------------------------------------------------------- */

/** The datapack's AFK counter per player over time: name -> [[time, AFK seconds], ...], oldest first. */
function afkSeriesFrom(rows) {
  const series = {};
  for (const r of rows) (series[r.player] ||= []).push([Date.parse(r.time_utc), Number(r.afk_s)]);
  for (const list of Object.values(series)) list.sort((a, b) => a[0] - b[0]);
  return series;
}

/** AFK seconds counted up to time t, straight between two readings; before the first reading, the first reading. */
function afkAt(list, t) {
  if (!list) return 0;
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    if (t <= list[i][0]) {
      const [t0, v0] = list[i - 1];
      const [t1, v1] = list[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return list[list.length - 1][1];
}

/**
 * The first reading of a player's AFK counter already holds everything counted since the datapack went live, and
 * nothing says when. Place it in their latest sessions after AFK_LIVE_FROM (newest first, a session can hold at most
 * its own length), so the earlier AFK shows up where the player really was online.
 * Returns session -> [from, to, minutes].
 */
function placeEarlyAfk(sessions, series) {
  const placed = new Map();
  for (const [name, list] of Object.entries(series)) {
    let left = list[0][1] / 60;
    const mine = sessions.filter((s) => s.player === name).sort(byKey('end_utc', true));
    for (const s of mine) {
      if (left <= 0) break;
      const from = Math.max(Date.parse(s.start_utc), AFK_LIVE_FROM);
      const to = Math.min(Date.parse(s.end_utc), list[0][0]);
      if (to <= from) continue;
      const take = Math.min(left, (to - from) / MINUTE);
      placed.set(s, [from, to, take]);
      left -= take;
    }
  }
  return placed;
}

const amsterdamHour = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * Takes AFK time out of a player's time-of-day numbers. A reading says how much AFK time passed between two
 * readings, not when exactly, so it is spread evenly over that stretch, hour by hour (Dutch time).
 */
function removeAfk(p, t0, t1, minutes) {
  if (minutes <= 0 || t1 <= t0) return;
  for (let a = t0; a < t1; a = Math.floor(a / HOUR) * HOUR + HOUR) {
    const b = Math.min(t1, Math.floor(a / HOUR) * HOUR + HOUR);
    const part = (minutes * (b - a)) / (t1 - t0);
    const f = Object.fromEntries(amsterdamHour.formatToParts((a + b) / 2).map((x) => [x.type, x.value]));
    const hr = +f.hour;
    const date = `${f.year}-${f.month}-${f.day}`;
    const weekday = new Date(Date.UTC(+f.year, +f.month - 1, +f.day)).getUTCDay();
    if (date < LAUNCH) continue;
    p.byHour[hr] = Math.max(0, p.byHour[hr] - part);
    const row = (weekday + 6) % 7; // Sunday is 0 in JS; Monday is the first row
    p.byWeekHour[row][hr] = Math.max(0, p.byWeekHour[row][hr] - part);
    p.dayMin[date] = Math.max(0, (p.dayMin[date] || 0) - part);
    if (weekday === 0 || weekday === 6) p.weekendMin = Math.max(0, p.weekendMin - part);
    if (isNight(hr)) p.nightMin = Math.max(0, p.nightMin - part);
    if (isEarly(hr)) p.earlyMin = Math.max(0, p.earlyMin - part);
  }
}

/* ---- Time together ------------------------------------------------------------------------------ */

/** overlap[a][b]: ms players a and b were online at the same time. soloMs[a]: ms a was the only one online. */
function timeTogether(sessions) {
  const iv = {};
  for (const s of sessions) (iv[s.player] ||= []).push([Date.parse(s.start_utc), Date.parse(s.end_utc)]);
  const names = Object.keys(iv).sort();
  const overlap = Object.fromEntries(names.map((n) => [n, {}]));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      let ms = 0;
      for (const a of iv[names[i]]) {
        for (const b of iv[names[j]]) ms += Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
      }
      if (ms) overlap[names[i]][names[j]] = overlap[names[j]][names[i]] = ms;
    }
  }
  const spans = sessions.map((s) => [s.player, Date.parse(s.start_utc), Date.parse(s.end_utc)]);
  const cuts = [...new Set(spans.flatMap((s) => [s[1], s[2]]))].sort((a, b) => a - b);
  const soloMs = {};
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const on = spans.filter((s) => s[1] <= a && s[2] >= b);
    if (on.length === 1) soloMs[on[0][0]] = (soloMs[on[0][0]] || 0) + (b - a);
  }
  const totalMs = Object.fromEntries(names.map((n) => [n, iv[n].reduce((t, x) => t + x[1] - x[0], 0)]));
  return { overlap, soloMs, totalMs };
}

/** Longest run of days in a row with play, and how many days had play. */
function streakOf(dayMin) {
  const days = Object.entries(dayMin)
    .filter(([, m]) => m >= ACTIVE_DAY_MIN)
    .map(([d]) => dayMs(d))
    .sort((a, b) => a - b);
  let run = days.length ? 1 : 0;
  let top = run;
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY ? run + 1 : 1;
    top = Math.max(top, run);
  }
  return { streak: top, days: days.length };
}

/* ---- Everything ------------------------------------------------------------------------------- */

function compute({ sessions, hourly, events, meta, adjust = {}, afkHistory = [] }) {
  const S = sessions.filter((s) => s.start_local >= LAUNCH);
  const H = hourly.filter((r) => r.date >= LAUNCH);
  const E = events.filter((e) => e.time_local >= LAUNCH).sort(byKey('time_utc'));

  const players = {};
  const P = (name) => (players[name] ||= newPlayer(name));
  const afk = afkSeriesFrom(afkHistory);
  const earlyAfk = placeEarlyAfk(S, afk);
  const sessionAfkMin = (s) => {
    const list = afk[s.player];
    const counted = (afkAt(list, Date.parse(s.end_utc)) - afkAt(list, Date.parse(s.start_utc))) / 60;
    return Math.max(0, counted) + (earlyAfk.get(s)?.[2] || 0);
  };

  for (const s of S) {
    const p = P(s.player);
    const m = Number(s.minutes);
    p.minutes += m;
    // The longest session counts only the time the player was active in it.
    p.longestMin = Math.max(p.longestMin, m - sessionAfkMin(s));
    if (s.end_utc > p.lastEnd) p.lastEnd = s.end_utc;
  }
  for (const r of H) {
    const p = P(r.player);
    const m = Number(r.minutes);
    const hr = +r.hour;
    p.byHour[hr] += m;
    p.byWeekHour[+r.weekday - 1][hr] += m; // the CSV numbers Monday 1 to Sunday 7
    p.dayMin[r.date] = (p.dayMin[r.date] || 0) + m;
    if (+r.weekday >= 6) p.weekendMin += m;
    if (isNight(hr)) p.nightMin += m;
    if (isEarly(hr)) p.earlyMin += m;
  }
  for (const [name, list] of Object.entries(afk)) {
    if (!players[name]) continue;
    for (let i = 1; i < list.length; i++) {
      removeAfk(players[name], list[i - 1][0], list[i][0], (list[i][1] - list[i - 1][1]) / 60);
    }
  }
  for (const [s, [from, to, minutes]] of earlyAfk) {
    if (players[s.player]) removeAfk(players[s.player], from, to, minutes);
  }

  // Deaths, chat and advancements; each (player, advancement) counted once, with who has it.
  const who = {};
  for (const e of E) {
    if (e.type === 'death') {
      const p = P(e.player);
      p.deaths += 1;
      const cause = deathCause(e);
      p.deathCauses[cause] = (p.deathCauses[cause] || 0) + 1;
    } else if (e.type === 'chat') {
      P(e.player).chat += 1;
    } else if (ADV.includes(e.type)) {
      const holders = (who[e.detail] ||= new Set());
      if (holders.has(e.player)) continue;
      holders.add(e.player);
      P(e.player).adv.push({ name: e.detail, points: pointsFor(e.type, e.detail), at: e.time_utc });
    }
  }

  const { overlap, soloMs, totalMs } = timeTogether(S);
  for (const p of Object.values(players)) {
    for (const a of p.adv) a.earners = who[a.name].size;
    p.advPoints = p.adv.reduce((t, a) => t + a.points, 0);

    const total = totalMs[p.name] || 0;
    const partners = Object.entries(overlap[p.name] || {})
      .filter(([, ms]) => ms >= PARTNER_MIN_MS)
      .sort((a, b) => b[1] - a[1]);
    p.partners = partners.length;
    p.buddies = partners.slice(0, 5).map(([name, ms]) => ({
      name,
      hours: r1(ms / HOUR),
      share: total ? Math.round((ms / total) * 100) : 0,
    }));
    p.soloShare = total ? (soloMs[p.name] || 0) / total : 0;
    p.togetherShare = total ? 1 - p.soloShare : 0;
    Object.assign(p, streakOf(p.dayMin));

    // Hand-entered corrections (adjust.json) and the datapack's AFK counter come off the played time.
    // The logged total is kept for the breakdown on the player's own page.
    const adj = adjust[p.name] || {};
    const counted = afk[p.name] ? afk[p.name][afk[p.name].length - 1][1] / 60 : 0;
    p.loggedMin = p.minutes;
    p.afkMin = Math.min((Number(adj.afkMinutes) || 0) + counted, p.loggedMin);
    p.adminMin = Math.min(Number(adj.adminMinutes) || 0, p.loggedMin - p.afkMin);
    p.minutes = p.loggedMin - p.afkMin - p.adminMin;
    p.weekendShare = p.loggedMin ? p.weekendMin / p.loggedMin : 0;
    p.chatPerHour = p.minutes ? p.chat / (p.minutes / 60) : 0;
    const cause = Object.entries(p.deathCauses).sort((a, b) => b[1] - a[1])[0];
    p.topCause = cause ? cause[0] : null;
  }

  const all = Object.values(players);
  const byPlaytime = [...all].sort((a, b) => b.minutes - a.minutes);
  byPlaytime.forEach((p, i) => (p.rank = i + 1));
  for (const p of byPlaytime) {
    p.badges = LABELS.filter((l) => p.minutes / 60 >= (l.minHours || 0) && l.score(p) >= 1)
      .sort((a, b) => b.score(p) - a.score(p))
      .slice(0, MAX_LABELS)
      .map((l) => l.badge);
  }

  const board = (value) =>
    all
      .map((p) => ({ name: p.name, value: value(p) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .slice(0, 5);

  return {
    meta,
    overview: overviewOf(S, H, all.length),
    byWeekHourAll: Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => Math.round(all.reduce((t, p) => t + p.byWeekHour[d][h], 0))),
    ),
    byHourAll: H.reduce((list, r) => ((list[+r.hour] += Number(r.minutes)), list), new Array(24).fill(0)).map(
      r1,
    ),
    race: {
      start: dayMs(LAUNCH),
      end: Date.parse(S.reduce((m, s) => (s.end_utc > m ? s.end_utc : m), '')) || Date.now(),
    },
    boards: {
      playtime: board((p) => r1(p.minutes / 60)),
      deaths: board((p) => p.deaths),
      advancements: board((p) => p.advPoints),
      chat: board((p) => p.chat),
    },
    // Names, most recently seen first.
    recent: [...all].sort(byKey('lastEnd', true)).map((p) => p.name),
    // The latest challenges and goals, newest first, with how many players have each.
    big: E.filter((e) => BIG.includes(e.type))
      .reverse()
      .slice(0, 6)
      .map((e) => ({
        type: e.type,
        player: e.player,
        name: e.detail,
        at: e.time_utc,
        earners: who[e.detail].size,
      })),
    players: Object.fromEntries(byPlaytime.map((p) => [p.name, publicPlayer(p)])),
  };
}

/** Server-wide numbers for the homepage. */
function overviewOf(S, H, playerCount) {
  const endLocal = S.reduce((m, s) => (s.end_local > m ? s.end_local : m), '');
  const endDay = endLocal ? dayMs(endLocal) : Date.now();
  const lastFull = isoDay(endDay - DAY);
  const last7From = isoDay(endDay - 7 * DAY);
  const prev7From = isoDay(endDay - 14 * DAY);
  let last7 = 0;
  let prev7 = 0;
  let totalMin = 0;
  const byHour = new Array(24).fill(0);
  for (const r of H) {
    const m = Number(r.minutes);
    totalMin += m;
    byHour[+r.hour] += m;
    if (r.date >= last7From && r.date <= lastFull) last7 += m;
    else if (r.date >= prev7From && r.date < last7From) prev7 += m;
  }
  const last7Avg = r1(last7 / 60 / 7);
  const prev7Avg = r1(prev7 / 60 / 7);

  // Most players online at once: walk every join (+1) and leave (-1) in time order.
  const steps = S.flatMap((s) => [
    [s.start_utc, 1],
    [s.end_utc, -1],
  ]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  let on = 0;
  let peakPlayers = 0;
  let peakAt = '';
  for (const [at, change] of steps) {
    on += change;
    if (on > peakPlayers) [peakPlayers, peakAt] = [on, at];
  }

  return {
    totalHours: Math.round(totalMin / 60),
    playerCount,
    last7Avg,
    changePct: prev7Avg ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 100) : null,
    busiestHour: argMax(byHour),
    peakPlayers,
    peakAt,
  };
}

/** What the site needs of one player, rounded so the file stays small. */
function publicPlayer(p) {
  const newest = [...p.adv].sort(byKey('at', true));
  let points = 0;
  return {
    name: p.name,
    rank: p.rank,
    minutes: r1(p.minutes),
    loggedMin: r1(p.loggedMin),
    afkMin: r1(p.afkMin),
    adminMin: r1(p.adminMin),
    lastEnd: p.lastEnd,
    byHour: p.byHour.map(r1),
    byWeekHour: p.byWeekHour.map((row) => row.map(Math.round)),
    favHour: Math.max(...p.byHour) > 0 ? argMax(p.byHour) : null,
    deaths: p.deaths,
    topCause: p.topCause,
    badges: p.badges,
    togetherShare: r1(p.togetherShare * 100) / 100,
    buddies: p.buddies,
    advPoints: p.advPoints,
    advCount: p.adv.length,
    rarest: [...newest].sort((a, b) => a.earners - b.earners)[0]?.name || null,
    latestAdv: newest
      .slice(0, 5)
      .map(({ name, points: pts, at, earners }) => ({ name, points: pts, at, earners })),
    // Running advancement points for the race chart: [time, points] at every advancement.
    advSteps: [...p.adv].sort(byKey('at')).map((a) => [Date.parse(a.at), (points += a.points)]),
  };
}

/* ---- Files ------------------------------------------------------------------------------------ */

function main() {
  const dir = process.argv[2] || 'docs/data';
  const text = (file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : '');
  const json = (file, fallback) => (text(file) ? JSON.parse(text(file)) : fallback);
  const stats = compute({
    sessions: parseCSV(text('voxel-sessions.csv')),
    hourly: parseCSV(text('voxel-hourly.csv')),
    events: parseCSV(text('voxel-events.csv')),
    meta: json('meta.json', null),
    adjust: json('adjust.json', {}),
    afkHistory: parseCSV(text('afk-history.csv')),
  });
  const out = join(dir, 'stats.json');
  writeFileSync(out, JSON.stringify(stats) + '\n');
  console.log(`Wrote ${out}: ${Object.keys(stats.players).length} players.`);
}

main();
