// LUXWARD — every tuning number, table and colour in one place.
// A light-network tower defence: lamps only burn while chained back to the
// Beacon at the middle of a fixed 1280x720 field, and the Gloom cuts the
// beams. Nothing here depends on the window size; the renderer scales the
// fixed field to whatever the browser gives it.

export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const TOTAL_WAVES = 12;
export const BEACON = { x: 640, y: 360, radius: 46, lightRadius: 170, maxHp: 20 };
export const LINK_RANGE = 150;
export const RELAY_LINK = 190;
export const REKINDLE_COST = 10;
export const SELL_REFUND = 0.7;

// Two serpentine lanes that merge just short of the Beacon. Enemies walk the
// waypoints in order, then leak into the Beacon when they get close.
export const LANES = [
  [[-30, 190], [290, 190], [290, 470], [530, 470], [600, 392]],
  [[330, -30], [330, 130], [570, 130], [570, 300], [612, 372]],
];
export const LEAK_RADIUS = 54;

export const DIFFICULTY = {
  kindled: { label: 'Kindled', startGlow: 120, hpMul: 1, glowMul: 1, blurb: 'The intended fight. Learn the network, hold the dawn.' },
  smothered: { label: 'Smothered', startGlow: 100, hpMul: 1.25, glowMul: 0.8, blurb: 'Harder: tougher Gloom, thinner glow. For wardens who know the lanes.' },
};

// Lamps: cost, damage, range, shots per second, link range, colour, role.
// Tier scaling lives in towers.js; Mk II is +40% damage / +10% range,
// Mk III is +90% damage / +20% range / +10% rate over Mk I.
export const LAMPS = {
  hearth: { key: '1', name: 'Hearth Lamp', cost: 40, dmg: 12, range: 140, rate: 1.2, link: 150, color: '#ffd76a', role: 'Steady bolt', desc: 'Cheap workhorse. Fires a warm bolt at the nearest foe.' },
  prism: { key: '2', name: 'Prism Lamp', cost: 70, dmg: 14, range: 170, rate: 0.8, link: 150, color: '#7ef0e0', role: 'Piercing line', desc: 'Its beam passes through every foe in a straight line.' },
  pulse: { key: '3', name: 'Pulse Lamp', cost: 90, dmg: 16, range: 120, rate: 0.5, link: 150, color: '#ff9d3c', role: 'Slow AoE burst', desc: 'A slow burst that hurts everything near the blast.' },
  glimmer: { key: '4', name: 'Glimmer Lamp', cost: 60, dmg: 0, range: 150, rate: 0, link: 150, color: '#9df2ff', role: 'Slow, no damage', desc: 'Foes inside its glow move 40% slower. No attack of its own.' },
  sunlance: { key: '5', name: 'Sunlance', cost: 120, dmg: 55, range: 280, rate: 0.35, link: 150, color: '#fff3c4', role: 'Long-range sniper', desc: 'Huge single-target damage — but a shadow disc blocks its shot.' },
  relay: { key: '6', name: 'Dawn Relay', cost: 50, dmg: 0, range: 0, rate: 0, link: 190, color: '#c792ff', role: 'Network + support', desc: 'Extends the chain 190 px and boosts lamps linked through it +15%.' },
};
export const LAMP_ORDER = ['hearth', 'prism', 'pulse', 'glimmer', 'sunlance', 'relay'];
export const LAMP_HP = 40;
export const RELAY_BOOST = 0.15;

// Enemies: base HP and speed at wave 1, bounty in glow, leak cost in Beacon HP.
export const ENEMIES = {
  crawler: { name: 'Crawler', hp: 30, speed: 55, bounty: 6, leak: 1, radius: 15, color: '#8a6fd6', desc: 'Basic walker.' },
  swift: { name: 'Swift', hp: 18, speed: 95, bounty: 7, leak: 1, radius: 11, color: '#e0aaff', desc: 'Fast, fragile dart.' },
  bulwark: { name: 'Bulwark', hp: 100, speed: 32, bounty: 16, leak: 2, radius: 20, color: '#5b4a8a', desc: 'Armoured: -25% from Hearth and Prism.' },
  snuffer: { name: 'Snuffer', hp: 45, speed: 48, bounty: 10, leak: 1, radius: 14, color: '#3d2b63', desc: 'Puts out a lamp for 6 s, then moves on.' },
  shade: { name: 'Shade', hp: 60, speed: 40, bounty: 12, leak: 1, radius: 16, color: '#c792ff', desc: 'Its shadow disc cuts any light link crossing it.' },
  spitter: { name: 'Spitter', hp: 35, speed: 45, bounty: 10, leak: 1, radius: 13, color: '#7b5ea7', desc: 'Stops at range 180 and shoots lamps (40 HP).' },
  snuffler: { name: 'The Snuffler', hp: 600, speed: 30, bounty: 120, leak: 3, radius: 30, color: '#2a1b4a', desc: 'Wave 6 mini-boss: snuffs every lamp within 90 px, every 8 s.' },
  gloomwarden: { name: 'The Gloomwarden', hp: 1400, speed: 20, bounty: 300, leak: 5, radius: 38, color: '#1d1038', desc: 'Wave 12 boss: three phases, sheds its shell, calls Shades and Spitters.' },
};
export const SHADE_DISC = 70;
export const SNUFF_SECONDS = 6;
export const SPITTER_RANGE = 130;
export const SPITTER_SHOT = 6;

// Wave table: [enemy kind, count] per wave. Counts get seeded jitter ±15% and
// HP scales x1.10^wave, speed x1.03^wave (capped +60%).
export const WAVES = {
  1: [['crawler', 8]],
  2: [['crawler', 10], ['swift', 4]],
  3: [['crawler', 8], ['swift', 6], ['snuffer', 2]],
  4: [['crawler', 12], ['swift', 6], ['bulwark', 2]],
  5: [['swift', 10], ['snuffer', 4], ['bulwark', 3], ['shade', 2]],
  6: [['snuffler', 1], ['crawler', 8]],
  7: [['crawler', 14], ['swift', 8], ['snuffer', 4], ['shade', 3], ['spitter', 2]],
  8: [['swift', 10], ['bulwark', 5], ['shade', 4], ['spitter', 3]],
  9: [['crawler', 16], ['swift', 10], ['snuffer', 5], ['shade', 4]],
  10: [['swift', 12], ['bulwark', 6], ['shade', 5], ['spitter', 4]],
  11: [['crawler', 18], ['swift', 12], ['snuffer', 6], ['shade', 5], ['spitter', 5]],
  12: [['gloomwarden', 1]],
};

// Boon draft pool: after every cleared wave, pick 1 of 3.
export const BOONS = [
  { id: 'longwick', name: 'Long Wick', text: '+15% lamp range' },
  { id: 'brightburn', name: 'Bright Burn', text: '+12% lamp damage' },
  { id: 'quickwick', name: 'Quick Wick', text: '+10% fire rate' },
  { id: 'deeproots', name: 'Deep Roots', text: '+5 max Beacon HP and heal 5' },
  { id: 'farlight', name: 'Far Light', text: '+25 link range' },
  { id: 'warchest', name: 'War Chest', text: '+60 glow now' },
  { id: 'kindledhands', name: 'Kindled Hands', text: 'Rekindle is free for the rest of the run' },
  { id: 'thickglass', name: 'Thick Glass', text: '+25 lamp HP' },
  { id: 'slowdusk', name: 'Slow Dusk', text: 'Glimmer slow 40% → 55%' },
  { id: 'sparewick', name: 'Spare Wick', text: 'One destroyed lamp per wave is rebuilt free' },
];

export const SCORE = { kill: 10, waveClear: 100, win: 1000, beaconHp: 50, parSeconds: 720, timePerSecond: 10 };

// Grass anchors the autopilot (and a new player, by example) builds on:
// near the lanes, clear of them, and chainable back to the Beacon.
export const ANCHORS = [
  [520, 300], [520, 430], [720, 400], [640, 220], [380, 380], [500, 200],
  [220, 280], [240, 430], [300, 560], [560, 540], [700, 520], [420, 560],
  [180, 560], [700, 220], [880, 300], [760, 300], [760, 430], [1020, 180],
  [1000, 300], [900, 470], [400, 180], [300, 90], [180, 90], [180, 430],
  [480, 90], [1020, 470], [1080, 300], [900, 90],
];

export const PALETTE = {
  skyTop: '#0a1026', skyMid: '#101a3d', skyLow: '#1a2a4a', ground: '#0d1a2e',
  grass: '#16324a', grassDark: '#0f2438', lane: '#2b2140', laneEdge: '#4a3a6e',
  laneGlow: '#6b5a9e', beaconCore: '#fff3c4', beaconGlow: '#ffd76a', beam: '#ffd76a',
  beamDim: '#8a7a4a', panel: '#0e1a2ee6', panelEdge: '#c9a227', text: '#f2f7f5',
  muted: '#93a8b5', danger: '#ff6b6b', shadeDisc: '#c792ff', gloom: '#2a1b4a',
  gold: '#ffd76a', teal: '#7ef0e0',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'luxward.best';
export const BEST_STARS_KEY = 'luxward.stars';
export const MUTE_KEY = 'luxward.muted';
