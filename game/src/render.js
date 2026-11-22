// The Meridian Job — rendering: everything the player sees. The gallery is
// painted once into a static layer (marble floor, cases, paintings, ropes,
// lamps, plants), then each frame draws the living parts on top: vision
// cones, characters with soft shadows, loot with glints, particles, lamp
// light pools, the HUD and the title/win/lose screens. Static art is cached
// so the frame stays cheap and the game holds 60 fps.

import { VIEW_W, VIEW_H, HUD_H, FOOT_H, ROOM, PALETTE, CAMERA, GUARD } from './config.js';
import { clamp } from './vision.js';

const staticCache = new Map();

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starPath(ctx, x, y, rOuter, rInner, points = 4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// --- the static gallery layer ---------------------------------------------

function paintStatic(level) {
  const key = level.seed ?? 1;
  if (staticCache.has(key)) return staticCache.get(key);
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const ctx = c.getContext('2d');

  // Night backdrop.
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Marble floor: checker tiles with a faint vein in each tile.
  const T = 46;
  for (let ty = 0; ty * T < VIEW_H; ty++) {
    for (let tx = 0; tx * T < VIEW_W; tx++) {
      const dark = (tx + ty) % 2 === 0;
      ctx.fillStyle = dark ? PALETTE.floorA : PALETTE.floorB;
      ctx.fillRect(tx * T, ty * T, T, T);
      ctx.strokeStyle = 'rgba(120,140,200,0.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
    }
  }

  // A deep-red carpet runner down the centre aisle, Star to exit.
  ctx.fillStyle = '#5e1f2a';
  ctx.fillRect(440, ROOM.y0, 80, ROOM.y1 - ROOM.y0);
  ctx.fillStyle = '#7a2836';
  ctx.fillRect(446, ROOM.y0, 68, ROOM.y1 - ROOM.y0);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.strokeRect(446.5, ROOM.y0 + 4, 67, ROOM.y1 - ROOM.y0 - 8);
  // Carpet medallions.
  ctx.fillStyle = 'rgba(201,162,39,0.5)';
  for (const my of [150, 280, 410, 500]) {
    ctx.beginPath();
    ctx.arc(480, my, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wall border: dark wainscot with a gold trim line.
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(0, HUD_H, VIEW_W, ROOM.y0 - HUD_H);
  ctx.fillRect(0, ROOM.y1, VIEW_W, VIEW_H - FOOT_H - ROOM.y1);
  ctx.fillRect(0, HUD_H, ROOM.x0, VIEW_H - HUD_H - FOOT_H);
  ctx.fillRect(ROOM.x1, HUD_H, VIEW_W - ROOM.x1, VIEW_H - HUD_H - FOOT_H);
  ctx.strokeStyle = PALETTE.wallTrim;
  ctx.lineWidth = 2;
  ctx.strokeRect(ROOM.x0 - 1.5, ROOM.y0 - 1.5, ROOM.x1 - ROOM.x0 + 3, ROOM.y1 - ROOM.y0 + 3);

  // Wall pictures (decoration, not loot): gold frames with tiny paintings.
  const artHues = ['#7a5a3a', '#3a5a7a', '#5a7a3a', '#7a3a5a', '#4a6a8a'];
  for (const pic of level.pictures) {
    ctx.fillStyle = '#8a6d2f';
    ctx.fillRect(pic.x - 3, pic.y - 3, pic.w + 6, pic.h + 6);
    ctx.fillStyle = artHues[pic.hue % artHues.length];
    ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(pic.x, pic.y + pic.h);
    ctx.lineTo(pic.x + pic.w * 0.6, pic.y);
    ctx.lineTo(pic.x + pic.w, pic.y);
    ctx.lineTo(pic.x + pic.w, pic.y + pic.h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(20,16,8,0.5)';
    ctx.beginPath();
    ctx.arc(pic.x + pic.w * 0.3, pic.y + pic.h * 0.65, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Furniture.
  for (const b of level.blockers) {
    if (b.kind === 'case') drawCase(ctx, b);
    else if (b.kind === 'pedestal') drawPedestal(ctx, b);
    else if (b.kind === 'table') drawTable(ctx, b);
    else if (b.kind === 'bench') drawBench(ctx, b);
    else if (b.kind === 'plant') drawPlant(ctx, b);
  }

  // Velvet ropes around the Star pedestal.
  ctx.strokeStyle = '#8f1d22';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const ropePairs = [
    [level.ropes[0], level.ropes[2]],
    [level.ropes[1], level.ropes[3]],
    [level.ropes[0], level.ropes[1]],
    [level.ropes[2], level.ropes[3]],
  ];
  for (const [a, b] of ropePairs) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 12, b.x, b.y);
    ctx.stroke();
  }
  for (const p of level.ropes) {
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d5312';
    ctx.beginPath();
    ctx.arc(p.x, p.y + 1, 4, 0, Math.PI);
    ctx.fill();
  }

  // Lamp sconces on the walls, with a warm pool baked into the floor.
  for (const lamp of level.lamps) {
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 90);
    glow.addColorStop(0, 'rgba(255,196,110,0.20)');
    glow.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lamp.x - 90, lamp.y - 90, 180, 180);
    ctx.fillStyle = '#3a2a12';
    ctx.fillRect(lamp.x - 6, lamp.y - 4, 12, 10);
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y - 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The service door (exit): a green doorway, bottom-left.
  const e = level.exit;
  ctx.fillStyle = '#0f3d2a';
  ctx.fillRect(e.x - 4, e.y - 4, e.w + 8, e.h + 8);
  ctx.fillStyle = '#14532f';
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.fillStyle = '#1f7a44';
  ctx.fillRect(e.x + 6, e.y + 6, e.w - 12, 10);
  ctx.fillStyle = '#7dffb0';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', e.x + e.w / 2, e.y + e.h - 12);

  // The camera panel: an orange kiosk, bottom-right.
  const p = level.panel;
  ctx.fillStyle = '#3a2408';
  rr(ctx, p.x - 14, p.y - 18, 28, 36, 4);
  ctx.fill();
  ctx.fillStyle = '#f5a623';
  rr(ctx, p.x - 10, p.y - 14, 20, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#1a1206';
  ctx.fillRect(p.x - 6, p.y - 10, 12, 8);
  ctx.fillStyle = '#f5a623';
  ctx.font = 'bold 10px Georgia, serif';
  ctx.fillText('CAM', p.x, p.y + 14);

  // Night wash, baked into the static layer so the frame needs one blit:
  // a cool moonlight wash from the top and a vignette at the room's edges.
  const moon = ctx.createLinearGradient(0, HUD_H, 0, 320);
  moon.addColorStop(0, 'rgba(90,110,190,0.10)');
  moon.addColorStop(1, 'rgba(90,110,190,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, HUD_H, VIEW_W, 320);
  const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  v.addColorStop(0, 'rgba(5,8,20,0)');
  v.addColorStop(1, 'rgba(5,8,20,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  staticCache.set(key, c);
  return c;
}

function drawCase(ctx, b) {
  // Soft shadow, then a dark wood base with a glass top that glints.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, b.x + 3, b.y + 5, b.w, b.h, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.wood;
  rr(ctx, b.x, b.y, b.w, b.h, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(b.x + 4, b.y + b.h - 12, b.w - 8, 8);
  // Glass: pale blue with a diagonal shine and little treasures inside.
  ctx.fillStyle = '#a8c8e8';
  rr(ctx, b.x + 6, b.y + 6, b.w - 12, b.h - 20, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(b.x + 12, b.y + b.h - 16);
  ctx.lineTo(b.x + b.w * 0.45, b.y + 8);
  ctx.lineTo(b.x + b.w * 0.6, b.y + 8);
  ctx.lineTo(b.x + 26, b.y + b.h - 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.arc(b.x + b.w * 0.3, b.y + b.h * 0.55, 5, 0, Math.PI * 2);
  ctx.arc(b.x + b.w * 0.7, b.y + b.h * 0.55, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7fe7dc';
  ctx.beginPath();
  ctx.arc(b.x + b.w * 0.5, b.y + b.h * 0.5, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPedestal(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, b.y + b.h - 2, b.w / 2 + 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
  g.addColorStop(0, '#d9d2c2');
  g.addColorStop(0.5, '#f4efe2');
  g.addColorStop(1, '#b8b0a0');
  ctx.fillStyle = g;
  rr(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(b.x, b.y, b.w, 4);
  ctx.fillRect(b.x, b.y + b.h - 4, b.w, 4);
}

function drawTable(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, b.y + b.h - 2, b.w / 2 + 3, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3a22';
  rr(ctx, b.x, b.y, b.w, b.h, 6);
  ctx.fill();
  ctx.fillStyle = '#7a5230';
  rr(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 12, 4);
  ctx.fill();
}

function drawBench(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, b.x + 2, b.y + 3, b.w, b.h, 5);
  ctx.fill();
  ctx.fillStyle = '#6b4426';
  rr(ctx, b.x, b.y, b.w, b.h, 5);
  ctx.fill();
  ctx.fillStyle = '#8a5a30';
  rr(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 12, 3);
  ctx.fill();
  ctx.fillStyle = '#a87a48';
  ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 3);
}

function drawPlant(ctx, b) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(b.x + b.w / 2, b.y + b.h - 2, b.w / 2 + 3, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a85a2a';
  ctx.beginPath();
  ctx.moveTo(b.x + 4, b.y + b.h - 8);
  ctx.lineTo(b.x + b.w - 4, b.y + b.h - 8);
  ctx.lineTo(b.x + b.w - 10, b.y + b.h);
  ctx.lineTo(b.x + 10, b.y + b.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2f7a3a';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.42;
    const len = 20 + ((i * 37) % 9);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y + b.h - 10);
    ctx.quadraticCurveTo(
      b.x + b.w / 2 + Math.cos(a) * len * 0.5, b.y + b.h - 10 + Math.sin(a) * len * 0.6,
      b.x + b.w / 2 + Math.cos(a) * len, b.y + b.h - 10 + Math.sin(a) * len,
    );
    ctx.quadraticCurveTo(
      b.x + b.w / 2 + Math.cos(a + 0.3) * len * 0.5, b.y + b.h - 10 + Math.sin(a + 0.3) * len * 0.6,
      b.x + b.w / 2, b.y + b.h - 10,
    );
    ctx.fill();
  }
}

// --- dynamic drawing ------------------------------------------------------

function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.75, r * 1.05, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
}

function conePath(ctx, x, y, facing, range, half) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, facing - half, facing + half);
  ctx.closePath();
}

// Vision cones are flat translucent sectors with a brighter inner wedge:
// they read instantly, and they cost far less per frame than gradient fills
// or big rotated sprites under software rendering.
function drawCone(ctx, x, y, facing, range, half, outer, inner, edge) {
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, facing - half, facing + half);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range * 0.45, facing - half, facing + half);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, range, facing - half, facing + half);
  ctx.stroke();
}

function drawCones(ctx, state) {
  // Guard cones: warm red, brighter while chasing, amber while suspicious.
  for (const g of state.guards) {
    const chasing = g.state === 'chase';
    const suspicious = g.detection > 0.35;
    if (chasing) drawCone(ctx, g.x, g.y, g.facing, GUARD.viewRange, GUARD.viewHalf, 'rgba(229,72,77,0.20)', 'rgba(229,72,77,0.30)', 'rgba(255,120,120,0.5)');
    else if (suspicious) drawCone(ctx, g.x, g.y, g.facing, GUARD.viewRange, GUARD.viewHalf, 'rgba(245,166,35,0.15)', 'rgba(245,166,35,0.26)', 'rgba(255,190,100,0.4)');
    else drawCone(ctx, g.x, g.y, g.facing, GUARD.viewRange, GUARD.viewHalf, 'rgba(229,72,77,0.12)', 'rgba(229,72,77,0.20)', 'rgba(255,120,120,0.25)');
  }
  // Camera cones: amber, narrower; grey and still when hacked.
  for (const c of state.cameras) {
    const disabled = state.time < c.disabledUntil;
    if (disabled) {
      ctx.strokeStyle = 'rgba(160,160,160,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, CAMERA.range, c.facing - CAMERA.half, c.facing + CAMERA.half);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    drawCone(ctx, c.x, c.y, c.facing, CAMERA.range, CAMERA.half,
      c.seesPlayer ? 'rgba(245,166,35,0.22)' : 'rgba(245,166,35,0.13)',
      c.seesPlayer ? 'rgba(245,166,35,0.32)' : 'rgba(245,166,35,0.22)',
      'rgba(255,190,100,0.3)');
  }
}

function drawLoot(ctx, state) {
  for (const l of state.level.loot) {
    if (l.taken) continue;
    if (l.kind === 'star') {
      // Warm halo + the gem itself, pulsing gently.
      const pulse = 1 + Math.sin(state.time * 2.2) * 0.08;
      const halo = ctx.createRadialGradient(l.x, l.y - 12, 2, l.x, l.y - 12, 52);
      halo.addColorStop(0, 'rgba(255,217,77,0.55)');
      halo.addColorStop(1, 'rgba(255,217,77,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(l.x - 52, l.y - 64, 104, 104);
      ctx.fillStyle = '#8a6d2f';
      ctx.fillRect(l.x - 12, l.y - 4, 24, 8);
      ctx.fillStyle = '#ffd94d';
      starPath(ctx, l.x, l.y - 16, 17 * pulse, 7 * pulse, 4);
      ctx.fill();
      ctx.fillStyle = '#fff6c8';
      starPath(ctx, l.x, l.y - 16, 9 * pulse, 3.5 * pulse, 4);
      ctx.fill();
      ctx.fillStyle = '#d8b45a';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ STAR', l.x, l.y + 22);
    } else if (l.kind === 'painting') {
      const onWall = l.x < 200;
      const fx = onWall ? l.x : l.x;
      const fy = l.y;
      ctx.fillStyle = '#8a6d2f';
      ctx.fillRect(fx - 24, fy - 30, 48, 60);
      ctx.fillStyle = '#3a5a7a';
      ctx.fillRect(fx - 19, fy - 25, 38, 50);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(fx - 19, fy + 25);
      ctx.lineTo(fx + 4, fy - 25);
      ctx.lineTo(fx + 19, fy - 25);
      ctx.lineTo(fx + 19, fy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8b45a';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('$50k', fx, fy + 44);
    } else if (l.kind === 'gems') {
      const halo = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 40);
      halo.addColorStop(0, 'rgba(127,231,220,0.4)');
      halo.addColorStop(1, 'rgba(127,231,220,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(l.x - 40, l.y - 40, 80, 80);
      ctx.fillStyle = '#4a3220';
      ctx.fillRect(l.x - 16, l.y - 4, 32, 8);
      ctx.fillStyle = 'rgba(168,200,232,0.85)';
      ctx.beginPath();
      ctx.arc(l.x, l.y - 10, 13, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7fe7dc';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - 22);
      ctx.lineTo(l.x + 8, l.y - 12);
      ctx.lineTo(l.x, l.y - 4);
      ctx.lineTo(l.x - 8, l.y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8f6f2';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - 22);
      ctx.lineTo(l.x + 4, l.y - 12);
      ctx.lineTo(l.x, l.y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d8b45a';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('$75k', l.x, l.y + 22);
    } else if (l.kind === 'pouch') {
      const halo = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 34);
      halo.addColorStop(0, 'rgba(245,166,35,0.4)');
      halo.addColorStop(1, 'rgba(245,166,35,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(l.x - 34, l.y - 34, 68, 68);
      ctx.fillStyle = '#8a5a2a';
      ctx.beginPath();
      ctx.arc(l.x, l.y - 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a87a3a';
      ctx.beginPath();
      ctx.arc(l.x - 3, l.y - 5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4d47c';
      ctx.beginPath();
      ctx.arc(l.x + 6, l.y - 10, 3.5, 0, Math.PI * 2);
      ctx.arc(l.x - 7, l.y - 11, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8b45a';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('$25k', l.x, l.y + 22);
    }
    // Grab progress ring while Wren holds E on it.
    if (l.progress > 0 && l.progress < 1) {
      ctx.strokeStyle = 'rgba(244,212,124,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(l.x, l.y - 8, 24, -Math.PI / 2, -Math.PI / 2 + l.progress * Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawGuard(ctx, state, g) {
  shadow(ctx, g.x, g.y, 15);
  const chasing = g.state === 'chase';
  const body = ctx.createRadialGradient(g.x - 4, g.y - 5, 2, g.x, g.y, 17);
  if (chasing) {
    body.addColorStop(0, '#a83238');
    body.addColorStop(1, '#5e1418');
  } else {
    body.addColorStop(0, '#3d4a7a');
    body.addColorStop(1, '#1c2440');
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 15, 0, Math.PI * 2);
  ctx.fill();
  // Shoulders / uniform collar.
  ctx.fillStyle = chasing ? '#7a2026' : '#2a3458';
  ctx.beginPath();
  ctx.arc(g.x, g.y, 15, g.facing - 1.1, g.facing + 1.1);
  ctx.closePath();
  ctx.fill();
  // Head with a peaked cap.
  const hx = g.x + Math.cos(g.facing) * 4;
  const hy = g.y + Math.sin(g.facing) * 4;
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141a33';
  ctx.beginPath();
  ctx.arc(hx, hy, 7.5, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#141a33';
  ctx.beginPath();
  ctx.ellipse(hx + Math.cos(g.facing) * 7, hy + Math.sin(g.facing) * 7, 5, 2.5, g.facing, 0, Math.PI * 2);
  ctx.fill();
  // Belt and badge.
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 11, g.facing + 1.6, g.facing + Math.PI - 1.6);
  ctx.stroke();
  ctx.fillStyle = '#f4d47c';
  ctx.beginPath();
  ctx.arc(g.x + Math.cos(g.facing + 2.4) * 12, g.y + Math.sin(g.facing + 2.4) * 12, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Suspicion / alarm marker.
  if (chasing) {
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', g.x, g.y - 24);
  } else if (g.detection > 0.35) {
    ctx.fillStyle = '#f5a623';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', g.x, g.y - 24);
  }
  // A thin detection arc under a suspicious guard.
  if (g.detection > 0.05 && g.detection < 1) {
    ctx.strokeStyle = 'rgba(245,166,35,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 19, -Math.PI / 2, -Math.PI / 2 + g.detection * Math.PI * 2);
    ctx.stroke();
  }
}

function drawWren(ctx, state) {
  const p = state.player;
  const crouch = p.sneaking ? 0.82 : 1;
  shadow(ctx, p.x, p.y, 13 * crouch);
  // Cloak: dark teal, shaded; a lighter hood and a gold clasp.
  const cloak = ctx.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, 16);
  cloak.addColorStop(0, '#2a6f68');
  cloak.addColorStop(1, '#0f2a28');
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 13, 13 * crouch, 0, 0, Math.PI * 2);
  ctx.fill();
  // Scarf trailing behind the facing direction.
  ctx.strokeStyle = '#2ec4b6';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x - Math.cos(p.facing) * 8, p.y - Math.sin(p.facing) * 8);
  ctx.quadraticCurveTo(
    p.x - Math.cos(p.facing) * 20, p.y - Math.sin(p.facing) * 20 + 4,
    p.x - Math.cos(p.facing) * 26 + Math.sin(state.time * 6) * 2, p.y - Math.sin(p.facing) * 26,
  );
  ctx.stroke();
  // Hooded head, face in shadow, facing the movement direction.
  const hx = p.x + Math.cos(p.facing) * 4;
  const hy = p.y + Math.sin(p.facing) * 4;
  ctx.fillStyle = '#123936';
  ctx.beginPath();
  ctx.arc(hx, hy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(hx + Math.cos(p.facing) * 2, hy + Math.sin(p.facing) * 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // Gold clasp.
  ctx.fillStyle = '#f4d47c';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.facing) * 9, p.y + Math.sin(p.facing) * 9, 2, 0, Math.PI * 2);
  ctx.fill();
  if (p.sneaking) {
    ctx.fillStyle = 'rgba(242,234,216,0.9)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sneaking', p.x, p.y - 24);
  }
}

function drawCameras(ctx, state) {
  for (const c of state.cameras) {
    const disabled = state.time < c.disabledUntil;
    shadow(ctx, c.x, c.y, 8);
    ctx.fillStyle = disabled ? '#4a4a4a' : '#2a2a2a';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = disabled ? '#666' : '#f5a623';
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(c.facing) * 5, c.y + Math.sin(c.facing) * 5, 3, 0, Math.PI * 2);
    ctx.fill();
    if (disabled) {
      ctx.fillStyle = '#b8b8b8';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OFF', c.x, c.y - 14);
    }
  }
}

function drawThrownCoins(ctx, state) {
  for (const c of state.thrownCoins) {
    const t = clamp(c.t, 0, 1);
    const x = c.x + (c.tx - c.x) * t;
    const y = c.y + (c.ty - c.y) * t;
    const hop = Math.sin(t * Math.PI) * 34;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4d47c';
    ctx.beginPath();
    ctx.arc(x, y - hop, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(x, y - hop, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx, state) {
  // Ambient dust motes, drifting slowly through the lamplight.
  for (const m of state.level.motes) {
    const x = m.x + Math.sin(state.time * 0.12 * m.drift + m.phase) * 6;
    const y = m.y + Math.cos(state.time * 0.1 * m.drift + m.phase) * 4;
    ctx.fillStyle = 'rgba(220,225,245,0.20)';
    ctx.beginPath();
    ctx.arc(x, y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Star sparkles.
  for (const s of state.sparkles) {
    const a = clamp(s.life / s.maxLife, 0, 1);
    ctx.fillStyle = `rgba(255,246,200,${a})`;
    starPath(ctx, s.x, s.y, s.r * 3, s.r, 4);
    ctx.fill();
  }
  // Bursts and sneak dust.
  for (const pt of state.particles) {
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawLightPools(ctx, state) {
  // The night wash is baked into the static layer; only the alarm flash is
  // drawn live — a red pulse at the frame's edge while the alarm is up.
  const alarmGlow = state.flash > 0 ? state.flash : state.alarm >= 0.7 ? 0.35 + Math.sin(state.time * 6) * 0.15 : 0;
  if (alarmGlow > 0) {
    const r = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
    r.addColorStop(0, 'rgba(229,72,77,0)');
    r.addColorStop(1, `rgba(229,72,77,${clamp(alarmGlow, 0, 0.55)})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// --- HUD and screens ------------------------------------------------------

function fmtMoney(v) {
  return '$' + v.toLocaleString('en-US');
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawHud(ctx, state) {
  // Top bar.
  ctx.fillStyle = PALETTE.hud;
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H + 0.5);
  ctx.lineTo(VIEW_W, HUD_H + 0.5);
  ctx.stroke();
  // Loot, left.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3c0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('LOOT', 18, 19);
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText(fmtMoney(state.lootValue), 18, 40);
  // Alarm meter, centre.
  const mw = 260;
  const mx = VIEW_W / 2 - mw / 2;
  ctx.fillStyle = '#9aa3c0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ALARM', mx - 52, 29);
  ctx.fillStyle = '#1a2138';
  rr(ctx, mx, 16, mw, 15, 4);
  ctx.fill();
  const a = clamp(state.alarm, 0, 1);
  if (a > 0.01) {
    const g = ctx.createLinearGradient(mx, 0, mx + mw, 0);
    g.addColorStop(0, '#f5a623');
    g.addColorStop(0.6, '#e5484d');
    g.addColorStop(1, '#e5484d');
    ctx.fillStyle = g;
    rr(ctx, mx + 1.5, 17.5, (mw - 3) * a, 12, 3);
    ctx.fill();
  }
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.lineWidth = 1;
  rr(ctx, mx, 16, mw, 15, 4);
  ctx.stroke();
  if (state.alarm >= 1) {
    const blink = Math.sin(state.time * 8) > 0;
    if (blink) {
      ctx.fillStyle = '#ff5a5a';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('ALARM!', mx + mw + 10, 29);
    }
  }
  // Timer + coins, right.
  const lowTime = state.timer <= 30;
  ctx.fillStyle = lowTime && Math.sin(state.time * 6) > 0 ? '#ff5a5a' : '#f2ead8';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText(fmtTime(state.timer), VIEW_W - 74, 31);
  ctx.fillStyle = '#f4d47c';
  ctx.beginPath();
  ctx.arc(VIEW_W - 58, 23, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a6d2f';
  ctx.beginPath();
  ctx.arc(VIEW_W - 58, 23, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText('×' + state.coins, VIEW_W - 16, 29);

  // Bottom bar: objective and controls.
  ctx.fillStyle = PALETTE.hud;
  ctx.fillRect(0, VIEW_H - FOOT_H, VIEW_W, FOOT_H);
  ctx.strokeStyle = PALETTE.hudLine;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H - FOOT_H + 0.5);
  ctx.lineTo(VIEW_W, VIEW_H - FOOT_H + 0.5);
  ctx.stroke();
  const hasStar = state.level.loot.find((l) => l.kind === 'star')?.taken;
  ctx.fillStyle = '#c8cede';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    hasStar
      ? 'The Star is yours — reach the service door to vanish.'
      : 'Steal the Star of Meridian, then reach the service door.',
    14, VIEW_H - 10,
  );
  ctx.fillStyle = '#7c86a8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD move · Shift sneak · E grab · Click toss coin · P pause', VIEW_W - 14, VIEW_H - 10);

  // Hack progress above the panel.
  if (state.hackProgress > 0) {
    const p = state.level.panel;
    ctx.fillStyle = '#1a2138';
    ctx.fillRect(p.x - 22, p.y - 34, 44, 7);
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(p.x - 21, p.y - 33, 42 * state.hackProgress, 5);
    ctx.fillStyle = '#f2ead8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HACKING…', p.x, p.y - 38);
  }
  // Cameras-down countdown.
  if (state.time < state.camerasDisabledUntil) {
    const left = Math.ceil(state.camerasDisabledUntil - state.time);
    ctx.fillStyle = '#7fe7dc';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`CAMERAS DARK · ${left}s`, state.level.panel.x, state.level.panel.y + 34);
  }

  // Toast, centre-bottom.
  if (state.toast) {
    const a = clamp(state.toastTimer, 0, 1);
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.fillStyle = 'rgba(13,18,38,0.9)';
    const tw = ctx.measureText(state.toast).width + 28;
    rr(ctx, VIEW_W / 2 - tw / 2, VIEW_H - FOOT_H - 34, tw, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#f2ead8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.toast, VIEW_W / 2, VIEW_H - FOOT_H - 17);
    ctx.globalAlpha = 1;
  }
}

function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(6,9,22,${alpha})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTitle(ctx, state) {
  dim(ctx, 0.72);
  // Gold frame.
  ctx.strokeStyle = 'rgba(216,180,90,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(28.5, 28.5, VIEW_W - 57, VIEW_H - 57);
  ctx.strokeStyle = 'rgba(216,180,90,0.35)';
  ctx.strokeRect(36.5, 36.5, VIEW_W - 73, VIEW_H - 73);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText('THE MERIDIAN JOB', VIEW_W / 2, 158);
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'italic 21px Georgia, serif';
  ctx.fillText('One thief. One gallery. One impossible gem.', VIEW_W / 2, 196);
  ctx.fillStyle = '#c8cede';
  ctx.font = '15px Georgia, serif';
  ctx.fillText('Wren has one night to lift the Star of Meridian from the Marlow Gallery.', VIEW_W / 2, 240);
  ctx.fillText('Dodge the patrols. Read the cones. Grab the loot. Vanish before dawn.', VIEW_W / 2, 264);
  // Controls, two columns.
  ctx.fillStyle = '#f2ead8';
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const cx = VIEW_W / 2 - 250;
  ctx.fillText('WASD / arrows — move', cx, 316);
  ctx.fillText('Shift — sneak', cx, 342);
  ctx.fillText('E (hold) — grab / hack panel', cx, 368);
  ctx.fillText('Click — toss a coin to distract a guard (3 coins)', cx + 260, 316);
  ctx.fillText('P — pause      M — mute', cx + 260, 342);
  ctx.fillText('Goal — steal the Star, reach the green EXIT', cx + 260, 368);
  // The loot list, small, so the player knows what is at stake.
  ctx.fillStyle = '#9aa3c0';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★ Star $500,000 · Paintings $50,000 · Gem cases $75,000 · Coin pouch $25,000', VIEW_W / 2, 420);
  const blink = Math.sin(state.time * 3) > -0.2;
  if (blink) {
    ctx.fillStyle = '#f2ead8';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('— PRESS ENTER OR CLICK TO BEGIN —', VIEW_W / 2, 478);
  }
  ctx.fillStyle = '#7c86a8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('An original game by Iwan Hud · made for make.fun', VIEW_W / 2, 540);
}

function drawPause(ctx, state) {
  dim(ctx, 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 42px Georgia, serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 280);
  ctx.fillStyle = '#c8cede';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Press P to keep sneaking.', VIEW_W / 2, 318);
}

function drawWin(ctx, state) {
  dim(ctx, 0.78);
  const s = state.winStats;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5ee88a';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText(s.grade, VIEW_W / 2, 168);
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(s.gradeLine, VIEW_W / 2, 206);
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(`TAKE   ${fmtMoney(s.take)}`, VIEW_W / 2, 272);
  ctx.fillStyle = '#c8cede';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(
    `Time to spare: ${fmtTime(s.timeLeft)}    Alarms raised: ${s.alarms}    Loot: ${state.lootTakenCount} of ${state.level.loot.length}`,
    VIEW_W / 2, 312,
  );
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 16px system-ui, sans-serif';
  const blink = Math.sin(state.time * 3) > -0.2;
  if (blink) ctx.fillText('— PRESS R TO PLAY AGAIN —', VIEW_W / 2, 392);
}

function drawLose(ctx, state) {
  dim(ctx, 0.78);
  ctx.textAlign = 'center';
  const caught = state.loseReason === 'caught';
  ctx.fillStyle = caught ? '#ff5a5a' : '#f5a623';
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText(caught ? 'CAUGHT!' : 'DAWN BREAKS', VIEW_W / 2, 168);
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText(
    caught
      ? 'A guard got a hand on Wren. The Meridian Job is over.'
      : 'The sun comes up over the Marlow Gallery. The night is spent.',
    VIEW_W / 2, 206,
  );
  ctx.fillStyle = PALETTE.goldBright;
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(`LOOT KEPT   ${fmtMoney(state.lootValue)}`, VIEW_W / 2, 272);
  ctx.fillStyle = '#c8cede';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Tip: watch the cones, sneak past the patrols, and toss a coin to clear a route.', VIEW_W / 2, 312);
  ctx.fillStyle = '#f2ead8';
  ctx.font = 'bold 16px system-ui, sans-serif';
  const blink = Math.sin(state.time * 3) > -0.2;
  if (blink) ctx.fillText('— PRESS R TO TRY AGAIN —', VIEW_W / 2, 392);
}

// --- the frame ------------------------------------------------------------

export function render(ctx, state) {
  const level = state.level;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.drawImage(paintStatic(level), 0, 0);
  drawCones(ctx, state);
  drawLoot(ctx, state);
  drawCameras(ctx, state);
  // Guards behind Wren when she is below them, in front when above — a
  // simple painter's order by y keeps the depth readable.
  const actors = [...state.guards.map((g) => ({ y: g.y, draw: () => drawGuard(ctx, state, g) }))];
  actors.push({ y: state.player.y, draw: () => drawWren(ctx, state) });
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) a.draw();
  drawThrownCoins(ctx, state);
  drawParticles(ctx, state);
  drawLightPools(ctx, state);
  // The HUD belongs to live play; the title and end screens keep the frame
  // clean instead of letting the bars ghost through the dim.
  if (state.phase === 'playing' || state.phase === 'paused') drawHud(ctx, state);
  if (state.phase === 'title') drawTitle(ctx, state);
  else if (state.phase === 'paused') drawPause(ctx, state);
  else if (state.phase === 'win') drawWin(ctx, state);
  else if (state.phase === 'lose') drawLose(ctx, state);
}
