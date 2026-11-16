// Badge pieces shared by the Badges and Players pages: the tier names and a badge's pixel icon.
// Data: data/badges.json, written by tools/build_badges.py from the VoxelBadges plugin's files on the server.
import { el, url, getJSON } from './ui.js?v=4d932c1e';

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Diamond'];

/** A badge's pixel icon at a tier (1-4). */
export const iconEl = (id, tier, cls) =>
  el('img', {
    class: cls,
    src: url(`assets/voxel-badges/${TIERS[tier - 1].toLowerCase()}_${id}.png`),
    alt: '',
    width: 10,
    height: 10,
    decoding: 'async',
  });

/** The badges and who holds which tier: { badges: [...], holders: [{ name, badges: { id: tier } }] }. */
export const loadBadges = () => getJSON('data/badges.json', { badges: [], holders: [] }, { fresh: true });
