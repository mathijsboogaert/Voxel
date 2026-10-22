// The stats summary the stats job writes (data/stats.json, built by tools/compute_stats.mjs from the server logs).
import { getJSON } from './ui.js?v=4d932c1e';

let cached = null;
/** Loads the stats once per page; later callers get the same promise. force=true fetches again. */
export function loadStats(force = false) {
  if (force) cached = null;
  cached ||= getJSON('data/stats.json', null, { fresh: true }).then((st) => {
    if (!st) throw new Error('data/stats.json is missing or broken');
    return st;
  });
  return cached;
}
