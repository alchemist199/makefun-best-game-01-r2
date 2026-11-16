// Lamps: what each kind does, what it costs to build and raise, and where one
// may stand. Placement is a topology choice — grass only, clear of the lanes,
// clear of other lamps, inside the field — and the sim (sim.js) owns the
// actual mutation; this module only answers questions about lamps.

import { BEACON, FIELD, LAMP_HP, LAMPS, LANES, LINK_RANGE, RELAY_LINK } from './config.js';
import { distToSegment } from './network.js';

export function lampDef(kind) {
  return LAMPS[kind];
}

/** Stats for a lamp of a kind at a tier, with the run's boons applied. */
export function lampStats(kind, tier, boons) {
  const def = LAMPS[kind];
  const tierDmg = tier === 2 ? 1.4 : tier === 3 ? 1.9 : 1;
  const tierRange = tier === 2 ? 1.1 : tier === 3 ? 1.2 : 1;
  const tierRate = tier === 3 ? 1.1 : 1;
  const dmgMul = (boons.brightburn ? 1.12 : 1);
  const rangeMul = (boons.longwick ? 1.15 : 1);
  const rateMul = (boons.quickwick ? 1.1 : 1);
  return {
    dmg: def.dmg * tierDmg * dmgMul,
    range: def.range * tierRange * rangeMul,
    rate: def.rate * tierRate * rateMul,
    link: (kind === 'relay' ? RELAY_LINK : LINK_RANGE) + (boons.farlight ? 25 : 0),
    maxHp: LAMP_HP + (boons.thickglass ? 25 : 0),
  };
}

export function upgradeCost(kind, tier) {
  const base = LAMPS[kind].cost;
  if (tier === 1) return Math.round(base * 0.75);
  if (tier === 2) return Math.round(base * 1.1);
  return 0;
}

export function sellValue(kind, tier) {
  let spent = LAMPS[kind].cost;
  if (tier >= 2) spent += Math.round(LAMPS[kind].cost * 0.75);
  if (tier >= 3) spent += Math.round(LAMPS[kind].cost * 1.1);
  return Math.round(spent * 0.7);
}

function nearLane(x, y, margin) {
  for (const lane of LANES) {
    for (let i = 0; i < lane.length - 1; i += 1) {
      if (distToSegment(x, y, lane[i][0], lane[i][1], lane[i + 1][0], lane[i + 1][1]) < margin) return true;
    }
  }
  return false;
}

/** Why a lamp cannot be placed here, or null when it can. */
export function placementProblem(x, y, lamps) {
  if (x < 34 || x > FIELD.width - 34 || y < 80 || y > FIELD.height - 108) return 'Too close to the edge of the field.';
  if (Math.hypot(x - BEACON.x, y - BEACON.y) < 72) return 'Too close to the Beacon.';
  if (nearLane(x, y, 30)) return 'Lamps cannot stand on a lane.';
  for (const lamp of lamps) {
    if (Math.hypot(x - lamp.x, y - lamp.y) < 44) return 'Too close to another lamp.';
  }
  return null;
}

/** The lamp at a point, if any (for click-to-select), within 26 px. */
export function lampAt(x, y, lamps) {
  let best = null;
  let bestDist = 27;
  for (const lamp of lamps) {
    const d = Math.hypot(x - lamp.x, y - lamp.y);
    if (d < bestDist) {
      bestDist = d;
      best = lamp;
    }
  }
  return best;
}
