// The Meridian Job — staged screenshots: ?shot=start|play|alarm|win&seed=N
// puts the game into a fixed, deterministic scene so the screenshots are
// reproducible renders of the real game (same code, same layout, no edits).
// The staging only moves the actors and sets the meters — it never draws
// anything the game itself could not reach by playing.

import { createGame } from './game.js';
import { clamp } from './vision.js';

function setGuard(g, x, y, facing, detection = 0, gstate = 'patrol') {
  g.x = x;
  g.y = y;
  g.facing = facing;
  g.detection = detection;
  g.state = gstate;
  g.target = null;
  g.lastSeen = null;
}

export function applyShot(state, shot, seed) {
  // Rebuild from the seed so the room is exactly the shipped one.
  const fresh = createGame(seed);
  Object.assign(state, fresh);

  if (shot === 'start') {
    state.phase = 'title';
    state.time = 12;
    setGuard(state.guards[0], 480, 246, 0);
    setGuard(state.guards[1], 380, 380, Math.PI / 2);
    setGuard(state.guards[2], 760, 300, Math.PI);
    state.player.x = 52;
    state.player.y = 532;
    state.player.facing = -Math.PI / 2;
    state.cameras[0].facing = Math.PI / 3;
    state.cameras[1].facing = (2 * Math.PI) / 3;
    return true;
  }

  if (shot === 'play') {
    state.phase = 'playing';
    state.time = 10;
    state.timer = 230; // 3:50 on the clock
    state.alarm = 0.28;
    // One gem case already pocketed: $75,000 on the board.
    const gems = state.level.loot.find((l) => l.id === 'gems-l');
    gems.taken = true;
    state.lootValue = 75000;
    state.lootTakenCount = 1;
    // Wren sneaking through the middle gallery, between the patrols.
    state.player.x = 330;
    state.player.y = 300;
    state.player.facing = Math.PI / 2;
    state.player.sneaking = true;
    state.player.moving = true;
    setGuard(state.guards[0], 700, 246, Math.PI, 0.12);
    setGuard(state.guards[1], 430, 380, -Math.PI / 2, 0.42);
    setGuard(state.guards[2], 800, 470, -Math.PI / 2);
    state.cameras[0].facing = Math.PI / 2.4;
    state.cameras[1].facing = Math.PI / 1.8;
    state.toast = 'Pocketed $75k loot.';
    state.toastTimer = 2.4;
    return true;
  }

  if (shot === 'alarm') {
    state.phase = 'playing';
    state.time = 15;
    state.timer = 225; // 3:45
    state.alarm = 1;
    state.alarmActive = true;
    state.alarmsRaised = 1;
    state.flash = 0.85;
    // Wren caught reaching for the Star, just below its pedestal; the
    // guards converge on her.
    state.player.x = 480;
    state.player.y = 135;
    state.player.facing = -Math.PI / 2;
    setGuard(state.guards[0], 380, 246, -Math.PI / 2.4, 1, 'chase');
    setGuard(state.guards[1], 470, 300, -Math.PI / 2, 1, 'chase');
    setGuard(state.guards[2], 760, 246, Math.PI, 0.55, 'chase');
    for (const g of state.guards) g.lastSeen = { x: state.player.x, y: state.player.y };
    state.cameras[0].facing = Math.PI / 2;
    state.cameras[1].facing = Math.PI / 1.5;
    state.toast = 'ALARM! The guards are coming for you!';
    state.toastTimer = 2.4;
    return true;
  }

  if (shot === 'win') {
    state.phase = 'win';
    state.time = 33;
    state.timer = 207; // 3:27 to spare
    state.alarmsRaised = 2;
    state.lootValue = 600000;
    state.lootTakenCount = 3;
    state.level.loot.find((l) => l.id === 'star').taken = true;
    state.level.loot.find((l) => l.id === 'painting-l').taken = true;
    state.level.loot.find((l) => l.id === 'painting-r').taken = true;
    state.winStats = {
      take: 600000,
      timeLeft: 207,
      alarms: 2,
      grade: 'LOUD GETAWAY',
      gradeLine: 'Loud, but rich. The gallery will remember tonight.',
      allLoot: false,
    };
    state.player.x = 52;
    state.player.y = 532;
    setGuard(state.guards[0], 200, 246, Math.PI);
    setGuard(state.guards[1], 560, 380, Math.PI / 2);
    setGuard(state.guards[2], 700, 470, -Math.PI / 2);
    return true;
  }

  return false;
}

export const SHOT_NAMES = ['start', 'play', 'alarm', 'win'];

export function shotFromQuery(query) {
  const params = new URLSearchParams(query);
  const shot = params.get('shot');
  const seed = clamp(parseInt(params.get('seed') || '1', 10) || 1, 1, 99999);
  if (shot && SHOT_NAMES.includes(shot)) return { shot, seed };
  return null;
}
