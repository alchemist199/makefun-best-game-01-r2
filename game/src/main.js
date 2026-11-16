// Boot and the one loop for LUXWARD: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between five
// screens: title, play, paused, win and game over, with a boon draft
// intermission after every cleared wave.
// ?seed=N fixes the run. ?shot=title|play|boss|victory (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, BEST_STARS_KEY, MUTE_KEY, STEP } from './config.js';
import { createWorld, EVENT_BOSS_PHASE, EVENT_KILL, EVENT_LEAK, EVENT_OVER, EVENT_SNUFF, EVENT_WAVE_CLEAR, EVENT_WIN } from './sim.js';
import { ACTION_CONFIRM, ACTION_DESELECT, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SPEED, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buttonRects, createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { lampAt } from './towers.js';
import { LAMP_ORDER } from './config.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

window.addEventListener('resize', () => renderer.resize());
renderer.resize();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { selectedKind: null, selectedLampId: null, hover: null, best: scene.best, bestStars: 0, muted: audio.isMuted(), difficulty: 'kindled', speed: 1 };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let bestStars = readNumber(BEST_STARS_KEY);
  let difficulty = 'kindled';
  let speed = 1;
  let selectedKind = 'hearth';
  let selectedLampId = null;
  let hover = null;
  let accumulator = 0;
  let last = performance.now();
  try {
    if (window.localStorage.getItem(MUTE_KEY) === '1') audio.setMuted(true);
  } catch {
    // Mute preference is best-effort.
  }

  function announce(message) {
    status.textContent = message;
  }

  function ui() {
    return { selectedKind, selectedLampId, hover, best, bestStars, muted: audio.isMuted(), difficulty, speed };
  }

  function toField(click) {
    return {
      x: (click.x / canvas.clientWidth) * 1280,
      y: (click.y / canvas.clientHeight) * 720,
    };
  }

  function inRect(point, rect) {
    return rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function startGame() {
    audio.unlock();
    world.reset(Math.floor(Math.random() * 4294967296), difficulty);
    selectedKind = 'hearth';
    selectedLampId = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing ${difficulty}. Place lamps, chain them to the Beacon, press Space to begin wave 1.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    const finalScore = world.state.finalScore;
    if (finalScore > best) {
      best = finalScore;
      saveNumber(BEST_KEY, best);
    }
    if (won && world.state.stars > bestStars) {
      bestStars = world.state.stars;
      saveNumber(BEST_STARS_KEY, bestStars);
    }
    if (won) {
      audio.win();
      announce(`The dawn holds! ${world.state.stars} stars. Score ${finalScore}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`The light goes out on wave ${world.state.wave}. Score ${finalScore}. Best ${best}.`);
    }
  }

  function handleClick(point) {
    const rects = buttonRects(screen, world.state);
    if (screen === SCREEN_TITLE) {
      if (inRect(point, rects.kindled)) { difficulty = 'kindled'; world.setDifficulty('kindled'); return; }
      if (inRect(point, rects.smothered)) { difficulty = 'smothered'; world.setDifficulty('smothered'); return; }
      if (inRect(point, rects.start)) { startGame(); return; }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (inRect(point, rects.resume)) { screen = SCREEN_PLAY; announce('Playing.'); }
      else if (inRect(point, rects.restart)) startGame();
      else if (inRect(point, rects.quit)) { screen = SCREEN_TITLE; world.reset(seed, difficulty); }
      return;
    }
    if (screen === SCREEN_WIN) {
      if (inRect(point, rects.endless)) {
        world.startEndless();
        screen = SCREEN_PLAY;
        announce('Endless Night. The Gloom keeps coming.');
      } else if (inRect(point, rects.playAgain)) startGame();
      else if (inRect(point, rects.title)) { screen = SCREEN_TITLE; world.reset(seed, difficulty); }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (inRect(point, rects.tryAgain)) startGame();
      else if (inRect(point, rects.title)) { screen = SCREEN_TITLE; world.reset(seed, difficulty); }
      return;
    }
    // Play screen.
    if (world.state.phase === 'draft') {
      for (let i = 0; i < 3; i += 1) {
        if (inRect(point, rects[`boon${i}`])) {
          const picked = world.pickBoon(i);
          if (picked.ok) {
            announce(`Boon taken: ${picked.boon.name}. ${picked.boon.text}.`);
            audio.upgrade();
          }
          return;
        }
      }
      return;
    }
    if (inRect(point, rects.beginWave)) {
      const begun = world.beginWave();
      if (begun.ok) announce(`Wave ${begun.wave} begins.`);
      return;
    }
    if (inRect(point, rects.speed)) { speed = speed === 1 ? 2 : 1; return; }
    if (inRect(point, rects.pause)) { screen = SCREEN_PAUSED; announce('Paused.'); return; }
    if (inRect(point, rects.mute)) {
      const muted = audio.toggleMute();
      try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* best-effort */ }
      return;
    }
    for (let i = 1; i <= 6; i += 1) {
      if (inRect(point, rects[`lamp${i}`])) {
        selectedKind = LAMP_ORDER[i - 1];
        selectedLampId = null;
        return;
      }
    }
    if (selectedLampId) {
      if (inRect(point, rects.rekindle)) {
        const result = world.rekindleLamp(selectedLampId);
        if (result.ok) { audio.rekindle(); announce('Lamp rekindled — the chain burns again.'); }
        else announce(result.reason);
        return;
      }
      if (inRect(point, rects.upgrade)) {
        const result = world.upgradeLamp(selectedLampId);
        if (result.ok) { audio.upgrade(); announce(`Lamp raised to Mk ${['', 'I', 'II', 'III'][result.lamp.tier]}.`); }
        else announce(result.reason);
        return;
      }
      if (inRect(point, rects.sell)) {
        world.sellLamp(selectedLampId);
        selectedLampId = null;
        announce('Lamp sold.');
        return;
      }
    }
    // The field itself: place, select, or rekindle.
    const lamp = lampAt(point.x, point.y, world.state.lamps);
    if (lamp && world.state.snuffed.has(lamp.id)) {
      const result = world.rekindleLamp(lamp.id);
      if (result.ok) { audio.rekindle(); announce('Lamp rekindled — the chain burns again.'); }
      else announce(result.reason);
      return;
    }
    if (selectedKind && (world.state.phase === 'build' || world.state.phase === 'wave')) {
      const result = world.placeLamp(selectedKind, point.x, point.y);
      if (result.ok) {
        audio.place(LAMP_ORDER.indexOf(selectedKind));
        if (world.state.lit.has(result.lamp.id)) audio.linkSnap();
        announce(`${result.lamp.kind} placed. ${world.state.lit.has(result.lamp.id) ? 'Lit.' : 'Dark — chain it to the Beacon.'}`);
      } else {
        announce(result.reason);
      }
      return;
    }
    if (lamp) {
      selectedLampId = lamp.id;
      selectedKind = null;
      return;
    }
    selectedLampId = null;
  }

  function handleActions() {
    const actions = input.takeActions();
    const lampKey = input.takeLampKey();
    const boonKey = input.takeBoonKey();
    const click = input.takeClick();
    if (click) {
      audio.unlock();
      handleClick(toField(click));
    }
    const pointer = input.pointer();
    hover = pointer ? toField(pointer) : null;
    if (lampKey && screen === SCREEN_PLAY && world.state.phase !== 'draft') {
      selectedKind = LAMP_ORDER[lampKey - 1];
      selectedLampId = null;
    }
    if (boonKey && screen === SCREEN_PLAY && world.state.phase === 'draft') {
      const picked = world.pickBoon(boonKey - 1);
      if (picked.ok) announce(`Boon taken: ${picked.boon.name}.`);
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* best-effort */ }
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_SPEED && screen === SCREEN_PLAY) speed = speed === 1 ? 2 : 1;
    if (actions & ACTION_DESELECT) {
      selectedKind = null;
      selectedLampId = null;
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_WIN || screen === SCREEN_OVER || screen === SCREEN_PAUSED)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame();
      else if (screen === SCREEN_WIN || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      else if (screen === SCREEN_PLAY && world.state.phase === 'build') {
        const begun = world.beginWave();
        if (begun.ok) announce(`Wave ${begun.wave} begins.`);
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      if (world.state.lamps.length === 0) world.demoSetup();
      world.step(STEP, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, false);
    if (events & EVENT_KILL) audio.kill(world.state.killStreak);
    if (events & EVENT_LEAK) {
      audio.leak();
      announce(`A foe reached the Beacon! ${world.state.beaconHp} HP left.`);
    }
    if (events & EVENT_SNUFF) {
      audio.snuff();
      announce('A lamp was snuffed! Click it to rekindle.');
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      if (world.state.phase === 'draft') announce('Wave cleared! Choose a boon.');
    }
    if (events & EVENT_BOSS_PHASE) audio.bossSting();
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const stepsPerFrame = screen === SCREEN_PLAY ? speed : 1;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let guard = 0;
      while (accumulator >= STEP && guard < 60 && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        for (let k = 0; k < stepsPerFrame; k += 1) step();
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 60) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, ui());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  world.demoSetup();
  announce('LUXWARD. Press Space or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
