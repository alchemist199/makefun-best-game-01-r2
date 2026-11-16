// The renderer for LUXWARD: one canvas, one fixed 1280x720 field scaled to
// the window. It paints the night, the lanes, the Beacon, the living beam
// network, the lamps and the Gloom — then the HUD and whichever screen is on
// top. It never touches the simulation: every pulse and glow here reads the
// sim clock, never the wall clock, so a screenshot replays identically.

import { BEACON, ENEMIES, FIELD, FONT, LAMPS, LAMP_ORDER, LANES, PALETTE, SHADE_DISC, TOTAL_WAVES } from './config.js';
import { lampStats, sellValue, upgradeCost } from './towers.js';
import { wavePreview } from './waves.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const CARD_W = 148;
const CARD_H = 76;
const CARD_Y = 632;

/** Every clickable rect, named, so the main loop hit-tests the same boxes the renderer draws. */
export function buttonRects(screen, state) {
  const rects = {};
  if (screen === SCREEN_TITLE) {
    rects.start = { x: 490, y: 560, w: 300, h: 64 };
    rects.kindled = { x: 340, y: 470, w: 280, h: 56 };
    rects.smothered = { x: 660, y: 470, w: 280, h: 56 };
  }
  if (screen === SCREEN_PLAY) {
    rects.beginWave = { x: 1072, y: 636, w: 192, h: 68 };
    rects.speed = { x: 1064, y: 12, w: 64, h: 40 };
    rects.pause = { x: 1136, y: 12, w: 64, h: 40 };
    rects.mute = { x: 1208, y: 12, w: 56, h: 40 };
    for (let i = 0; i < 6; i += 1) {
      rects[`lamp${i + 1}`] = { x: 16 + i * (CARD_W + 4), y: CARD_Y, w: CARD_W, h: CARD_H };
    }
    if (state && state.phase === 'draft') {
      for (let i = 0; i < 3; i += 1) {
        rects[`boon${i}`] = { x: 170 + i * 320, y: 250, w: 300, h: 210 };
      }
    }
    if (state && state.selectedLampId) {
      rects.upgrade = { x: 1000, y: 218, w: 124, h: 36 };
      rects.sell = { x: 1136, y: 218, w: 124, h: 36 };
      rects.rekindle = { x: 1000, y: 180, w: 260, h: 32 };
    }
  }
  if (screen === SCREEN_PAUSED) {
    rects.resume = { x: 490, y: 330, w: 300, h: 56 };
    rects.restart = { x: 490, y: 400, w: 300, h: 56 };
    rects.quit = { x: 490, y: 470, w: 300, h: 56 };
  }
  if (screen === SCREEN_WIN) {
    rects.endless = { x: 350, y: 560, w: 260, h: 60 };
    rects.playAgain = { x: 640, y: 560, w: 260, h: 60 };
    rects.title = { x: 520, y: 634, w: 240, h: 48 };
  }
  if (screen === SCREEN_OVER) {
    rects.tryAgain = { x: 430, y: 540, w: 220, h: 60 };
    rects.title = { x: 680, y: 540, w: 220, h: 60 };
  }
  return rects;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align = 'left', bold = false) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawLane(ctx, lane) {
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 44;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lane[0][0], lane[0][1]);
  for (let i = 1; i < lane.length; i += 1) ctx.lineTo(lane[i][0], lane[i][1]);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.laneEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lane[0][0], lane[0][1] - 22);
  ctx.lineTo(lane[0][0], lane[0][1]);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.laneGlow;
  ctx.setLineDash([10, 18]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lane[0][0], lane[0][1]);
  for (let i = 1; i < lane.length; i += 1) ctx.lineTo(lane[i][0], lane[i][1]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBeacon(ctx, state) {
  const pulse = 1 + Math.sin(state.time * 2) * 0.06;
  const glowR = BEACON.lightRadius * pulse;
  const grad = ctx.createRadialGradient(BEACON.x, BEACON.y, 10, BEACON.x, BEACON.y, glowR * 1.6);
  grad.addColorStop(0, 'rgba(255, 215, 106, 0.30)');
  grad.addColorStop(0.5, 'rgba(255, 215, 106, 0.10)');
  grad.addColorStop(1, 'rgba(255, 215, 106, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(BEACON.x, BEACON.y, glowR * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 106, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(BEACON.x, BEACON.y, glowR, 0, Math.PI * 2);
  ctx.stroke();
  // The lantern itself: a fat radiant body with a white-gold heart.
  ctx.fillStyle = '#3a2c10';
  roundRect(ctx, BEACON.x - 30, BEACON.y - 40, 60, 80, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.beaconCore;
  roundRect(ctx, BEACON.x - 20, BEACON.y - 30, 40, 60, 8);
  ctx.fill();
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(BEACON.x, BEACON.y, 12 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(BEACON.x - 34, BEACON.y - 48, 68, 8);
  ctx.fillRect(BEACON.x - 34, BEACON.y + 40, 68, 8);
  text(ctx, 'THE DAWNHEART', BEACON.x, BEACON.y + 62, 13, PALETTE.gold, 'center', true);
}

function drawLamp(ctx, lamp, state) {
  const lit = state.lit.has(lamp.id);
  const snuffed = state.snuffed.has(lamp.id);
  const def = LAMPS[lamp.kind];
  const size = lamp.kind === 'relay' ? 15 : 13 + lamp.tier * 3;
  const cx = lamp.x;
  const cy = lamp.y;
  if (lit && !snuffed) {
    const grad = ctx.createRadialGradient(cx, cy - 8, 4, cx, cy - 8, 52);
    grad.addColorStop(0, def.color + 'cc');
    grad.addColorStop(1, def.color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 52, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pole and head.
  ctx.fillStyle = snuffed ? '#4a3a6e' : '#2c2416';
  ctx.fillRect(cx - 3, cy - 6, 6, 20);
  ctx.fillStyle = snuffed ? '#5b5470' : lit ? def.color : '#6b6b7a';
  if (lamp.kind === 'relay') {
    ctx.save();
    ctx.translate(cx, cy - 14);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    ctx.fillStyle = lit ? '#fff3c4' : '#8a8a9a';
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy - 12, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit ? '#fffbe8' : '#3a3a48';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, Math.max(4, size - 7), 0, Math.PI * 2);
    ctx.fill();
    // Tier prongs: Mk II gets two, Mk III three.
    if (lamp.tier >= 2) {
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - size - 4, cy - 4);
      ctx.lineTo(cx - size - 10, cy - 16);
      ctx.moveTo(cx + size + 4, cy - 4);
      ctx.lineTo(cx + size + 10, cy - 16);
      ctx.stroke();
    }
    if (lamp.tier >= 3) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size - 4);
      ctx.lineTo(cx, cy - size - 14);
      ctx.stroke();
    }
  }
  if (snuffed) {
    text(ctx, '!', cx, cy - 34, 22, '#c792ff', 'center', true);
    ctx.fillStyle = 'rgba(199, 146, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, size + 6, 0, Math.PI * 2);
    ctx.fill();
  }
  if (lamp.hp < lampStats(lamp.kind, lamp.tier, state.boons).maxHp) {
    const max = lampStats(lamp.kind, lamp.tier, state.boons).maxHp;
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 16, cy + 18, 32, 5);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(cx - 16, cy + 18, 32 * Math.max(0, lamp.hp / max), 5);
  }
  if (lamp.flash > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 10, size + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemy(ctx, enemy, state) {
  const def = ENEMIES[enemy.kind];
  const x = enemy.x;
  const y = enemy.y;
  if (enemy.kind === 'shade') {
    ctx.fillStyle = 'rgba(199, 146, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, SHADE_DISC, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(199, 146, 255, 0.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(x, y, SHADE_DISC, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  if (enemy.flash > 0) ctx.globalAlpha = 0.7;
  ctx.fillStyle = def.color;
  ctx.strokeStyle = '#0a1026';
  ctx.lineWidth = 2;
  if (enemy.kind === 'swift') {
    ctx.beginPath();
    ctx.moveTo(x + 14, y);
    ctx.lineTo(x - 10, y - 9);
    ctx.lineTo(x - 10, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (enemy.kind === 'bulwark') {
    roundRect(ctx, x - 18, y - 18, 36, 36, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9b8ff';
    ctx.fillRect(x - 10, y - 4, 20, 8);
  } else if (enemy.kind === 'spitter') {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * 19, y + Math.sin(a) * 19);
      ctx.lineTo(x + Math.cos(a + 0.39) * 11, y + Math.sin(a + 0.39) * 11);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (enemy.kind === 'snuffler' || enemy.kind === 'gloomwarden') {
    const r = enemy.radius;
    // Bosses must read at a glance even on a dark field: a purple halo and
    // a bright outline around the dark body, with glowing eyes.
    const halo = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1);
    halo.addColorStop(0, 'rgba(199, 146, 255, 0.35)');
    halo.addColorStop(1, 'rgba(199, 146, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c792ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#c792ff';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.2, 6, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y - r * 0.2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c792ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.15, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (enemy.telegraph) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r + 10 + Math.sin(state.time * 10) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(x, y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0a1026';
    ctx.beginPath();
    ctx.arc(x - 5, y - 3, 2.5, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (enemy.kind === 'snuffer') {
      ctx.strokeStyle = '#c792ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 5);
      ctx.lineTo(x + 7, y + 5);
      ctx.stroke();
    }
  }
  ctx.restore();
  if (enemy.hp < enemy.maxHp) {
    const w = enemy.kind === 'gloomwarden' || enemy.kind === 'snuffler' ? 64 : 34;
    ctx.fillStyle = '#1a1030';
    ctx.fillRect(x - w / 2, y - enemy.radius - 12, w, 5);
    ctx.fillStyle = enemy.kind === 'gloomwarden' ? '#c792ff' : '#ff6b6b';
    ctx.fillRect(x - w / 2, y - enemy.radius - 12, w * Math.max(0, enemy.hp / enemy.maxHp), 5);
  }
}

function drawHud(ctx, state, ui) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, FIELD.width, 64);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(FIELD.width, 64);
  ctx.stroke();
  const waveLabel = state.endless ? `NIGHT ${state.endlessWave}` : `WAVE ${Math.max(1, state.wave)} / ${TOTAL_WAVES}`;
  text(ctx, waveLabel, 16, 26, 20, PALETTE.text, 'left', true);
  text(ctx, state.phase === 'build' ? 'Build — place lamps' : state.phase === 'draft' ? 'Choose a boon' : state.phase === 'wave' ? 'The Gloom advances…' : '', 16, 50, 14, PALETTE.muted);
  text(ctx, `✦ ${state.glow} glow`, 220, 26, 20, PALETTE.gold, 'left', true);
  text(ctx, `Score ${state.score}`, 220, 50, 14, PALETTE.text);
  // Beacon HP bar.
  text(ctx, 'BEACON', 380, 18, 13, PALETTE.muted, 'left', true);
  ctx.fillStyle = '#222';
  roundRect(ctx, 380, 26, 200, 18, 5);
  ctx.fill();
  ctx.fillStyle = state.beaconHp <= 5 ? '#ff6b6b' : '#ffd76a';
  roundRect(ctx, 380, 26, 200 * Math.max(0, state.beaconHp / state.beaconMaxHp), 18, 5);
  ctx.fill();
  text(ctx, `${state.beaconHp} / ${state.beaconMaxHp} HP`, 590, 35, 15, PALETTE.text, 'left', true);
  const remaining = state.enemies.length + state.spawnQueue.length;
  text(ctx, `Foes left: ${remaining}`, 700, 26, 18, PALETTE.text, 'left', true);
  text(ctx, `Kills ${state.kills} · Leaks ${state.leaks}`, 700, 50, 14, PALETTE.muted);
  const speedLabel = ui.speed === 2 ? '2×' : '1×';
  text(ctx, `[F] ${speedLabel}`, 1064, 32, 16, PALETTE.text, 'left', true);
  text(ctx, '[P] ❚❚', 1136, 32, 16, PALETTE.text, 'left', true);
  text(ctx, ui.muted ? '[M] ✕' : '[M] ♪', 1208, 32, 16, PALETTE.text, 'left', true);
  // Boss bar across the top of the play area.
  if (state.boss) {
    const boss = state.boss;
    ctx.fillStyle = 'rgba(10, 16, 38, 0.85)';
    ctx.fillRect(340, 72, 600, 30);
    ctx.strokeStyle = '#c792ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(340, 72, 600, 30);
    text(ctx, ENEMIES[boss.kind].name.toUpperCase(), 352, 87, 15, '#c792ff', 'left', true);
    ctx.fillStyle = '#2a1b4a';
    ctx.fillRect(560, 80, 340, 14);
    ctx.fillStyle = '#c792ff';
    ctx.fillRect(560, 80, 340 * Math.max(0, boss.hp / boss.maxHp), 14);
    if (boss.kind === 'gloomwarden') {
      for (let i = 1; i <= 3; i += 1) {
        ctx.fillStyle = i <= boss.phase ? '#ffd76a' : '#4a3a6e';
        ctx.beginPath();
        ctx.arc(916 + i * 16, 87, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBottomBar(ctx, state, ui) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 624, FIELD.width, 96);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 624);
  ctx.lineTo(FIELD.width, 624);
  ctx.stroke();
  for (let i = 0; i < LAMP_ORDER.length; i += 1) {
    const kind = LAMP_ORDER[i];
    const def = LAMPS[kind];
    const x = 16 + i * (CARD_W + 4);
    const selected = ui.selectedKind === kind;
    const afford = state.glow >= def.cost;
    ctx.fillStyle = selected ? '#2a2410' : '#16233a';
    roundRect(ctx, x, CARD_Y, CARD_W, CARD_H, 8);
    ctx.fill();
    ctx.strokeStyle = selected ? PALETTE.gold : afford ? '#3a5a7a' : '#333';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.stroke();
    text(ctx, `${def.key} ${def.name}`, x + 10, CARD_Y + 14, 14, selected ? PALETTE.gold : PALETTE.text, 'left', true);
    text(ctx, def.role, x + 10, CARD_Y + 34, 12, PALETTE.muted);
    text(ctx, def.cost === 0 ? '' : `${def.cost} glow`, x + 10, CARD_Y + 56, 14, afford ? PALETTE.gold : '#ff6b6b', 'left', true);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x + CARD_W - 18, CARD_Y + 18, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Begin Wave button + next-wave preview.
  const rects = buttonRects(SCREEN_PLAY, state);
  const begin = rects.beginWave;
  const canBegin = state.phase === 'build' && !state.waveActive;
  ctx.fillStyle = canBegin ? '#c9a227' : '#3a3a4a';
  roundRect(ctx, begin.x, begin.y, begin.w, begin.h, 10);
  ctx.fill();
  text(ctx, state.phase === 'wave' ? 'WAVE RUNNING…' : state.phase === 'draft' ? 'PICK A BOON' : `BEGIN WAVE ${state.endless ? state.endlessWave + 1 : state.wave + 1}`, begin.x + begin.w / 2, begin.y + 26, 17, canBegin ? '#0a1026' : PALETTE.muted, 'center', true);
  text(ctx, 'Space · early call +10% glow', begin.x + begin.w / 2, begin.y + 50, 12, canBegin ? '#0a1026' : PALETTE.muted, 'center');
  if (state.phase === 'build' && !state.endless && state.wave < TOTAL_WAVES) {
    const preview = wavePreview(state.wave + 1);
    text(ctx, `Next: ${preview.map((p) => `${ENEMIES[p.kind].name}×${p.count}`).join('  ')}`, 16, 618, 13, PALETTE.muted);
  }
}

function drawLampPanel(ctx, state, ui) {
  const lamp = state.lamps.find((entry) => entry.id === ui.selectedLampId);
  if (!lamp) return;
  const def = LAMPS[lamp.kind];
  const stats = lampStats(lamp.kind, lamp.tier, state.boons);
  const x = 980;
  const y = 80;
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, x, y, 284, 176, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, `${def.name} — Mk ${['', 'I', 'II', 'III'][lamp.tier]}`, x + 14, y + 20, 17, PALETTE.text, 'left', true);
  text(ctx, state.lit.has(lamp.id) ? '● LIT — burning' : state.snuffed.has(lamp.id) ? '✕ SNUFFED — click Rekindle' : '○ DARK — no light chain', x + 14, y + 44, 14, state.lit.has(lamp.id) ? PALETTE.gold : '#c792ff');
  text(ctx, def.dmg > 0 ? `Damage ${Math.round(stats.dmg)} · Range ${Math.round(stats.range)} · ${stats.rate.toFixed(2)}/s` : def.role, x + 14, y + 68, 14, PALETTE.text);
  text(ctx, `Lamp HP ${Math.max(0, lamp.hp)} / ${stats.maxHp} · Link ${Math.round(stats.link)} px`, x + 14, y + 90, 14, PALETTE.text);
  if (state.snuffed.has(lamp.id)) {
    ctx.fillStyle = '#c792ff';
    roundRect(ctx, x + 14, y + 100, 256, 32, 6);
    ctx.fill();
    text(ctx, `REKINDLE — ${state.boons.kindledhands ? 'FREE' : `${10} glow`}`, x + 142, y + 116, 15, '#0a1026', 'center', true);
  }
  const rects = buttonRects(SCREEN_PLAY, state);
  if (lamp.tier < 3) {
    ctx.fillStyle = '#c9a227';
    roundRect(ctx, rects.upgrade.x - 980 + x, rects.upgrade.y, rects.upgrade.w, rects.upgrade.h, 6);
    ctx.fill();
    text(ctx, `UPGRADE ${upgradeCost(lamp.kind, lamp.tier)}`, rects.upgrade.x + 62, rects.upgrade.y + 18, 13, '#0a1026', 'center', true);
  }
  ctx.fillStyle = '#5a2a2a';
  roundRect(ctx, rects.sell.x - 980 + x, rects.sell.y, rects.sell.w, rects.sell.h, 6);
  ctx.fill();
  text(ctx, `SELL ${sellValue(lamp.kind, lamp.tier)}`, rects.sell.x + 62, rects.sell.y + 18, 13, '#f2f7f5', 'center', true);
}

function drawBanner(ctx, state) {
  if (!state.banner) return;
  ctx.fillStyle = 'rgba(10, 16, 38, 0.78)';
  ctx.fillRect(240, 130, 800, 76);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(240, 130, 800, 76);
  text(ctx, state.banner.text, 640, 158, 30, PALETTE.gold, 'center', true);
  if (state.banner.sub) text(ctx, state.banner.sub, 640, 188, 16, PALETTE.text, 'center');
}

function drawDraft(ctx, state) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'CHOOSE A BOON', 640, 190, 36, PALETTE.gold, 'center', true);
  text(ctx, 'One gift from the dawn. Click a card, or press 1 / 2 / 3.', 640, 222, 16, PALETTE.text, 'center');
  for (let i = 0; i < state.draft.length; i += 1) {
    const boon = state.draft[i];
    const x = 170 + i * 320;
    const y = 250;
    ctx.fillStyle = '#16233a';
    roundRect(ctx, x, y, 300, 210, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, `${i + 1}`, x + 150, y + 40, 26, PALETTE.muted, 'center', true);
    text(ctx, boon.name, x + 150, y + 86, 24, PALETTE.gold, 'center', true);
    text(ctx, boon.text, x + 150, y + 130, 16, PALETTE.text, 'center');
    text(ctx, 'Click to take', x + 150, y + 180, 14, PALETTE.muted, 'center');
  }
}

function drawTitle(ctx, state, ui) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'LUXWARD', 640, 120, 84, PALETTE.gold, 'center', true);
  text(ctx, '— keep the light flowing —', 640, 176, 26, PALETTE.text, 'center');
  text(ctx, 'A light-network tower defence. Your lamps only burn while they are chained', 640, 226, 18, PALETTE.text, 'center');
  text(ctx, 'to the Beacon by living beams. Shades cut the beams. Snuffers kill the lamps.', 640, 252, 18, PALETTE.text, 'center');
  // How to play panel.
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, 240, 286, 800, 168, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'HOW TO PLAY', 640, 312, 18, PALETTE.gold, 'center', true);
  text(ctx, '1–6 pick a lamp · click grass to place it · green link = lit, red = dark', 640, 342, 16, PALETTE.text, 'center');
  text(ctx, 'Space begins the wave · click a lamp to upgrade, sell or rekindle it', 640, 368, 16, PALETTE.text, 'center');
  text(ctx, 'F speed · P pause · M mute · survive 12 waves and kill the Gloomwarden', 640, 394, 16, PALETTE.text, 'center');
  text(ctx, '6 lamps: Hearth · Prism · Pulse · Glimmer · Sunlance · Dawn Relay — 6 foes: Crawler · Swift · Bulwark · Snuffer · Shade · Spitter', 640, 424, 13, PALETTE.muted, 'center');
  // Difficulty.
  const rects = buttonRects(SCREEN_TITLE, state);
  for (const [key, rect] of [['kindled', rects.kindled], ['smothered', rects.smothered]]) {
    const selected = ui.difficulty === key;
    ctx.fillStyle = selected ? '#2a2410' : '#16233a';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = selected ? PALETTE.gold : '#3a5a7a';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.stroke();
    text(ctx, key === 'kindled' ? 'KINDLED — normal' : 'SMOTHERED — hard', rect.x + rect.w / 2, rect.y + 28, 17, selected ? PALETTE.gold : PALETTE.text, 'center', true);
  }
  ctx.fillStyle = '#c9a227';
  roundRect(ctx, rects.start.x, rects.start.y, rects.start.w, rects.start.h, 12);
  ctx.fill();
  text(ctx, 'START — press Space', rects.start.x + 150, rects.start.y + 32, 22, '#0a1026', 'center', true);
  if (ui.best > 0) {
    text(ctx, `Best score ${ui.best}${ui.bestStars ? ` · ${'★'.repeat(ui.bestStars)}${'☆'.repeat(3 - ui.bestStars)}` : ''}`, 640, 650, 16, PALETTE.gold, 'center', true);
  }
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.7)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'PAUSED', 640, 240, 44, PALETTE.text, 'center', true);
  text(ctx, 'The Gloom waits. The light does not fade.', 640, 286, 17, PALETTE.muted, 'center');
  const rects = buttonRects(SCREEN_PAUSED, null);
  for (const [label, rect] of [['Resume — P / Esc', rects.resume], ['Restart — R', rects.restart], ['Quit to title', rects.quit]]) {
    ctx.fillStyle = '#16233a';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, label, rect.x + rect.w / 2, rect.y + 28, 18, PALETTE.text, 'center', true);
  }
  text(ctx, '1–6 lamps · Space wave · F speed · M mute · click a lamp to upgrade / sell / rekindle', 640, 560, 15, PALETTE.muted, 'center');
}

function starRow(ctx, stars, cx, y, size = 44) {
  for (let i = 0; i < 3; i += 1) {
    text(ctx, i < stars ? '★' : '☆', cx + (i - 1) * (size + 12), y, size, i < stars ? PALETTE.gold : '#4a4a5a', 'center', true);
  }
}

function drawWin(ctx, state, ui) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'THE DAWN HOLDS!', 640, 150, 56, PALETTE.gold, 'center', true);
  text(ctx, 'The Gloomwarden is broken. Every lamp still burns.', 640, 200, 18, PALETTE.text, 'center');
  starRow(ctx, state.stars, 640, 260, 52);
  const minutes = Math.floor(state.elapsed / 60);
  const seconds = Math.floor(state.elapsed % 60);
  const lines = [
    `Score ${state.finalScore}  ·  Best ${Math.max(ui.best, state.finalScore)}`,
    `Waves ${TOTAL_WAVES} cleared  ·  Kills ${state.kills}  ·  Leaks ${state.leaks}`,
    `Time ${minutes}:${String(seconds).padStart(2, '0')}  ·  Boons taken ${state.boonsTaken}  ·  Beacon ${state.beaconHp} HP left`,
  ];
  lines.forEach((line, i) => text(ctx, line, 640, 330 + i * 34, 19, PALETTE.text, 'center'));
  const rects = buttonRects(SCREEN_WIN, state);
  ctx.fillStyle = '#c9a227';
  roundRect(ctx, rects.endless.x, rects.endless.y, rects.endless.w, rects.endless.h, 10);
  ctx.fill();
  text(ctx, 'ENDLESS NIGHT', rects.endless.x + 130, rects.endless.y + 30, 19, '#0a1026', 'center', true);
  ctx.fillStyle = '#16233a';
  roundRect(ctx, rects.playAgain.x, rects.playAgain.y, rects.playAgain.w, rects.playAgain.h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'PLAY AGAIN — R', rects.playAgain.x + 130, rects.playAgain.y + 30, 19, PALETTE.text, 'center', true);
  text(ctx, 'Title', rects.title.x + 120, rects.title.y + 24, 16, PALETTE.muted, 'center');
}

function drawOver(ctx, state, ui) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.75)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'THE LIGHT GOES OUT…', 640, 180, 48, '#ff6b6b', 'center', true);
  text(ctx, `The Beacon fell on wave ${Math.max(1, state.wave)}. The Gloom takes the field.`, 640, 240, 18, PALETTE.text, 'center');
  text(ctx, `Score ${state.finalScore}  ·  Best ${Math.max(ui.best, state.finalScore)}  ·  Kills ${state.kills}  ·  Waves ${Math.max(1, state.wave)}`, 640, 300, 19, PALETTE.text, 'center');
  text(ctx, 'Tip: chain lamps back to the Beacon, kill Shades first, and keep a Relay behind the front line.', 640, 340, 16, PALETTE.muted, 'center');
  const rects = buttonRects(SCREEN_OVER, state);
  for (const [label, rect] of [['TRY AGAIN — R', rects.tryAgain], ['Title', rects.title]]) {
    ctx.fillStyle = '#16233a';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, label, rect.x + rect.w / 2, rect.y + 30, 19, PALETTE.text, 'center', true);
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  return {
    resize,
    draw(state, screen, ui) {
      const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
      const ox = (canvas.width - FIELD.width * scale) / 2;
      const oy = (canvas.height - FIELD.height * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050814';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, ox, oy);
      if (state.shake > 0) {
        const mag = state.shake * 8;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      // Night sky and ground.
      const sky = ctx.createLinearGradient(0, 0, 0, FIELD.height);
      sky.addColorStop(0, PALETTE.skyTop);
      sky.addColorStop(0.55, PALETTE.skyMid);
      sky.addColorStop(1, PALETTE.skyLow);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = PALETTE.ground;
      ctx.fillRect(0, 64, FIELD.width, 560);
      // Faint stars.
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 40; i += 1) {
        const sx = (i * 173) % FIELD.width;
        const sy = 70 + ((i * 97) % 200);
        ctx.fillRect(sx, sy, 2, 2);
      }
      for (const lane of LANES) drawLane(ctx, lane);
      // Beams: thick gold lines with a travelling pulse, cut links drawn dim.
      const pulse = (state.time * 0.9) % 1;
      for (const link of state.links) {
        if (link.cut) {
          ctx.strokeStyle = 'rgba(199, 146, 255, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 8]);
        } else {
          ctx.strokeStyle = 'rgba(255, 215, 106, 0.85)';
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(link.ax, link.ay);
        ctx.lineTo(link.bx, link.by);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!link.cut) {
          const px = link.ax + (link.bx - link.ax) * pulse;
          const py = link.ay + (link.by - link.ay) * pulse;
          ctx.fillStyle = '#fff3c4';
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawBeacon(ctx, state);
      for (const lamp of state.lamps) drawLamp(ctx, lamp, state);
      for (const enemy of state.enemies) drawEnemy(ctx, enemy, state);
      // Projectiles.
      for (const proj of state.projectiles) {
        if (proj.kind === 'bolt') {
          ctx.fillStyle = proj.color;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.sourceKind === 'sunlance' ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (proj.kind === 'beam') {
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 5;
          ctx.globalAlpha = Math.max(0, proj.life / 0.14);
          ctx.beginPath();
          ctx.moveTo(proj.x1, proj.y1);
          ctx.lineTo(proj.x2, proj.y2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (proj.kind === 'burst') {
          ctx.strokeStyle = proj.color;
          ctx.lineWidth = 3;
          ctx.globalAlpha = Math.max(0, proj.life / 0.25);
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius * (1 - proj.life / 0.25) + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (proj.kind === 'spit') {
          ctx.fillStyle = proj.color;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const f of state.floaters) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
        text(ctx, f.text, f.x, f.y, 15, f.color, 'center', true);
      }
      ctx.globalAlpha = 1;
      // Placement preview: range ring + green/red link preview.
      if (ui.hover && ui.selectedKind && (screen === SCREEN_PLAY) && state.phase === 'build') {
        const def = LAMPS[ui.selectedKind];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ui.hover.x, ui.hover.y, def.range, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawHud(ctx, state, ui);
      // The bottom lamp bar belongs to play (and its overlays); the end
      // screens keep their own buttons and a clean field behind them.
      if (screen !== SCREEN_WIN && screen !== SCREEN_OVER) drawBottomBar(ctx, state, ui);
      if (screen === SCREEN_PLAY && state.phase !== 'draft') drawLampPanel(ctx, state, ui);
      drawBanner(ctx, state);
      if (screen === SCREEN_PLAY && state.phase === 'draft') drawDraft(ctx, state);
      if (screen === SCREEN_TITLE) drawTitle(ctx, state, ui);
      if (screen === SCREEN_PAUSED) drawPaused(ctx);
      if (screen === SCREEN_WIN) drawWin(ctx, state, ui);
      if (screen === SCREEN_OVER) drawOver(ctx, state, ui);
      // Wave-1 teaching hint.
      if (screen === SCREEN_PLAY && state.wave === 0 && state.phase === 'build') {
        ctx.fillStyle = 'rgba(10, 16, 38, 0.8)';
        ctx.fillRect(280, 560, 720, 52);
        text(ctx, 'Pick a lamp below (1–6), click the grass to place it — then press Space to begin wave 1.', 640, 586, 16, PALETTE.text, 'center');
      }
    },
  };
}
