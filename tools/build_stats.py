#!/usr/bin/env python3
"""Build the Voxel stats data files from Paper server logs.

Usage:  python3 tools/build_stats.py <logs-folder> [data-folder]

<logs-folder> is the server's logs/ folder (all YYYY-MM-DD-n.log.gz files plus latest.log).
Writes voxel-sessions.csv, voxel-hourly.csv, voxel-events.csv and meta.json into [data-folder] (default: data/).
Log timestamps are treated as UTC (the server's clock) and converted to Dutch time.
"""
import csv, gzip, json, os, re, sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

LOCAL = ZoneInfo("Europe/Amsterdam")
TS = re.compile(r'^\[(\d\d):(\d\d):(\d\d)\]')
JOIN = re.compile(r'System chat: (\S+) joined the game')
LEAVE = re.compile(r'System chat: (\S+) left the game')
SYS = re.compile(r'System chat: (\S+) (.*)$')
CHAT = re.compile(r'Async Chat Thread.*?: <([^>]+)> ')
ADV = re.compile(r'has (made the advancement|reached the goal|completed the challenge) \[(.+)\]$')
DEATH = re.compile(r'^(was |fell |hit the ground|tried to swim|burned|drowned|suffocated|discovered the floor|went up|walked into|starved|froze|blew up|died|experienced|withered|didn.t want|left the confines|went off with a bang)')
ADV_TYPE = {'made the advancement': 'advancement', 'reached the goal': 'goal', 'completed the challenge': 'challenge'}


def read_lines(path):
    opener = gzip.open if path.endswith('.gz') else open
    with opener(path, 'rt', errors='replace') as f:
        return f.read().splitlines()


def seconds(line):
    m = TS.match(line)
    return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) if m else None


def log_files(folder):
    """(path, start date, lines) in chronological order."""
    gz = [f for f in os.listdir(folder) if re.match(r'\d{4}-\d{2}-\d{2}-\d+\.log\.gz$', f)]
    gz.sort(key=lambda f: (f[:10], int(f[11:].split('.')[0])))
    out = [(os.path.join(folder, f), datetime.strptime(f[:10], '%Y-%m-%d').date(), None) for f in gz]
    latest = os.path.join(folder, 'latest.log')
    if os.path.exists(latest):
        lines = read_lines(latest)
        wraps, prev = 0, None
        for ln in lines:
            s = seconds(ln)
            if s is None: continue
            if prev is not None and s < prev - 60: wraps += 1
            prev = s
        end_day = datetime.fromtimestamp(os.path.getmtime(latest), timezone.utc).date()
        out.append((latest, end_day - timedelta(days=wraps), lines))
    return out


def timed_lines(folder):
    """Yield (utc datetime, line, file lines, index) for every timestamped line."""
    for path, day0, lines in log_files(folder):
        lines = lines if lines is not None else read_lines(path)
        base = datetime(day0.year, day0.month, day0.day, tzinfo=timezone.utc)
        day, prev = 0, None
        for i, ln in enumerate(lines):
            s = seconds(ln)
            if s is None: continue
            if prev is not None and s < prev - 60: day += 1
            prev = s
            yield base + timedelta(days=day, seconds=s), ln, lines, i


def death_category(msg, players):
    by_player = any(msg.endswith('by ' + p) or (' by ' + p + ' ') in msg for p in players)
    if re.search(r'lava|burn|fire|flames|crisp', msg): return 'Lava and fire'
    if re.search(r'fell|hit the ground|doomed to fall', msg): return 'PvP' if by_player else 'Falling'
    if re.search(r'stalagmite|suffocated|drowned|cactus|froze|starved|lightning|squashed', msg): return 'Environment'
    if re.search(r'slain|shot|blown up|killed by|fireballed|stung|impaled by', msg): return 'PvP' if by_player else 'Mobs'
    return 'Other'


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    logs, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'data')
    os.makedirs(out, exist_ok=True)
    fmt_utc = lambda t: t.strftime('%Y-%m-%dT%H:%M:%SZ')
    fmt_local = lambda t: t.astimezone(LOCAL).strftime('%Y-%m-%d %H:%M')

    # 1. Sessions: join -> leave. A server stop/start closes everyone still online.
    sessions, online, last = [], {}, None
    def close_all(t):
        for p, s in online.items(): sessions.append((p, s, t, False))
        online.clear()
    for t, ln, _, _ in timed_lines(logs):
        if 'Starting minecraft server' in ln and last: close_all(last)
        last = t
        if (m := JOIN.search(ln)):
            if m[1] in online: sessions.append((m[1], online[m[1]], t, False))
            online[m[1]] = t
        elif (m := LEAVE.search(ln)):
            if m[1] in online: sessions.append((m[1], online.pop(m[1]), t, False))
        elif 'Stopping server' in ln:
            close_all(t)
    for p, s in online.items(): sessions.append((p, s, last, True))
    sessions = sorted([x for x in sessions if x[2] > x[1]], key=lambda x: x[1])
    players = {x[0] for x in sessions}

    with open(os.path.join(out, 'voxel-sessions.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['player', 'start_utc', 'end_utc', 'start_local', 'end_local', 'minutes', 'still_online'])
        for p, s, e, on in sessions:
            w.writerow([p, fmt_utc(s), fmt_utc(e), fmt_local(s), fmt_local(e), round((e - s).total_seconds() / 60, 1), 'yes' if on else 'no'])

    # 2. Minutes per player per local hour.
    hourly = Counter()
    for p, s, e, _ in sessions:
        t, e = s.astimezone(LOCAL), e.astimezone(LOCAL)
        while t < e:
            nxt = min(e, t.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
            hourly[(t.strftime('%Y-%m-%d'), t.isoweekday(), t.hour, p)] += (nxt - t).total_seconds() / 60
            t = nxt
    with open(os.path.join(out, 'voxel-hourly.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['date', 'weekday', 'hour', 'player', 'minutes'])
        for k in sorted(hourly): w.writerow([*k, round(hourly[k], 2)])

    # 3. Deaths, advancements, chat (no message text).
    events = []
    for t, ln, lines, i in timed_lines(logs):
        rec = None
        if (c := CHAT.search(ln)) and c[1] in players:
            rec = ('chat', c[1], '', 'Chat')
        elif (s := SYS.search(ln)) and s[1] in players:
            rest = s[2]
            if (a := ADV.search(rest)):
                rec = (ADV_TYPE[a[1]], s[1], a[2], a[1])
            elif DEATH.match(rest) and not rest.startswith(('joined', 'left the game')):
                if rest == 'was killed' and any('issued server command: /kill' in x for x in lines[max(0, i - 2):i]):
                    continue  # /kill by an operator, not a real death
                rec = ('death', s[1], rest, death_category(rest, players))
        if rec:
            events.append([rec[0], rec[1], fmt_utc(t), fmt_local(t), rec[2], rec[3]])
    with open(os.path.join(out, 'voxel-events.csv'), 'w', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['type', 'player', 'time_utc', 'time_local', 'detail', 'category'])
        w.writerows(events)

    # Freshness stamp the site shows as "Updated X ago".
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump({'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'data_through': fmt_utc(last)}, f, indent=2)
        f.write('\n')

    print(f'{len(sessions)} sessions, {len(hourly)} hourly rows, {len(events)} events ({dict(Counter(e[0] for e in events))})')
    print(f'Data runs from {fmt_local(sessions[0][1])} to {fmt_local(last)} (Dutch time) -> {out}/')


if __name__ == '__main__':
    main()
