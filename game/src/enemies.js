// Enemies: what each kind is, how it walks the lanes, and the two boss
// machines. Movement is pure waypoint walking; behaviour (snuffing, spitting,
// shadow discs, boss phases) is decided here and applied by the sim.

import { ENEMIES, LANES, SNUFF_SECONDS } from './config.js';

let nextEnemyId = 1;

/** HP / speed for a kind in a wave, with difficulty and wave scaling applied. */
export function enemyStats(kind, wave, difficulty) {
  const def = ENEMIES[kind];
  const hpScale = Math.pow(1.1, wave) * difficulty.hpMul;
  const speedScale = Math.min(1.6, Math.pow(1.03, wave));
  return {
    hp: Math.round(def.hp * hpScale),
    maxHp: Math.round(def.hp * hpScale),
    speed: def.speed * speedScale,
    bounty: def.bounty,
    leak: def.leak,
    radius: def.radius,
  };
}

export function createEnemy(kind, wave, rng, difficulty, endlessWave = 0) {
  const stats = enemyStats(kind, wave, difficulty);
  if (endlessWave > 0) {
    stats.hp = Math.round(stats.hp * Math.pow(1.25, endlessWave));
    stats.maxHp = stats.hp;
  }
  const laneIndex = Math.floor(rng() * LANES.length);
  const lane = LANES[laneIndex];
  const start = lane[0];
  return {
    id: nextEnemyId++,
    kind,
    x: start[0],
    y: start[1],
    lane: laneIndex,
    waypoint: 1,
    hp: stats.hp,
    maxHp: stats.maxHp,
    speed: stats.speed,
    bounty: stats.bounty,
    leak: stats.leak,
    radius: stats.radius,
    slowUntil: 0,
    slowFactor: 1,
    snuffCooldown: 0,
    snuffTarget: null,
    spitCooldown: 1 + rng() * 1.5,
    bossTimer: 0,
    phase: 1,
    telegraph: 0,
    spawnTick: 0,
    flash: 0,
  };
}

/** Reset enemy ids so a fresh world (or a fresh seed) replays identically. */
export function resetEnemyIds() {
  nextEnemyId = 1;
}

/** Walk one step along the lane; returns true when the final waypoint is reached. */
export function advanceAlongLane(enemy, dt) {
  const lane = LANES[enemy.lane];
  if (enemy.waypoint >= lane.length) return true;
  const target = lane[enemy.waypoint];
  const dx = target[0] - enemy.x;
  const dy = target[1] - enemy.y;
  const dist = Math.hypot(dx, dy);
  const step = enemy.speed * enemy.slowFactor * dt;
  if (dist <= step) {
    enemy.x = target[0];
    enemy.y = target[1];
    enemy.waypoint += 1;
    return enemy.waypoint >= lane.length;
  }
  enemy.x += (dx / dist) * step;
  enemy.y += (dy / dist) * step;
  return false;
}

/** Boss phase from remaining HP fraction (Gloomwarden only). */
export function gloomPhase(enemy) {
  const frac = enemy.hp / enemy.maxHp;
  if (frac > 0.66) return 1;
  if (frac > 0.33) return 2;
  return 3;
}

/** Seconds until the Snuffler's next snuff pulse, counting down from 8. */
export function snufflerPulse(enemy, dt) {
  enemy.bossTimer += dt;
  if (enemy.bossTimer >= 8) {
    enemy.bossTimer = 0;
    return true;
  }
  return false;
}

/** How long a lamp stays dark after a Snuffer or Snuffler puts it out. */
export function snuffDuration() {
  return SNUFF_SECONDS;
}
