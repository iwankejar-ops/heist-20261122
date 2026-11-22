// The Meridian Job — game state and rules: the state machine (title, playing,
// paused, win, lose), movement, guard AI (patrol / suspicious / investigate /
// chase), cameras, the alarm meter, coins, grabbing loot, hacking, the dawn
// countdown and the win/lose conditions. Rendering lives in render.js.

import {
  PLAYER, GUARD, CAMERA, ALARM, COIN, TIMER_START, COINS_START, GRADES,
} from './config.js';
import { buildLevel } from './level.js';
import { clamp, dist, angleDiff, visibility, canSee, resolveCircle, insideRect } from './vision.js';

export function createGame(seed = 1) {
  const level = buildLevel(seed);
  const state = {
    seed,
    level,
    phase: 'title',
    time: 0,
    timer: TIMER_START,
    alarm: 0,
    alarmActive: false,
    alarmsRaised: 0,
    coins: COINS_START,
    lootValue: 0,
    lootTakenCount: 0,
    player: {
      x: level.spawn.x, y: level.spawn.y, facing: -Math.PI / 2,
      moving: false, sneaking: false, stepTimer: 0,
    },
    guards: level.guards.map((g) => ({
      ...g,
      waypoints: g.waypoints.map((w) => ({ ...w })),
      state: 'patrol', // patrol | investigate | chase | look
      detection: 0,
      target: null,
      waitTimer: 0,
      huntTimer: 0,
      lastSeen: null,
      wasSuspicious: false,
    })),
    cameras: level.cameras.map((c) => ({
      ...c, facing: c.base, seesPlayer: false, disabledUntil: 0,
    })),
    thrownCoins: [],
    particles: [],
    sparkles: [],
    hackProgress: 0,
    camerasDisabledUntil: 0,
    loseReason: null,
    winStats: null,
    toast: null,
    toastTimer: 0,
    flash: 0,
    muted: false,
  };
  return state;
}

export function startGame(state) {
  const fresh = createGame(state.seed);
  Object.assign(state, fresh);
  state.phase = 'playing';
}

function showToast(state, text, seconds = 2.6) {
  state.toast = text;
  state.toastTimer = seconds;
}

function burst(state, x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 90;
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.6 + Math.random() * 0.5, maxLife: 1.1, color, r: 1.5 + Math.random() * 2.5,
    });
  }
}

function triggerAlarm(state, audio) {
  if (state.alarmActive) return;
  state.alarmActive = true;
  state.alarmsRaised += 1;
  state.alarm = 1;
  state.flash = 1;
  for (const g of state.guards) {
    g.state = 'chase';
    g.huntTimer = GUARD.huntSeconds;
    g.lastSeen = { x: state.player.x, y: state.player.y };
  }
  audio.play('alarm');
  showToast(state, 'ALARM! The guards are coming for you!');
}

function endChase(state) {
  state.alarmActive = false;
  for (const g of state.guards) {
    if (g.state === 'chase') {
      g.state = 'patrol';
      g.detection = 0.3;
      g.lastSeen = null;
    }
  }
  showToast(state, 'They lost you. Breathe. Move.');
}

function gradeFor(state) {
  const allLoot = state.lootTakenCount === state.level.loot.length;
  for (const g of GRADES) {
    if (state.alarmsRaised <= g.maxAlarms && (g.allLoot === false || allLoot)) {
      if (g.allLoot && !allLoot) continue;
      return g;
    }
  }
  return GRADES[GRADES.length - 1];
}

function winGame(state, audio) {
  const grade = gradeFor(state);
  state.winStats = {
    take: state.lootValue,
    timeLeft: Math.max(0, state.timer),
    alarms: state.alarmsRaised,
    grade: grade.title,
    gradeLine: grade.line,
    allLoot: state.lootTakenCount === state.level.loot.length,
  };
  state.phase = 'win';
  audio.play('win');
  burst(state, state.player.x, state.player.y, '#f4d47c', 26);
}

function loseGame(state, audio, reason) {
  state.loseReason = reason;
  state.phase = 'lose';
  audio.play(reason === 'caught' ? 'caught' : 'dawn');
}

// --- player ---------------------------------------------------------------

function updatePlayer(state, input, dt, audio) {
  const p = state.player;
  const level = state.level;
  let mx = 0;
  let my = 0;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  p.sneaking = !!input.sneak && p.moving;
  if (len > 0) {
    mx /= len;
    my /= len;
    const speed = p.sneaking ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    const nx = p.x + mx * speed * dt;
    const ny = p.y + my * speed * dt;
    const fixed = resolveCircle(nx, ny, PLAYER.radius, level.blockers, level.room);
    p.x = fixed.x;
    p.y = fixed.y;
    p.facing = Math.atan2(my, mx);
    // Footsteps: soft ticks, slower and quieter while sneaking.
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      audio.play('step');
      p.stepTimer = p.sneaking ? 0.52 : 0.34;
    }
    if (p.sneaking && Math.random() < dt * 14) {
      state.particles.push({
        x: p.x + (Math.random() - 0.5) * 16, y: p.y + 10 + Math.random() * 6,
        vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 8,
        life: 0.9, maxLife: 0.9, color: '#8a93b8', r: 1.4, mote: true,
      });
    }
  }
}

// --- guards ---------------------------------------------------------------

function guardStep(state, g, dt, audio) {
  const p = state.player;
  const blockers = state.level.blockers;
  const seen = visibility(p.x, p.y, g, blockers, p.sneaking, GUARD);

  if (seen > 0) {
    g.detection = clamp(g.detection + seen * dt, 0, 1);
    g.lastSeen = { x: p.x, y: p.y };
    if (g.detection > 0.35 && !g.wasSuspicious && g.state === 'patrol') {
      audio.play('suspicious');
    }
    g.wasSuspicious = g.detection > 0.35;
    if (g.detection >= 1) triggerAlarm(state, audio);
  } else {
    g.detection = clamp(g.detection - 0.22 * dt, 0, 1);
    g.wasSuspicious = false;
  }

  const targetSpeed =
    g.state === 'chase' ? GUARD.chaseSpeed :
    g.state === 'investigate' ? GUARD.investigateSpeed :
    GUARD.patrolSpeed;

  let dest = null;
  if (g.state === 'patrol') {
    dest = g.waypoints[g.waypointIndex];
    if (dist(g.x, g.y, dest.x, dest.y) < 6) {
      g.waypointIndex = (g.waypointIndex + 1) % g.waypoints.length;
      dest = g.waypoints[g.waypointIndex];
    }
  } else if (g.state === 'investigate' || g.state === 'chase') {
    dest = g.target || g.lastSeen;
    if (g.state === 'investigate' && dest && dist(g.x, g.y, dest.x, dest.y) < 10) {
      g.state = 'look';
      g.waitTimer = GUARD.lookAroundSeconds;
    }
  }

  if (g.state === 'look') {
    g.waitTimer -= dt;
    g.facing += dt * 1.4; // scans the room while looking around
    if (g.waitTimer <= 0) {
      g.state = 'patrol';
      g.target = null;
    }
    return;
  }

  if (dest) {
    const d = dist(g.x, g.y, dest.x, dest.y);
    if (d > 0.5) {
      const step = Math.min(d, targetSpeed * dt);
      const nx = g.x + ((dest.x - g.x) / d) * step;
      const ny = g.y + ((dest.y - g.y) / d) * step;
      const fixed = resolveCircle(nx, ny, GUARD.radius, blockers, state.level.room);
      g.x = fixed.x;
      g.y = fixed.y;
      g.facing = Math.atan2(dest.y - g.y, dest.x - g.x);
    }
  }

  if (g.state === 'chase') {
    // Chase the last place Wren was seen; give up after hunting a while unseen.
    if (seen > 0) {
      g.huntTimer = GUARD.huntSeconds;
      g.target = { x: p.x, y: p.y };
    } else {
      g.huntTimer -= dt;
      if (g.lastSeen) g.target = g.lastSeen;
      if (g.huntTimer <= 0) {
        g.state = 'patrol';
        g.detection = 0.3;
        g.target = null;
        g.lastSeen = null;
      }
    }
    if (dist(g.x, g.y, p.x, p.y) < GUARD.catchRange) {
      loseGame(state, audio, 'caught');
    }
  }
}

// --- coins ----------------------------------------------------------------

export function tossCoin(state, tx, ty, audio) {
  if (state.phase !== 'playing' || state.coins <= 0) return false;
  const p = state.player;
  const d = dist(p.x, p.y, tx, ty);
  const range = Math.min(d, COIN.range);
  const a = Math.atan2(ty - p.y, tx - p.x);
  const lx = p.x + Math.cos(a) * range;
  const ly = p.y + Math.sin(a) * range;
  state.coins -= 1;
  state.thrownCoins.push({ x: p.x, y: p.y, tx: lx, ty: ly, t: 0, landed: false });
  audio.play('coin');
  return true;
}

function updateCoins(state, dt, audio) {
  for (const c of state.thrownCoins) {
    if (c.landed) continue;
    c.t += dt / COIN.flightSeconds;
    if (c.t >= 1) {
      c.t = 1;
      c.landed = true;
      burst(state, c.tx, c.ty, '#f4d47c', 8);
      // The nearest guard that is not chasing goes to look.
      let best = null;
      let bestD = COIN.attractRange;
      for (const g of state.guards) {
        if (g.state === 'chase') continue;
        const d = dist(g.x, g.y, c.tx, c.ty);
        if (d < bestD) {
          best = g;
          bestD = d;
        }
      }
      if (best) {
        best.state = 'investigate';
        best.target = { x: c.tx, y: c.ty };
        best.detection = Math.max(0, best.detection - 0.4);
        showToast(state, `${best.name} heard something…`);
      }
    }
  }
  state.thrownCoins = state.thrownCoins.filter((c) => !c.landed || c.t < 3);
}

// --- loot, hack, exit -----------------------------------------------------

function nearestLoot(state) {
  const p = state.player;
  let best = null;
  let bestD = PLAYER.grabReach;
  for (const l of state.level.loot) {
    if (l.taken) continue;
    const d = dist(p.x, p.y, l.x, l.y);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

function updateGrab(state, input, dt, audio) {
  const p = state.player;
  const loot = nearestLoot(state);
  const nearPanel = dist(p.x, p.y, state.level.panel.x, state.level.panel.y) < PLAYER.hackReach;
  const camerasDown = state.time < state.camerasDisabledUntil;

  // Loot grabbing takes priority over hacking.
  if (input.grab && loot) {
    loot.progress += dt / loot.grabTime;
    if (loot.progress >= 1) {
      loot.taken = true;
      loot.progress = 0;
      state.lootValue += loot.value;
      state.lootTakenCount += 1;
      burst(state, loot.x, loot.y, loot.kind === 'star' ? '#ffd94d' : '#7fe7dc', 18);
      if (loot.kind === 'star') {
        audio.play('star');
        showToast(state, 'The Star of Meridian is yours. Now vanish!');
      } else {
        audio.play('grab');
        showToast(state, `Pocketed ${loot.label} loot.`);
      }
    }
    return;
  }
  for (const l of state.level.loot) {
    if (!l.taken) l.progress = Math.max(0, l.progress - dt * 2);
  }

  if (input.grab && nearPanel && !camerasDown) {
    state.hackProgress += dt / CAMERA.hackTime;
    if (Math.random() < dt * 8) audio.play('hackTick');
    if (state.hackProgress >= 1) {
      state.hackProgress = 0;
      state.camerasDisabledUntil = state.time + CAMERA.hackSeconds;
      for (const c of state.cameras) c.disabledUntil = state.camerasDisabledUntil;
      audio.play('hackDone');
      showToast(state, `Cameras dark for ${CAMERA.hackSeconds} seconds. Move!`);
    }
  } else {
    state.hackProgress = Math.max(0, state.hackProgress - dt * 2);
  }
}

// --- cameras --------------------------------------------------------------

function updateCameras(state, dt) {
  const p = state.player;
  const blockers = state.level.blockers;
  for (const c of state.cameras) {
    c.facing = c.base + Math.sin(state.time * CAMERA.sweepSpeed + c.phase) * c.sweep;
    const disabled = state.time < c.disabledUntil;
    c.seesPlayer = false;
    if (disabled) continue;
    if (canSee(p.x, p.y, c.x, c.y, c.facing, CAMERA.range, CAMERA.half, blockers)) {
      c.seesPlayer = true;
      state.alarm = clamp(state.alarm + CAMERA.alarmRate * dt, 0, 1);
      if (state.alarm >= 1) {
        // Cameras alone can trip the alarm: guards converge on Wren.
        state.alarmActive = true;
        state.alarmsRaised += 1;
        state.flash = 1;
        for (const g of state.guards) {
          g.state = 'chase';
          g.huntTimer = GUARD.huntSeconds;
          g.lastSeen = { x: p.x, y: p.y };
        }
        showToast(state, 'The camera spotted you! ALARM!');
      }
    }
  }
}

// --- main update ----------------------------------------------------------

export function update(state, input, dt, audio) {
  if (state.phase !== 'playing') return;
  dt = Math.min(dt, 0.05);
  state.time += dt;
  state.timer -= dt;
  if (state.timer <= 0) {
    state.timer = 0;
    loseGame(state, audio, 'dawn');
    return;
  }
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 0.7);
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) state.toast = null;
  }

  updatePlayer(state, input, dt, audio);
  for (const g of state.guards) {
    guardStep(state, g, dt, audio);
    if (state.phase !== 'playing') return; // caught mid-frame: stop the update
  }
  updateCameras(state, dt);
  if (state.phase !== 'playing') return;
  updateCoins(state, dt, audio);
  updateGrab(state, input, dt, audio);

  // The alarm cools down only while nobody sees Wren. While the alarm is
  // active it cools once every guard has given up the chase.
  const anyoneSees =
    state.guards.some((g) => g.detection > 0.05) ||
    state.cameras.some((c) => c.seesPlayer);
  const chasing = state.guards.some((g) => g.state === 'chase');
  if (state.alarmActive) {
    if (!chasing && !anyoneSees) {
      state.alarm = clamp(state.alarm - ALARM.decay * dt, 0, 1);
    }
    if (state.alarm < ALARM.calmBelow && !chasing) endChase(state);
  } else if (!anyoneSees) {
    state.alarm = clamp(state.alarm - ALARM.decay * dt, 0, 1);
  }
  // Guard vision also feeds the alarm meter, so the bar reads the danger.
  const maxDetection = Math.max(0, ...state.guards.map((g) => g.detection));
  if (maxDetection > 0.3 && !state.alarmActive) {
    state.alarm = Math.max(state.alarm, maxDetection * 0.85);
  }

  // Star sparkles: the gem glints while it waits on its pedestal.
  const star = state.level.loot.find((l) => l.kind === 'star');
  if (star && !star.taken && Math.random() < dt * 6) {
    state.sparkles.push({
      x: star.x + (Math.random() - 0.5) * 34,
      y: star.y - 14 + (Math.random() - 0.5) * 24,
      life: 0.7, maxLife: 0.7, r: 1 + Math.random() * 2,
    });
  }

  // Particles age and drift.
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.mote) pt.vy -= 2 * dt;
    else {
      pt.vx *= 1 - 2.4 * dt;
      pt.vy *= 1 - 2.4 * dt;
    }
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const s of state.sparkles) s.life -= dt;
  state.sparkles = state.sparkles.filter((s) => s.life > 0);

  // Win: the Star in hand, back at the service door.
  const hasStar = state.level.loot.find((l) => l.kind === 'star')?.taken;
  if (hasStar && insideRect(state.player.x, state.player.y, state.level.exit, 4)) {
    winGame(state, audio);
  }
}
