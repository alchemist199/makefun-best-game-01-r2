// Waves: the 12-wave table, seeded jitter, spawn scheduling, and the
// Endless Night continuation after victory. A wave is a flat spawn list of
// {kind, at} entries; the sim pops them as their time comes.

import { TOTAL_WAVES, WAVES } from './config.js';

/** Spawn gap for a wave: 1.6 s early, shrinking to 0.7 s by wave 11. */
export function spawnGap(wave) {
  return Math.max(0.7, 1.6 - (wave - 1) * 0.09);
}

/** The composition of a wave, with seeded ±15% count jitter. Bosses never jitter. */
export function waveComposition(wave, rng, endless = 0) {
  let table = WAVES[wave];
  if (!table) {
    // Endless Night: the wave-11 flood, growing denser each night.
    table = WAVES[11].map(([kind, count]) => [kind, count + endless * 2]);
  }
  const list = [];
  for (const [kind, count] of table) {
    let n = count;
    if (kind !== 'snuffler' && kind !== 'gloomwarden') {
      n = Math.max(1, Math.round(count * (0.85 + rng() * 0.3)));
    }
    for (let i = 0; i < n; i += 1) list.push(kind);
  }
  // Shuffle the queue (boss first, so it leads the wave) with the seeded stream.
  const bosses = list.filter((kind) => kind === 'snuffler' || kind === 'gloomwarden');
  const rest = list.filter((kind) => kind !== 'snuffler' && kind !== 'gloomwarden');
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...bosses, ...rest];
}

/** Build the timed spawn queue for a wave. */
export function buildSpawnQueue(wave, rng, endless = 0) {
  const kinds = waveComposition(wave, rng, endless);
  const gap = spawnGap(Math.min(wave, 11));
  const queue = [];
  let at = 0.5;
  for (const kind of kinds) {
    queue.push({ kind, at });
    at += gap * (0.7 + rng() * 0.6);
  }
  // Wave 12 keeps a slow trickle of Crawlers behind the boss.
  if (wave === TOTAL_WAVES && endless === 0) {
    for (let i = 0; i < 6; i += 1) queue.push({ kind: 'crawler', at: 12 + i * 10 });
  }
  return queue;
}

/** Small icons for the next-wave preview beside the Begin Wave button. */
export function wavePreview(wave) {
  const table = WAVES[wave] || WAVES[11];
  return table.map(([kind, count]) => ({ kind, count }));
}

/** Wave-clear glow bonus: 40 + 10 x wave, before the early-call bonus. */
export function waveBonus(wave) {
  return 40 + 10 * wave;
}
