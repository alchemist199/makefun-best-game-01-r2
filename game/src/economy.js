// Economy: glow, bounties, and the between-wave boon draft. The draft offers
// three boons from the pool of ten, never repeating the boon picked last wave,
// and applying a pick mutates the world's boon flags (and, for War Chest and
// Deep Roots, glow and Beacon HP right away).

import { BOONS } from './config.js';

/** Draw three distinct boons, excluding the one picked last wave. */
export function draftBoons(rng, lastPickedId) {
  const pool = BOONS.filter((boon) => boon.id !== lastPickedId);
  const picks = [];
  const copy = [...pool];
  while (picks.length < 3 && copy.length > 0) {
    const index = Math.floor(rng() * copy.length);
    picks.push(copy.splice(index, 1)[0]);
  }
  return picks;
}

/** Apply a picked boon to the world state. Returns a one-line summary. */
export function applyBoon(state, boon) {
  state.boons[boon.id] = true;
  state.boonsTaken += 1;
  state.lastBoonId = boon.id;
  if (boon.id === 'warchest') state.glow += 60;
  if (boon.id === 'deeproots') {
    state.beaconMaxHp += 5;
    state.beaconHp = Math.min(state.beaconMaxHp, state.beaconHp + 5);
  }
  return boon.name;
}

/** Stars for a victory: 3 with 16+ Beacon HP left, 2 with 8+, else 1. */
export function starsFor(beaconHp) {
  if (beaconHp >= 16) return 3;
  if (beaconHp >= 8) return 2;
  return 1;
}
