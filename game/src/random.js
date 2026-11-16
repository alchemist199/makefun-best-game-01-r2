// One seeded stream for the whole simulation (mulberry32): the same seed
// replays the same waves, the same boon drafts and the same screenshot scenes.
// Rendering never draws from this stream, so a slow frame cannot change a run.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
