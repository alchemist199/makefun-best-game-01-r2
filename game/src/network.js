// THE light network: which lamps burn, which links carry the light, and what
// the Gloom has cut. This is a pure function of (lamps, live shades, snuffed
// lamps) — the sim calls it only when the network changes (a lamp is placed,
// sold, upgraded, snuffed, rekindled, or a Shade spawns or dies), never per
// frame, and the result is cached on the world state.
//
// A lamp is LIT when it can reach the Beacon through a chain of live links:
// each hop must be within link range, must not cross a live shadow disc, and
// must not pass through a snuffed or destroyed lamp. A Dawn Relay in the chain
// boosts every lamp beyond it by +15% damage.

import { BEACON, LINK_RANGE, RELAY_LINK, SHADE_DISC } from './config.js';

/** Distance from a point to a line segment, for shadow-disc link cutting. */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** True when the segment between two points crosses a live shadow disc. */
export function segmentBlockedByShade(x1, y1, x2, y2, shades) {
  for (let i = 0; i < shades.length; i += 1) {
    if (distToSegment(shades[i].x, shades[i].y, x1, y1, x2, y2) < SHADE_DISC) return true;
  }
  return false;
}

function linkRangeOf(lamp) {
  return lamp.kind === 'relay' ? RELAY_LINK : LINK_RANGE;
}

/**
 * Recompute the lit set. `lamps` are live lamps (destroyed ones already
 * removed), `shades` are live Shade enemies, `snuffed` is a Set of lamp ids
 * currently extinguished. Returns { lit: Set, boosted: Set, links: [...] }
 * where links carry {ax, ay, bx, by, cut} for the renderer, including cut
 * links drawn dim so the player sees exactly where the Gloom broke the chain.
 */
export function recomputeLight(lamps, shades, snuffed, extraLink = 0) {
  const lit = new Set();
  const boosted = new Set();
  const links = [];
  const queue = [];
  // Nodes: index -1 is the Beacon, the rest are lamp indexes.
  const nodes = [{ x: BEACON.x, y: BEACON.y, link: BEACON.lightRadius, id: -1, kind: 'beacon', throughRelay: false }];
  for (let i = 0; i < lamps.length; i += 1) {
    nodes.push({ x: lamps[i].x, y: lamps[i].y, link: linkRangeOf(lamps[i]) + extraLink, id: lamps[i].id, kind: lamps[i].kind, throughRelay: false });
  }
  const reached = new Set([-1]);
  const relayPath = new Map([[-1, false]]);
  queue.push(0);
  while (queue.length > 0) {
    const current = nodes[queue.shift()];
    for (let j = 1; j < nodes.length; j += 1) {
      const other = nodes[j];
      if (reached.has(other.id)) continue;
      if (snuffed.has(other.id)) continue;
      const reach = Math.max(current.link, other.link);
      const dist = Math.hypot(other.x - current.x, other.y - current.y);
      if (dist > reach) continue;
      const cut = segmentBlockedByShade(current.x, current.y, other.x, other.y, shades);
      links.push({ ax: current.x, ay: current.y, bx: other.x, by: other.y, cut });
      if (cut) continue;
      reached.add(other.id);
      const viaRelay = relayPath.get(current.id) || current.kind === 'relay';
      relayPath.set(other.id, viaRelay);
      if (viaRelay) boosted.add(other.id);
      if (other.kind !== 'relay') lit.add(other.id);
      queue.push(j);
    }
  }
  // Relays themselves are lit when reached (they glow, they just do not shoot).
  for (const id of reached) {
    if (id !== -1) {
      const lamp = lamps.find((entry) => entry.id === id);
      if (lamp && lamp.kind === 'relay') lit.add(id);
    }
  }
  return { lit, boosted, links };
}

/** Would a lamp placed at (x, y) be lit right now? Used for the green/red placement preview. */
export function wouldBeLit(x, y, kind, lamps, shades, snuffed, extraLink = 0) {
  const probe = { id: -999, x, y, kind };
  const result = recomputeLight([...lamps, probe], shades, snuffed, extraLink);
  return result.lit.has(-999);
}
