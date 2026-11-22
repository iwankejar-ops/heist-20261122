// The Meridian Job — the Marlow Gallery: one hand-built room.
// Everything the game needs to know about the space: what blocks movement and
// sight, where the loot sits, where the guards walk, where the cameras watch,
// and where the decoration (benches, plants, lamps, ropes) goes. The layout is
// fixed — the same room every run — so a player can learn it and plan routes.

import { LOOT_DEFS, EXIT_ZONE, PANEL, SPAWN, ROOM } from './config.js';

// A small deterministic RNG (mulberry32) for decoration jitter, so the room
// looks identical on every load while still feeling hand-placed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLevel(seed = 1) {
  const rand = mulberry32(seed);

  // Furniture that blocks movement and line of sight. Each entry carries a
  // kind so the renderer knows what to draw: display case, pedestal, bench,
  // plant (small, blocks only low sight — treated as a blocker for simplicity
  // only when it is a tall plant), rope post (visual only, not a blocker).
  const blockers = [
    // Top row of display cases, leaving wide aisles between them.
    { kind: 'case', x: 150, y: 152, w: 132, h: 62 },
    { kind: 'case', x: 414, y: 152, w: 132, h: 62 },
    { kind: 'case', x: 678, y: 152, w: 132, h: 62 },
    // Bottom row of display cases.
    { kind: 'case', x: 150, y: 442, w: 132, h: 62 },
    { kind: 'case', x: 678, y: 442, w: 132, h: 62 },
    // The Star's pedestal, centre-top, ringed by velvet rope.
    { kind: 'pedestal', x: 452, y: 84, w: 56, h: 40 },
    // The coin pouch's little table, centre of the room.
    { kind: 'table', x: 452, y: 312, w: 56, h: 36 },
    // Benches for the middle gallery: safe cover to crouch behind.
    { kind: 'bench', x: 128, y: 292, w: 84, h: 30 },
    { kind: 'bench', x: 748, y: 292, w: 84, h: 30 },
    // Tall plants in the corners.
    { kind: 'plant', x: 40, y: 470, w: 34, h: 34 },
    { kind: 'plant', x: 886, y: 78, w: 34, h: 34 },
  ];

  // Velvet-rope posts around the Star pedestal (visual only).
  const ropes = [
    { x: 420, y: 76 }, { x: 420, y: 140 },
    { x: 540, y: 76 }, { x: 540, y: 140 },
  ];

  // Wall lamps: warm pools of light along the top and side walls.
  const lamps = [
    { x: 200, y: 70 }, { x: 330, y: 70 }, { x: 630, y: 70 }, { x: 760, y: 70 },
    { x: 34, y: 250 }, { x: 34, y: 400 }, { x: 926, y: 250 }, { x: 926, y: 400 },
  ];

  // Framed pictures on the walls that are not loot — pure decoration.
  const pictures = [
    { x: 250, y: 68, w: 74, h: 52, hue: 0 },
    { x: 710, y: 68, w: 74, h: 52, hue: 1 },
    { x: 34, y: 150, w: 26, h: 62, hue: 2 },
    { x: 926, y: 150, w: 26, h: 62, hue: 3 },
    { x: 480, y: 560, w: 90, h: 20, hue: 4 },
  ];

  // Three guards, each with a patrol loop that crosses the loot routes.
  const guards = [
    {
      name: 'Marcus',
      x: 200, y: 246, facing: 0,
      waypoints: [
        { x: 200, y: 246 }, { x: 480, y: 246 }, { x: 760, y: 246 }, { x: 480, y: 246 },
      ],
      waypointIndex: 0,
    },
    {
      name: 'Dara',
      x: 330, y: 380, facing: Math.PI / 2,
      waypoints: [
        { x: 330, y: 380 }, { x: 630, y: 380 }, { x: 630, y: 250 }, { x: 330, y: 250 },
      ],
      waypointIndex: 0,
    },
    {
      name: 'Rafi',
      x: 800, y: 200, facing: Math.PI,
      waypoints: [
        { x: 800, y: 200 }, { x: 800, y: 470 }, { x: 620, y: 470 }, { x: 620, y: 200 },
      ],
      waypointIndex: 0,
    },
  ];

  // Two sweeping cameras in the top corners, watching the Star approach.
  const cameras = [
    { id: 'cam-a', x: 66, y: 76, base: Math.PI / 4, sweep: 0.85, phase: 0 },
    { id: 'cam-b', x: 894, y: 76, base: (3 * Math.PI) / 4, sweep: 0.85, phase: Math.PI },
  ];

  const loot = LOOT_DEFS.map((d) => ({ ...d, taken: false, progress: 0 }));

  // Dust motes: ambient particles seeded once so the room feels the same.
  const motes = [];
  for (let i = 0; i < 46; i++) {
    motes.push({
      x: ROOM.x0 + rand() * (ROOM.x1 - ROOM.x0),
      y: ROOM.y0 + rand() * (ROOM.y1 - ROOM.y0),
      r: 0.8 + rand() * 1.6,
      drift: 2 + rand() * 5,
      phase: rand() * Math.PI * 2,
    });
  }

  return {
    seed,
    blockers, ropes, lamps, pictures, guards, cameras, loot, motes,
    exit: { ...EXIT_ZONE },
    panel: { ...PANEL },
    spawn: { ...SPAWN },
    room: { ...ROOM },
  };
}
