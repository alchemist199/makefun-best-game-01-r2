// Screenshot scenes (?shot=title|play|boss|victory) and the autopilot that
// plays them. Each scene runs the real rules forward from a fresh world for a
// fixed number of steps, so the frame is what a real game looks like and the
// same seed always gives the same frame. The autopilot is test-only: a greedy
// builder that places lamps on the grass anchors, upgrades the oldest lamp,
// picks boons by a fixed priority, and rekindles snuffed lamps when it can
// afford to. It exists to prove the balance, not as a shipped feature.

import { ANCHORS, LAMPS, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './sim.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

// The pilot's build order: [anchor index, lamp kind], nearest the Beacon first.
const BUILD_PLAN = [
  [1, 'hearth'], [0, 'hearth'], [2, 'hearth'], [3, 'prism'], [4, 'hearth'],
  [5, 'relay'], [6, 'hearth'], [7, 'relay'], [8, 'hearth'], [9, 'hearth'],
  [10, 'glimmer'], [11, 'pulse'], [12, 'glimmer'], [13, 'sunlance'], [14, 'prism'],
  [15, 'hearth'], [16, 'prism'], [17, 'sunlance'], [18, 'relay'], [19, 'pulse'],
  [20, 'hearth'], [21, 'hearth'], [22, 'prism'], [23, 'hearth'], [24, 'sunlance'],
  [25, 'prism'], [26, 'hearth'], [27, 'hearth'],
];

const BOON_PRIORITY = ['brightburn', 'longwick', 'farlight', 'quickwick', 'deeproots', 'thickglass', 'slowdusk', 'kindledhands', 'sparewick', 'warchest'];

export function createPilot() {
  return { placed: new Set(), tick: 0, upgradeCursor: 0 };
}

/** One autopilot decision point. Called once per sim step; acts at most every 15 steps. */
export function autopilot(state, world, pilot) {
  pilot.tick += 1;
  if (pilot.tick % 15 !== 0) return;
  if (state.phase === 'draft' && state.draft.length > 0) {
    let bestIndex = 0;
    let bestRank = 99;
    for (let i = 0; i < state.draft.length; i += 1) {
      const rank = BOON_PRIORITY.indexOf(state.draft[i].id);
      if (rank !== -1 && rank < bestRank) {
        bestRank = rank;
        bestIndex = i;
      }
    }
    world.pickBoon(bestIndex);
    return;
  }
  if (state.phase !== 'build' && state.phase !== 'wave') {
    // Mid-wave: rekindle any snuffed lamp we can afford.
    for (const id of [...state.snuffed.keys()]) {
      const result = world.rekindleLamp(id);
      if (result.ok) break;
    }
    return;
  }
  // Build phase (or mid-wave with glow to spend): place any plan lamp we can
  // afford, in plan order — an expensive lamp never blocks a cheaper one.
  for (let i = 0; i < BUILD_PLAN.length; i += 1) {
    if (pilot.placed.has(i)) continue;
    const [anchorIndex, kind] = BUILD_PLAN[i];
    if (state.glow < LAMPS[kind].cost) continue;
    const [x, y] = ANCHORS[anchorIndex];
    const result = world.placeLamp(kind, x, y);
    pilot.placed.add(i);
    if (!result.ok) continue;
  }
  // Upgrades only once the plan is built out, or when glow is piling up:
  // a new lamp buys coverage an upgrade cannot.
  const planDone = pilot.placed.size >= BUILD_PLAN.length;
  if ((planDone || state.glow > 400) && state.lamps.length > 0) {
    for (let tries = 0; tries < state.lamps.length; tries += 1) {
      const lamp = state.lamps[pilot.upgradeCursor % state.lamps.length];
      pilot.upgradeCursor += 1;
      if (lamp.kind !== 'relay' && lamp.tier < 3) {
        world.upgradeLamp(lamp.id);
        break;
      }
    }
  }
  if (state.phase === 'build') world.beginWave();
  else {
    for (const id of [...state.snuffed.keys()]) {
      const result = world.rekindleLamp(id);
      if (result.ok) break;
    }
  }
}

function runPilotUntil(world, pilot, seconds, stopWhen) {
  let events = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    autopilot(world.state, world, pilot);
    events = world.step(STEP, false);
    if (events & EVENT_WIN) return { events, won: true };
    if (events & EVENT_OVER) return { events, lost: true };
    if (stopWhen && stopWhen(world.state)) return { events, stopped: true };
  }
  return { events, stopped: false };
}

/**
 * Set `world` to the named scene (title, play, boss or victory) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'boss' && name !== 'victory' && name !== 'over') {
    world.demoSetup();
    for (let i = 0; i < 6 / STEP; i += 1) world.step(STEP, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const pilot = createPilot();
  if (name === 'over') {
    // Test-only scene: no lamps built, the Beacon falls — the defeat screen.
    world.beginWave();
    for (let i = 0; i < 600 / STEP; i += 1) {
      const events = world.step(STEP, false);
      if (events & EVENT_OVER) break;
      if (world.state.phase === 'draft') world.pickBoon(0);
      else if (world.state.phase === 'build' && !world.state.waveActive) world.beginWave();
    }
    return { screen: SCREEN_OVER, best: state.score };
  }
  if (name === 'play') {
    // Mid wave 7, with a Shade cutting a beam: run until wave 7 is live, then
    // wait for a Shade to cross a link; if none does, stage one onto the
    // busiest live link so the shot shows the game's central interaction.
    const reached = runPilotUntil(world, pilot, 600, (s) => s.wave === 7 && s.waveActive && s.enemies.length >= 3);
    if (reached.lost || reached.won) return { screen: reached.won ? SCREEN_WIN : SCREEN_OVER, best: state.score };
    // Mid wave 7, with a Shade cutting a beam: run until wave 7 is live, then
    // watch for a natural cut — and if a Shade is alive but has not crossed
    // a link yet, park it on the busiest live link and freeze it there, so
    // the shot shows the game's central interaction.
    let cutSeen = false;
    for (let i = 0; i < 20 / STEP; i += 1) {
      autopilot(state, world, pilot);
      world.step(STEP, false);
      if (state.links.some((link) => link.cut)) { cutSeen = true; break; }
      const shade = state.enemies.find((e) => e.kind === 'shade');
      if (shade) {
        // Park it on a peripheral lamp-to-lamp link (never a Beacon link, so
        // the cut darkens one branch, not the whole network): try the links
        // farthest from the Beacon first, and keep the first that leaves at
        // least 6 lamps lit.
        const candidates = state.links
          .filter((link) => !link.cut && !(link.ax === 640 && link.ay === 360))
          .sort((a, b) => {
            const da = Math.hypot((a.ax + a.bx) / 2 - 640, (a.ay + a.by) / 2 - 360);
            const db = Math.hypot((b.ax + b.bx) / 2 - 640, (b.ay + b.by) / 2 - 360);
            return db - da;
          });
        for (const liveLink of candidates) {
          shade.x = (liveLink.ax + liveLink.bx) / 2;
          shade.y = (liveLink.ay + liveLink.by) / 2;
          shade.speed = 0;
          world.refreshNetwork();
          if (state.links.some((link) => link.cut) && state.lit.size >= 6) { cutSeen = true; break; }
        }
        if (cutSeen) break;
      }
      if (!state.waveActive) break;
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  if (name === 'boss') {
    const reached = runPilotUntil(world, pilot, 1200, (s) => s.boss && s.boss.kind === 'gloomwarden' && s.bossPhase >= 2);
    if (reached.lost) return { screen: SCREEN_OVER, best: state.score };
    if (reached.won) return { screen: SCREEN_WIN, best: state.score };
    // The phase banner covers y 130–206: let the boss walk clear of it so
    // it is visible in the frame (at most 6 s; the fight is still phase 2).
    for (let i = 0; i < 6 / STEP; i += 1) {
      const boss = state.boss;
      if (!boss || boss.phase >= 3) break;
      if (boss.y > 220 || boss.x < 200 || boss.x > 1080) break;
      autopilot(state, world, pilot);
      const events = world.step(STEP, false);
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: state.score };
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: state.score };
    }
    return { screen: SCREEN_PLAY, best: state.score };
  }
  // Victory: play to the end; the pilot wins on the staging seed.
  const played = runPilotUntil(world, pilot, 1500, null);
  if (played.won) return { screen: SCREEN_WIN, best: state.score };
  if (played.lost) return { screen: SCREEN_OVER, best: state.score };
  return { screen: SCREEN_PLAY, best: state.score };
}
