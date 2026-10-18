// Loads the three CSVs the stats job builds from the server logs and turns them into the
// few numbers the site shows. Plain JS, no libraries. The calculations are ports of the
// original stats dashboard so the numbers match what it showed.
import { url, parseCSV } from './ui.js';

// Days before this were testing. Everything below counts from here.
export const LAUNCH = '2026-10-01';
const BIG = ['challenge', 'goal']; // the advancements the game itself calls big
const ADV = ['advancement', 'goal', 'challenge'];

// Advancement scoring, from the server's advancement datapack: a task is worth 1, a goal 3, a challenge 5,
// and the rarest of all, "How Did We Get Here?", 10. The log names the kind (task, goal, challenge);
// an exact name in POINTS_BY_NAME overrides it. Change the numbers here and everything follows.
export const ADV_POINTS = { advancement: 1, goal: 3, challenge: 5 };
const POINTS_BY_NAME = { 'how did we get here?': 10 };
export const pointsFor = (type, name) => POINTS_BY_NAME[String(name).trim().toLowerCase()] ?? ADV_POINTS[type] ?? 0;

async function getText(path) {
  const r = await fetch(url(path), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} for ${path}`);
  return r.text();
}
async function getJSON(path, fallback) {
  try {
    const r = await fetch(url(path), { cache: 'no-cache' });
    return r.ok ? await r.json() : fallback;
  } catch { return fallback; }
}

let cached = null;
/** Loads and computes once per page; later callers get the same promise. force=true reloads. */
export function loadStats(force = false) {
  if (force) cached = null;
  cached ||= (async () => {
    const [s, h, e, roster, meta, adjust] = await Promise.all([
      getText('data/voxel-sessions.csv'), getText('data/voxel-hourly.csv'), getText('data/voxel-events.csv'),
      getJSON('data/players.json', []), getJSON('data/meta.json', null), getJSON('data/adjust.json', {}),
    ]);
    return compute({ sessions: parseCSV(s), hourly: parseCSV(h), events: parseCSV(e), roster, meta, adjust });
  })();
  return cached;
}

const r1 = (x) => Math.round(x * 10) / 10;
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

export function compute({ sessions, hourly, events, roster, meta, adjust = {} }) {
  const S = sessions.filter((s) => s.start_local >= LAUNCH);
  const H = hourly.filter((r) => r.date >= LAUNCH);
  const E = events.filter((e) => e.time_local >= LAUNCH).sort((a, b) => (a.time_utc < b.time_utc ? -1 : 1));

  const players = {};
  const P = (n) => (players[n] ||= {
    name: n, minutes: 0, sessions: 0, longestMin: 0, longestOn: '', lastEnd: '',
    byHour: new Array(24).fill(0), weekendMin: 0, nightMin: 0, earlyMin: 0, dayMin: {},
    deaths: 0, deathCauses: {}, chat: 0, adv: [],
  });

  for (const s of S) {
    const p = P(s.player), m = Number(s.minutes);
    p.minutes += m; p.sessions += 1;
    if (m > p.longestMin) { p.longestMin = m; p.longestOn = s.start_local.slice(0, 10); }
    if (s.end_utc > p.lastEnd) p.lastEnd = s.end_utc;
  }
  for (const r of H) {
    const p = P(r.player), m = Number(r.minutes), hr = +r.hour;
    p.byHour[hr] += m;
    p.dayMin[r.date] = (p.dayMin[r.date] || 0) + m;
    if (+r.weekday >= 6) p.weekendMin += m;
    if (hr >= 1 && hr < 5) p.nightMin += m;
    if (hr >= 5 && hr < 9) p.earlyMin += m;
  }

  // Advancements: each (player, advancement) counted once; who has it, and who was first.
  const who = {}, first = {}, seen = new Set();
  for (const e of E) {
    if (e.type === 'death') { const p = P(e.player); p.deaths += 1; p.deathCauses[e.category] = (p.deathCauses[e.category] || 0) + 1; }
    else if (e.type === 'chat') P(e.player).chat += 1;
    else if (ADV.includes(e.type)) {
      (who[e.detail] ||= new Set()).add(e.player);
      if (!(e.detail in first)) first[e.detail] = e.player;
      const k = e.player + '|' + e.detail;
      if (!seen.has(k)) { seen.add(k); P(e.player).adv.push({ name: e.detail, type: e.type, points: pointsFor(e.type, e.detail), at: e.time_utc, local: e.time_local }); }
    }
  }
  for (const p of Object.values(players)) {
    for (const a of p.adv) { a.earners = who[a.name].size; a.first = first[a.name] === p.name; }
    p.firsts = p.adv.filter((a) => a.first).length;
    p.advPoints = p.adv.reduce((t, a) => t + a.points, 0);
  }

  // Time together: overlap between every two players, and time with nobody else online.
  const iv = {};
  for (const s of S) (iv[s.player] ||= []).push([Date.parse(s.start_utc), Date.parse(s.end_utc)]);
  const names = Object.keys(iv).sort();
  const overlap = {}; // overlap[a][b] in ms
  for (const n of names) overlap[n] = {};
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    let ov = 0;
    for (const a of iv[names[i]]) for (const b of iv[names[j]]) { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); if (hi > lo) ov += hi - lo; }
    if (ov) overlap[names[i]][names[j]] = overlap[names[j]][names[i]] = ov;
  }
  const ss = S.map((s) => [s.player, Date.parse(s.start_utc), Date.parse(s.end_utc)]);
  const cuts = [...new Set(ss.flatMap((s) => [s[1], s[2]]))].sort((a, b) => a - b);
  const soloMs = {};
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const on = ss.filter((s) => s[1] <= a && s[2] >= b);
    if (on.length === 1) soloMs[on[0][0]] = (soloMs[on[0][0]] || 0) + (b - a);
  }

  for (const p of Object.values(players)) {
    const total = (iv[p.name] || []).reduce((t, x) => t + x[1] - x[0], 0);
    const ov = Object.entries(overlap[p.name] || {}).sort((a, b) => b[1] - a[1]);
    p.partners = ov.filter(([, ms]) => ms >= 18e5).length; // 30+ min together
    p.buddies = ov.filter(([, ms]) => ms >= 18e5).slice(0, 5).map(([name, ms]) => ({ name, hours: r1(ms / 36e5), share: total ? Math.round((ms / total) * 100) : 0 }));
    p.buddy = p.buddies[0] || null;
    p.soloShare = total ? (soloMs[p.name] || 0) / total : 0;
    p.togetherShare = total ? 1 - p.soloShare : 0;
    // Longest run of days with 10+ minutes, and how many such days.
    const days = Object.entries(p.dayMin).filter(([, m]) => m >= 10).map(([d]) => dayMs(d)).sort((a, b) => a - b);
    let run = days.length ? 1 : 0, top = run;
    for (let i = 1; i < days.length; i++) { run = days[i] - days[i - 1] === 864e5 ? run + 1 : 1; top = Math.max(top, run); }
    p.streak = top; p.days = days.length;
    // Hand-entered corrections (docs/data/adjust.json): AFK and admin time come off the played time.
    // The logged total is kept for the breakdown on the player's own page.
    const adj = adjust[p.name] || {};
    p.loggedMin = p.minutes;
    p.afkMin = Math.min(Number(adj.afkMinutes) || 0, p.loggedMin);
    p.adminMin = Math.min(Number(adj.adminMinutes) || 0, p.loggedMin - p.afkMin);
    p.minutes = p.loggedMin - p.afkMin - p.adminMin;
    p.hours = p.minutes / 60;
    p.weekendShare = p.loggedMin ? p.weekendMin / p.loggedMin : 0;
    p.chatPerHour = p.hours ? p.chat / p.hours : 0;
    const best = p.byHour.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
    p.favHour = p.byHour[best] > 0 ? best : null;
    p.rarest = [...p.adv].sort((a, b) => a.earners - b.earners || (a.at < b.at ? 1 : -1))[0] || null;
    p.latestAdv = [...p.adv].sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
    const cause = Object.entries(p.deathCauses).sort((a, b) => b[1] - a[1])[0];
    p.topCause = cause ? cause[0] : null;
  }
  const all = Object.values(players);
  const byHours = [...all].sort((a, b) => b.minutes - a.minutes);
  byHours.forEach((p, i) => { p.rank = i + 1; });

  // Badges: one winner each, same rules as the original dashboard.
  // Ties go to whoever has played more, as the original did (byHours is already in that order).
  const best = (k, min = 0) => byHours.filter((p) => p.hours >= min).sort((a, b) => b[k] - a[k])[0];
  const badges = [];
  const give = (badge, p, label) => p && badges.push({ badge, name: p.name, label });
  let b = best('nightMin'); give('Night owl', b, b && `${r1(b.nightMin / 60)} h between 01:00 and 05:00`);
  b = best('earlyMin'); give('Early bird', b, b && `${r1(b.earlyMin / 60)} h between 05:00 and 09:00`);
  b = best('longestMin'); give('Marathon', b, b && `${Math.floor(b.longestMin / 60)} h ${Math.round(b.longestMin % 60)} min in one go`);
  b = best('streak'); give('On a streak', b, b && `${b.streak} days in a row`);
  b = best('days'); give('Regular', b, b && `online on ${b.days} different days`);
  b = best('weekendShare', 5); give('Weekend warrior', b, b && `${Math.round(b.weekendShare * 100)}% of their time on Sat and Sun`);
  b = best('partners'); give('Social butterfly', b, b && `played with ${b.partners} different people`);
  b = best('soloShare', 5); give('Lone wolf', b, b && `${Math.round(b.soloShare * 100)}% of their time on their own`);
  b = best('chatPerHour', 3); give('Chatterbox', b, b && `${r1(b.chatPerHour)} messages per hour played`);
  for (const p of all) p.badges = badges.filter((x) => x.name === p.name).map((x) => x.badge);

  // Server-wide numbers.
  const endLocal = S.reduce((m, s) => (s.end_local > m ? s.end_local : m), '');
  const endDay = endLocal ? dayMs(endLocal) : Date.now();
  const lastFull = isoDay(endDay - 864e5), last7From = isoDay(endDay - 7 * 864e5), prev7From = isoDay(endDay - 14 * 864e5);
  let l7 = 0, p7 = 0, totalMin = 0;
  const byHourAll = new Array(24).fill(0);
  for (const r of H) {
    const m = Number(r.minutes);
    totalMin += m; byHourAll[+r.hour] += m;
    if (r.date >= last7From && r.date <= lastFull) l7 += m;
    else if (r.date >= prev7From && r.date < last7From) p7 += m;
  }
  const l7a = r1(l7 / 60 / 7), p7a = r1(p7 / 60 / 7);
  const sweep = [];
  for (const s of S) { sweep.push([s.start_utc, 1, s.start_local]); sweep.push([s.end_utc, -1, s.end_local]); }
  sweep.sort((a, c) => (a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : a[1] - c[1]));
  let on = 0, peak = 0, peakAt = '';
  for (const x of sweep) { on += x[1]; if (on > peak) { peak = on; peakAt = x[0]; } }

  const overview = {
    totalHours: Math.round(totalMin / 60),
    playerCount: all.length,
    last7Avg: l7a, prev7Avg: p7a,
    changePct: p7a ? Math.round(((l7a - p7a) / p7a) * 100) : null,
    busiestHour: byHourAll.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0),
    peakPlayers: peak, peakAt,
  };

  const board = (f) => all.map((p) => ({ name: p.name, value: f(p) })).filter((r) => r.value > 0)
    .sort((a, c) => c.value - a.value || a.name.localeCompare(c.name, 'en', { sensitivity: 'base' }));

  // For the advancement race graph: every player's running points, one step per advancement.
  for (const p of all) {
    let v = 0;
    p.advSteps = [...p.adv].sort((x, y) => (x.at < y.at ? -1 : 1)).map((a) => ({ t: Date.parse(a.at), v: (v += a.points) }));
  }
  const race = { start: dayMs(LAUNCH), end: Date.parse(S.reduce((m, s) => (s.end_utc > m ? s.end_utc : m), '')) || Date.now() };

  const rosterByName = Object.fromEntries((roster || []).map((p) => [p.name, p]));
  for (const p of all) rosterByName[p.name] ||= { name: p.name, uuid: null };

  return {
    launch: LAUNCH, meta, overview, badges, players, roster: rosterByName, race,
    byHourAll,
    boards: {
      playtime: board((p) => r1(p.minutes / 60)),
      deaths: board((p) => p.deaths),
      advancements: board((p) => p.advPoints),
      chat: board((p) => p.chat),
    },
    /** Players ordered for lists: most recently seen first. */
    roster_sorted: [...all].sort((a, c) => (a.lastEnd < c.lastEnd ? 1 : -1)),
    /** Challenges and goals, newest first, with how many players have each. */
    big: E.filter((e) => BIG.includes(e.type)).reverse()
      .map((e) => ({ type: e.type, player: e.player, name: e.detail, at: e.time_utc, earners: who[e.detail].size })),
  };
}
