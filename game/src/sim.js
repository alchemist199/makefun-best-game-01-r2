// The fixed-step world for LUXWARD: state, one 1/60 s step, and every verb the
// player (or the autopilot) can do — place, upgrade, sell, rekindle, begin a
// wave, pick a boon. The sim owns the rules; the renderer only paints the
// state and the input module only queues intentions. One seeded RNG stream
// drives spawns, jitter and drafts, so a seed replays identically.

import {
  BEACON, DIFFICULTY, ENEMIES, FIELD, LAMPS, LAMP_HP, LANES, LEAK_RADIUS, REKINDLE_COST, RELAY_BOOST,
  SCORE, SHADE_DISC, SNUFF_SECONDS, SPITTER_RANGE, SPITTER_SHOT, TOTAL_WAVES,
} from './config.js';
import { createRandom } from './random.js';
import { recomputeLight, segmentBlockedByShade } from './network.js';
import { lampStats, placementProblem, sellValue, upgradeCost } from './towers.js';
import { advanceAlongLane, createEnemy, gloomPhase, resetEnemyIds, snufflerPulse } from './enemies.js';
import { buildSpawnQueue, waveBonus } from './waves.js';
import { applyBoon, draftBoons, starsFor } from './economy.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_PLACE = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_SNUFF = 64;
export const EVENT_BOSS_PHASE = 128;
export const EVENT_REKINDLE = 256;
export const EVENT_UPGRADE = 512;
export const EVENT_SELL = 1024;
export const EVENT_DRAFT = 2048;
export const EVENT_LINK_CUT = 4096;
export const EVENT_BOSS = 8192;

function freshState(seed, difficultyKey) {
  return {
    seed, difficultyKey, difficulty: DIFFICULTY[difficultyKey],
    time: 0, elapsed: 0, phase: 'build', wave: 0, endless: false, endlessWave: 0,
    glow: DIFFICULTY[difficultyKey].startGlow, score: 0,
    beaconHp: BEACON.maxHp, beaconMaxHp: BEACON.maxHp,
    lamps: [], enemies: [], projectiles: [], particles: [], floaters: [],
    spawnQueue: [], waveTime: 0, waveActive: false, restTimer: 0, earlyCall: false,
    snuffed: new Map(), lit: new Set(), boosted: new Set(), links: [], networkDirty: true,
    boons: {}, boonsTaken: 0, lastBoonId: null, draft: [],
    kills: 0, leaks: 0, killStreak: 0, killStreakTimer: 0,
    lampSeq: 1, boss: null, bossPhase: 0, bossSpawnTimer: 0,
    spareWickUsedWave: -1, hitStop: 0, shake: 0,
    banner: null, bannerUntil: 0, attractTimer: 0, attractSpawn: 0,
    won: false, lost: false, stars: 0, finalScore: 0,
  };
}

export function createWorld(seed, difficultyKey = 'kindled') {
  const rng = createRandom(seed);
  let state = freshState(seed, difficultyKey);
  resetEnemyIds();

  function refreshNetwork() {
    const shades = state.enemies.filter((e) => e.kind === 'shade');
    const result = recomputeLight(state.lamps, shades, state.snuffed, state.boons.farlight ? 25 : 0);
    state.lit = result.lit;
    state.boosted = result.boosted;
    state.links = result.links;
    state.networkDirty = false;
  }

  function showBanner(text, sub, seconds = 2.4) {
    state.banner = { text, sub };
    state.bannerUntil = state.time + seconds;
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.1 });
  }

  function burst(x, y, color, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const speed = 40 + rng() * 120;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.5 + rng() * 0.4, color, size: 2 + rng() * 3 });
    }
  }

  function snuffLamp(lamp, seconds) {
    if (state.snuffed.has(lamp.id)) return false;
    state.snuffed.set(lamp.id, seconds);
    state.networkDirty = true;
    return true;
  }

  function damageLamp(lamp, amount, events) {
    lamp.hp -= amount;
    lamp.flash = 0.25;
    if (lamp.hp > 0) return events;
    // A destroyed lamp is gone — unless Spare Wick rebuilds it once per wave.
    const idx = state.lamps.findIndex((entry) => entry.id === lamp.id);
    if (idx !== -1) state.lamps.splice(idx, 1);
    state.snuffed.delete(lamp.id);
    if (state.boons.sparewick && state.spareWickUsedWave !== state.wave) {
      state.spareWickUsedWave = state.wave;
      const rebuilt = { ...lamp, hp: lampStats(lamp.kind, lamp.tier, state.boons).maxHp, cooldown: 0 };
      state.lamps.push(rebuilt);
      addFloater(lamp.x, lamp.y - 24, 'Spare Wick rebuilds!', '#c792ff');
    } else {
      addFloater(lamp.x, lamp.y - 24, 'Lamp destroyed', '#ff6b6b');
    }
    state.networkDirty = true;
    return events;
  }

  function killEnemy(enemy, events) {
    const idx = state.enemies.findIndex((entry) => entry.id === enemy.id);
    if (idx === -1) return events;
    state.enemies.splice(idx, 1);
    const bounty = Math.round(enemy.bounty * state.difficulty.glowMul);
    state.glow += bounty;
    state.score += SCORE.kill;
    state.kills += 1;
    state.killStreak += 1;
    state.killStreakTimer = 4;
    addFloater(enemy.x, enemy.y - 18, `+${bounty}`, '#ffd76a');
    burst(enemy.x, enemy.y, ENEMIES[enemy.kind].color, enemy.kind === 'gloomwarden' ? 40 : 10);
    if (enemy.kind === 'shade' || enemy.kind === 'snuffler' || enemy.kind === 'gloomwarden') state.networkDirty = true;
    if (enemy.kind === 'gloomwarden') {
      state.boss = null;
      return finishWin(events);
    }
    if (enemy.kind === 'snuffler') state.boss = null;
    return events | EVENT_KILL;
  }

  function finishWin(events) {
    const timeBonus = Math.max(0, Math.round((SCORE.parSeconds - state.elapsed) * SCORE.timePerSecond));
    state.score += SCORE.win + state.beaconHp * SCORE.beaconHp + timeBonus;
    state.finalScore = state.score;
    state.stars = starsFor(state.beaconHp);
    state.phase = 'won';
    state.won = true;
    state.waveActive = false;
    return events | EVENT_WIN | EVENT_KILL;
  }

  function finishLoss(events) {
    state.phase = 'lost';
    state.lost = true;
    state.finalScore = state.score;
    state.waveActive = false;
    return events | EVENT_OVER;
  }

  function damageEnemy(enemy, amount, sourceKind) {
    if (enemy.kind === 'bulwark' && (sourceKind === 'hearth' || sourceKind === 'prism')) amount *= 0.75;
    if (enemy.kind === 'gloomwarden' && enemy.phase === 1) amount *= 0.75;
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (enemy.hp <= 0) return true;
    if (enemy.kind === 'gloomwarden') {
      const phase = gloomPhase(enemy);
      if (phase !== enemy.phase) {
        enemy.phase = phase;
        state.bossPhase = phase;
        state.hitStop = 0.5;
        state.bossSpawnTimer = 0;
        if (phase === 2) showBanner('THE GLOOMWARDEN SHEDS ITS SHELL', 'Shades rise — guard your beams!', 3);
        else showBanner('THE GLOOMWARDEN IS ENRAGED', 'It snuffs lamps and calls Spitters!', 3);
        return 'phase';
      }
    }
    return false;
  }

  function fireLamp(lamp, events) {
    const stats = lampStats(lamp.kind, lamp.tier, state.boons);
    if (lamp.kind === 'glimmer' || lamp.kind === 'relay') return events;
    let target = null;
    let targetDist = Infinity;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - lamp.x, enemy.y - lamp.y);
      if (d > stats.range) continue;
      // Bosses are the priority target; Spitters next (they kill lamps);
      // otherwise shoot the foe closest to the Beacon — the one about to leak.
      const toBeacon = Math.hypot(enemy.x - BEACON.x, enemy.y - BEACON.y);
      let score = toBeacon;
      if (enemy.kind === 'gloomwarden' || enemy.kind === 'snuffler') score = toBeacon - 10000;
      else if (enemy.kind === 'spitter') score = toBeacon - 5000;
      if (score < targetDist) {
        targetDist = score;
        target = enemy;
      }
    }
    if (!target) return events;
    const boost = state.boosted.has(lamp.id) ? 1 + RELAY_BOOST : 1;
    const dmg = stats.dmg * boost;
    lamp.cooldown = 1 / stats.rate;
    if (lamp.kind === 'prism') {
      const dx = target.x - lamp.x;
      const dy = target.y - lamp.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = lamp.x + (dx / len) * stats.range;
      const ey = lamp.y + (dy / len) * stats.range;
      state.projectiles.push({ kind: 'beam', x1: lamp.x, y1: lamp.y, x2: ex, y2: ey, life: 0.14, color: '#7ef0e0' });
      const hit = [];
      for (const enemy of [...state.enemies]) {
        const along = ((enemy.x - lamp.x) * dx + (enemy.y - lamp.y) * dy) / len;
        if (along < 0 || along > stats.range) continue;
        const px = lamp.x + (dx / len) * along;
        const py = lamp.y + (dy / len) * along;
        if (Math.hypot(enemy.x - px, enemy.y - py) < enemy.radius + 12) hit.push(enemy);
      }
      for (const enemy of hit) {
        const dead = damageEnemy(enemy, dmg, 'prism');
        if (dead === 'phase') events |= EVENT_BOSS_PHASE;
        else if (dead) events = killEnemy(enemy, events);
      }
      return events;
    }
    if (lamp.kind === 'pulse') {
      state.projectiles.push({ kind: 'burst', x: target.x, y: target.y, radius: 90, life: 0.25, color: '#ff9d3c' });
      for (const enemy of [...state.enemies]) {
        if (Math.hypot(enemy.x - target.x, enemy.y - target.y) < 90 + enemy.radius) {
          const dead = damageEnemy(enemy, dmg, 'pulse');
          if (dead === 'phase') events |= EVENT_BOSS_PHASE;
          else if (dead) events = killEnemy(enemy, events);
        }
      }
      return events;
    }
    if (lamp.kind === 'sunlance') {
      const shades = state.enemies.filter((e) => e.kind === 'shade');
      if (segmentBlockedByShade(lamp.x, lamp.y, target.x, target.y, shades)) return events;
    }
    state.projectiles.push({ kind: 'bolt', x: lamp.x, y: lamp.y, targetId: target.id, dmg, sourceKind: lamp.kind, speed: 900, life: 1.2, color: lamp.kind === 'sunlance' ? '#fff3c4' : '#ffd76a' });
    return events;
  }

  function stepEnemies(dt, events, attract = false) {
    const shadesBefore = state.enemies.some((e) => e.kind === 'shade');
    for (const enemy of [...state.enemies]) {
      if (enemy.flash > 0) enemy.flash -= dt;
      if (enemy.slowUntil > 0 && state.time > enemy.slowUntil) { enemy.slowFactor = 1; enemy.slowUntil = 0; }
      if (enemy.snuffCooldown > 0) enemy.snuffCooldown -= dt;
      if (enemy.spitCooldown > 0) enemy.spitCooldown -= dt;
      enemy.telegraph = 0;

      if (enemy.kind === 'snuffler') {
        if (enemy.bossTimer >= 7) enemy.telegraph = 1;
        if (snufflerPulse(enemy, dt)) {
          let snuffedAny = false;
          for (const lamp of state.lamps) {
            if (Math.hypot(lamp.x - enemy.x, lamp.y - enemy.y) < 90 && snuffLamp(lamp, SNUFF_SECONDS)) snuffedAny = true;
          }
          if (snuffedAny) events |= EVENT_SNUFF;
        }
      }
      if (enemy.kind === 'gloomwarden') {
        state.bossSpawnTimer += dt;
        if (enemy.phase === 2 && state.bossSpawnTimer >= 15) {
          state.bossSpawnTimer = 0;
          const shade = createEnemy('shade', state.wave, rng, state.difficulty);
          shade.x = enemy.x - 40; shade.y = enemy.y + 30; shade.waypoint = LANES[shade.lane].length;
          state.enemies.push(shade);
          state.networkDirty = true;
        }
        if (enemy.phase === 3 && state.bossSpawnTimer >= 10) {
          state.bossSpawnTimer = 0;
          let snuffedAny = false;
          for (const lamp of state.lamps) {
            if (Math.hypot(lamp.x - enemy.x, lamp.y - enemy.y) < 130 && snuffLamp(lamp, 4)) snuffedAny = true;
          }
          if (snuffedAny) events |= EVENT_SNUFF;
          for (let i = 0; i < 2; i += 1) {
            const spitter = createEnemy('spitter', state.wave, rng, state.difficulty);
            spitter.x = enemy.x + 50 + i * 30; spitter.y = enemy.y - 40;
            spitter.waypoint = LANES[spitter.lane].length;
            state.enemies.push(spitter);
          }
        }
      }

      // Snuffer: on reaching a lamp, put it out for 6 s, then move on.
      if (enemy.kind === 'snuffer' && enemy.snuffCooldown <= 0) {
        for (const lamp of state.lamps) {
          if (state.lit.has(lamp.id) && Math.hypot(lamp.x - enemy.x, lamp.y - enemy.y) < 46) {
            if (snuffLamp(lamp, SNUFF_SECONDS)) {
              enemy.snuffCooldown = 6;
              events |= EVENT_SNUFF;
              addFloater(lamp.x, lamp.y - 26, 'Snuffed!', '#c792ff');
            }
            break;
          }
        }
      }
      // Spitter: stops at range 180 and shoots the nearest lamp.
      if (enemy.kind === 'spitter') {
        let prey = null;
        let preyDist = SPITTER_RANGE;
        for (const lamp of state.lamps) {
          const d = Math.hypot(lamp.x - enemy.x, lamp.y - enemy.y);
          if (d < preyDist) { preyDist = d; prey = lamp; }
        }
        if (prey) {
          if (enemy.spitCooldown <= 0) {
            enemy.spitCooldown = 2;
            state.projectiles.push({ kind: 'spit', x: enemy.x, y: enemy.y, targetLampId: prey.id, dmg: SPITTER_SHOT, speed: 320, life: 2, color: '#c792ff' });
          }
          continue;
        }
      }
      const arrived = advanceAlongLane(enemy, dt);
      if (arrived || Math.hypot(enemy.x - BEACON.x, enemy.y - BEACON.y) < LEAK_RADIUS) {
        const idx = state.enemies.findIndex((entry) => entry.id === enemy.id);
        if (idx !== -1) state.enemies.splice(idx, 1);
        if (enemy.kind === 'shade' || enemy.kind === 'snuffler' || enemy.kind === 'gloomwarden') state.networkDirty = true;
        if (enemy.kind === 'gloomwarden') {
          state.boss = null;
          // A leaked Gloomwarden does not end wave 12: it returns in 5 s.
          // The wave is only won by killing it.
          state.spawnQueue.push({ kind: 'gloomwarden', at: state.waveTime + 5 });
          showBanner('THE GLOOMWARDEN SLIPS PAST', 'It will return — the Beacon loses 5 HP.', 2.5);
        }
        if (enemy.kind === 'snuffler') state.boss = null;
        if (attract) continue;
        state.leaks += 1;
        state.beaconHp -= enemy.leak;
        state.shake = 0.4;
        state.killStreak = 0;
        burst(BEACON.x, BEACON.y, '#ff6b6b', 12);
        events |= EVENT_LEAK;
        if (state.beaconHp <= 0) {
          state.beaconHp = 0;
          return { events: finishLoss(events), done: true };
        }
      }
    }
    if (shadesBefore !== state.enemies.some((e) => e.kind === 'shade')) state.networkDirty = true;
    return { events, done: false };
  }

  function stepLamps(dt, events) {
    // Glimmer auras: slow every foe inside a lit Glimmer's glow.
    for (const lamp of state.lamps) {
      if (lamp.kind !== 'glimmer' || !state.lit.has(lamp.id)) continue;
      const stats = lampStats('glimmer', lamp.tier, state.boons);
      const slow = state.boons.slowdusk ? 0.45 : 0.6;
      for (const enemy of state.enemies) {
        if (Math.hypot(enemy.x - lamp.x, enemy.y - lamp.y) < stats.range + enemy.radius) {
          enemy.slowFactor = slow;
          enemy.slowUntil = state.time + 0.25;
        }
      }
    }
    for (const lamp of state.lamps) {
      if (lamp.flash > 0) lamp.flash -= dt;
      if (lamp.cooldown > 0) lamp.cooldown -= dt;
      // Lamps slowly mend themselves when not being shot at — otherwise a
      // single Spitter grinds the whole network down one lamp at a time.
      const maxHp = lampStats(lamp.kind, lamp.tier, state.boons).maxHp;
      if (lamp.hp < maxHp) lamp.hp = Math.min(maxHp, lamp.hp + 1.5 * dt);
      if (!state.lit.has(lamp.id)) continue;
      if (state.snuffed.has(lamp.id)) continue;
      if (lamp.cooldown <= 0) events = fireLamp(lamp, events);
    }
    return events;
  }

  function stepProjectiles(dt, events) {
    for (const proj of [...state.projectiles]) {
      proj.life -= dt;
      if (proj.kind === 'bolt') {
        const target = state.enemies.find((e) => e.id === proj.targetId);
        if (!target) { proj.life = 0; continue; }
        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = proj.speed * dt;
        if (dist <= stepLen + target.radius) {
          proj.life = 0;
          const dead = damageEnemy(target, proj.dmg, proj.sourceKind);
          if (dead === 'phase') events |= EVENT_BOSS_PHASE;
          else if (dead) events = killEnemy(target, events);
        } else {
          proj.x += (dx / dist) * stepLen;
          proj.y += (dy / dist) * stepLen;
        }
      } else if (proj.kind === 'spit') {
        const lamp = state.lamps.find((entry) => entry.id === proj.targetLampId);
        if (!lamp) { proj.life = 0; continue; }
        const dx = lamp.x - proj.x;
        const dy = lamp.y - proj.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = proj.speed * dt;
        if (dist <= stepLen + 14) {
          proj.life = 0;
          events = damageLamp(lamp, proj.dmg, events);
        } else {
          proj.x += (dx / dist) * stepLen;
          proj.y += (dy / dist) * stepLen;
        }
      }
    }
    state.projectiles = state.projectiles.filter((p) => p.life > 0);
    return events;
  }

  function step(dt, attract = false) {
    let events = 0;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      return 0;
    }
    state.time += dt;
    if (state.phase === 'wave' || state.phase === 'build') state.elapsed += dt;
    if (state.banner && state.time > state.bannerUntil) state.banner = null;
    if (state.shake > 0) state.shake -= dt;
    if (state.killStreakTimer > 0) {
      state.killStreakTimer -= dt;
      if (state.killStreakTimer <= 0) state.killStreak = 0;
    }
    // Snuff timers tick down; a lamp coming back relights its branch.
    for (const [id, left] of [...state.snuffed.entries()]) {
      const next = left - dt;
      if (next <= 0) {
        state.snuffed.delete(id);
        state.networkDirty = true;
      } else state.snuffed.set(id, next);
    }
    // Spawning.
    if (state.waveActive && state.spawnQueue.length > 0) {
      state.waveTime += dt;
      while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.waveTime) {
        const spawn = state.spawnQueue.shift();
        const waveForStats = state.endless ? TOTAL_WAVES : state.wave;
        const enemy = createEnemy(spawn.kind, waveForStats, rng, state.difficulty, state.endlessWave);
        if (spawn.kind === 'gloomwarden') {
          state.boss = enemy;
          state.bossPhase = 1;
          events |= EVENT_BOSS;
          showBanner('THE GLOOMWARDEN AWAKENS', 'Three phases. Hold the light.', 3);
        }
        if (spawn.kind === 'snuffler') {
          state.boss = enemy;
          showBanner('THE SNUFFLER', 'It puts out every lamp it reaches.', 2.5);
        }
        state.enemies.push(enemy);
      }
    }
    // Attract mode (title screen): a demo wave that never ends and never hurts.
    if (attract) {
      state.attractSpawn += dt;
      if (state.attractSpawn > 2.5 && state.enemies.length < 6) {
        state.attractSpawn = 0;
        state.enemies.push(createEnemy(rng() < 0.6 ? 'crawler' : 'swift', 2, rng, state.difficulty));
      }
    }
    const moved = stepEnemies(dt, events, attract);
    events = moved.events;
    if (moved.done) return events;
    events = stepLamps(dt, events);
    events = stepProjectiles(dt, events);
    if (state.networkDirty) {
      const hadCut = state.links.some((link) => link.cut);
      refreshNetwork();
      if (!hadCut && state.links.some((link) => link.cut)) events |= EVENT_LINK_CUT;
    }
    // Particles and floaters are visual only.
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floaters) { f.y -= 26 * dt; f.life -= dt; }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    if (state.restTimer > 0 && state.phase === 'build') state.restTimer -= dt;
    // Wave clear: queue empty, field empty, wave running.
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0 && !state.won && !state.lost) {
      state.waveActive = false;
      let bonus = Math.round(waveBonus(state.wave) * state.difficulty.glowMul);
      if (state.earlyCall) bonus = Math.round(bonus * 1.1);
      state.glow += bonus;
      state.score += SCORE.waveClear * state.wave;
      state.earlyCall = false;
      if (state.endless) {
        state.phase = 'build';
        state.restTimer = 10;
        showBanner(`NIGHT ${state.endlessWave} CLEARED`, `+${bonus} glow`, 2.4);
      } else if (state.wave >= TOTAL_WAVES) {
        // Wave 12 only clears by killing the boss, handled in killEnemy.
        state.phase = 'build';
      } else {
        state.draft = draftBoons(rng, state.lastBoonId);
        state.phase = 'draft';
        showBanner(`WAVE ${state.wave} CLEARED`, `+${bonus} glow — choose a boon`, 2.4);
      }
      events |= EVENT_WAVE_CLEAR;
    }
    return events;
  }

  return {
    get state() {
      return state;
    },
    reset(newSeed = seed, difficultyKey = state.difficultyKey) {
      state = freshState(newSeed, difficultyKey);
      resetEnemyIds();
    },
    setDifficulty(difficultyKey) {
      state.difficultyKey = difficultyKey;
      state.difficulty = DIFFICULTY[difficultyKey];
      state.glow = DIFFICULTY[difficultyKey].startGlow;
      state.beaconMaxHp = BEACON.maxHp;
      state.beaconHp = BEACON.maxHp;
    },
    step,
    refreshNetwork,
    placeLamp(kind, x, y, free = false) {
      const problem = placementProblem(x, y, state.lamps);
      if (problem) return { ok: false, reason: problem };
      const def = LAMPS[kind];
      if (!def) return { ok: false, reason: 'Unknown lamp.' };
      if (!free && state.glow < def.cost) return { ok: false, reason: 'Not enough glow.' };
      if (!free) state.glow -= def.cost;
      const lamp = { id: state.lampSeq, kind, x: Math.round(x), y: Math.round(y), tier: 1, hp: LAMP_HP, cooldown: 0, flash: 0 };
      state.lampSeq += 1;
      state.lamps.push(lamp);
      state.networkDirty = true;
      refreshNetwork();
      return { ok: true, lamp };
    },
    upgradeLamp(id) {
      const lamp = state.lamps.find((entry) => entry.id === id);
      if (!lamp) return { ok: false, reason: 'No lamp there.' };
      if (lamp.tier >= 3) return { ok: false, reason: 'Already Mk III.' };
      const cost = upgradeCost(lamp.kind, lamp.tier);
      if (state.glow < cost) return { ok: false, reason: 'Not enough glow.' };
      state.glow -= cost;
      lamp.tier += 1;
      lamp.hp = lampStats(lamp.kind, lamp.tier, state.boons).maxHp;
      state.networkDirty = true;
      refreshNetwork();
      return { ok: true, lamp };
    },
    sellLamp(id) {
      const idx = state.lamps.findIndex((entry) => entry.id === id);
      if (idx === -1) return { ok: false, reason: 'No lamp there.' };
      const lamp = state.lamps[idx];
      state.glow += sellValue(lamp.kind, lamp.tier);
      state.lamps.splice(idx, 1);
      state.snuffed.delete(id);
      state.networkDirty = true;
      refreshNetwork();
      return { ok: true };
    },
    rekindleLamp(id) {
      if (!state.snuffed.has(id)) return { ok: false, reason: 'That lamp is not snuffed.' };
      const cost = state.boons.kindledhands ? 0 : REKINDLE_COST;
      if (state.glow < cost) return { ok: false, reason: 'Not enough glow to rekindle.' };
      state.glow -= cost;
      state.snuffed.delete(id);
      state.networkDirty = true;
      refreshNetwork();
      return { ok: true };
    },
    beginWave() {
      if (state.waveActive || state.phase === 'draft' || state.won || state.lost) return { ok: false };
      if (state.endless) state.endlessWave += 1;
      else state.wave += 1;
      const waveForQueue = state.endless ? TOTAL_WAVES + state.endlessWave : state.wave;
      state.spawnQueue = buildSpawnQueue(waveForQueue, rng, state.endlessWave);
      state.waveTime = 0;
      state.waveActive = true;
      state.phase = 'wave';
      state.earlyCall = state.restTimer > 0;
      state.restTimer = 0;
      showBanner(state.endless ? `ENDLESS NIGHT ${state.endlessWave}` : `WAVE ${state.wave} / ${TOTAL_WAVES}`, state.wave === 6 ? 'Something big walks the west lane…' : state.wave === 12 ? 'The Gloomwarden comes.' : '', 2.2);
      return { ok: true, wave: state.wave };
    },
    pickBoon(index) {
      if (state.phase !== 'draft' || !state.draft[index]) return { ok: false };
      const boon = state.draft[index];
      applyBoon(state, boon);
      state.draft = [];
      state.phase = 'build';
      state.restTimer = 10;
      return { ok: true, boon };
    },
    startEndless() {
      if (!state.won) return { ok: false };
      state.endless = true;
      state.endlessWave = 0;
      state.phase = 'build';
      state.won = false;
      state.restTimer = 10;
      return { ok: true };
    },
    demoSetup() {
      const spots = [[520, 300, 'hearth'], [760, 300, 'prism'], [520, 430, 'hearth'], [760, 430, 'hearth'], [500, 200, 'relay'], [700, 520, 'glimmer'], [880, 300, 'sunlance']];
      for (const [x, y, kind] of spots) this.placeLamp(kind, x, y, true);
      state.phase = 'wave';
      state.waveActive = false;
    },
    stateHash() {
      const core = {
        glow: state.glow, score: state.score, beaconHp: state.beaconHp, wave: state.wave,
        kills: state.kills, leaks: state.leaks,
        lamps: state.lamps.map((l) => [l.kind, l.x, l.y, l.tier, l.hp]),
        enemies: state.enemies.map((e) => [e.kind, Math.round(e.x), Math.round(e.y), e.hp]),
      };
      return JSON.stringify(core);
    },
  };
}
