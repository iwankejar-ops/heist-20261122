// The Meridian Job — entry point: canvas setup, keyboard and mouse input,
// the frame loop with an FPS meter, and the ?shot= staging hook. The game
// itself lives in game.js; this file only wires it to the browser.

import { VIEW_W, VIEW_H } from './config.js';
import { createGame, startGame, update, tossCoin } from './game.js';
import { render } from './render.js';
import { createAudio } from './audio.js';
import { applyShot, shotFromQuery } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW_W;
canvas.height = VIEW_H;

const audio = createAudio();
const state = createGame(1);

const input = {
  up: false, down: false, left: false, right: false,
  sneak: false, grab: false,
};

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sneak', ShiftRight: 'sneak',
  KeyE: 'grab',
};

let staged = false;

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}

function toGameCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * VIEW_W,
    y: ((clientY - rect.top) / rect.height) * VIEW_H,
  };
}

function begin() {
  audio.ensure();
  if (state.phase === 'title') {
    startGame(state);
    audio.play('click');
  }
}

function restart() {
  audio.ensure();
  startGame(state);
  audio.play('click');
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  const mapped = KEYMAP[e.code];
  if (mapped) input[mapped] = true;
  if (e.code === 'Enter' || e.code === 'Space') {
    if (state.phase === 'title') begin();
  }
  if (e.code === 'KeyR') {
    if (state.phase === 'win' || state.phase === 'lose') restart();
  }
  if (e.code === 'KeyP') {
    if (state.phase === 'playing') {
      state.phase = 'paused';
      audio.play('click');
    } else if (state.phase === 'paused') {
      state.phase = 'playing';
      audio.play('click');
    }
  }
  if (e.code === 'KeyM') {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }
});

window.addEventListener('keyup', (e) => {
  const mapped = KEYMAP[e.code];
  if (mapped) input[mapped] = false;
});

canvas.addEventListener('pointerdown', (e) => {
  audio.ensure();
  if (state.phase === 'title') {
    begin();
    return;
  }
  if (state.phase !== 'playing') return;
  const p = toGameCoords(e.clientX, e.clientY);
  tossCoin(state, p.x, p.y, audio);
});

// Apply a staged screenshot scene (?shot=...), if one was requested.
const stagedShot = shotFromQuery(window.location.search);
if (stagedShot) {
  staged = applyShot(state, stagedShot.shot, stagedShot.seed);
}

// FPS meter: a rolling average over the last 60 frames.
const frameTimes = [];
let fps = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  frameTimes.push(dt);
  if (frameTimes.length > 60) frameTimes.shift();
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  fps = avg > 0 ? 1 / avg : 0;

  if (state.phase === 'playing') {
    update(state, input, dt, audio);
  } else if (state.phase === 'title' || state.phase === 'win' || state.phase === 'lose') {
    // Keep the title and end screens alive (blinking prompts, sparkles).
    state.time += dt;
    for (const s of state.sparkles) s.life -= dt;
    state.sparkles = state.sparkles.filter((s) => s.life > 0);
    const star = state.level.loot.find((l) => l.kind === 'star');
    if (star && !star.taken && Math.random() < dt * 6) {
      state.sparkles.push({
        x: star.x + (Math.random() - 0.5) * 34,
        y: star.y - 14 + (Math.random() - 0.5) * 24,
        life: 0.7, maxLife: 0.7, r: 1 + Math.random() * 2,
      });
    }
  }

  render(ctx, state);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', fitCanvas);
fitCanvas();
requestAnimationFrame(frame);

// Test hooks for headless playtests (not part of the game): the current state,
// the measured frame rate, and a way to drive input without a keyboard.
window.__meridian = {
  state,
  input,
  get fps() {
    return fps;
  },
  get staged() {
    return staged;
  },
  begin,
  restart,
  tossCoinAt(x, y) {
    return tossCoin(state, x, y, audio);
  },
  setMuted(m) {
    state.muted = !!m;
    audio.setMuted(state.muted);
  },
};
