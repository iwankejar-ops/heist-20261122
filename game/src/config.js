// The Meridian Job — configuration: every tunable number of the game lives here,
// so the balance (speeds, sight ranges, alarm rates, loot values) can be read
// and changed in one place. No other module hard-codes a gameplay number.

export const VIEW_W = 960;
export const VIEW_H = 600;
export const HUD_H = 46;
export const FOOT_H = 28;

// The gallery room itself (inside the wall border). Everything that moves or
// can be grabbed lives inside this rectangle.
export const ROOM = { x0: 26, y0: 64, x1: 934, y1: 566 };

export const TIMER_START = 240; // 4 minutes until dawn, in seconds
export const COINS_START = 3;

export const PLAYER = {
  radius: 13,
  walkSpeed: 172,
  sneakSpeed: 76,
  grabReach: 40,
  hackReach: 46,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 58,
  investigateSpeed: 88,
  chaseSpeed: 136,
  viewRange: 212,
  viewHalf: 0.54, // ~31 degrees each side of the facing
  // Detection fills 0..1 while the guard sees Wren; the rate depends on how
  // close Wren is and whether she is sneaking.
  detectBase: 0.85, // per second at point-blank, walking
  detectFar: 0.34, // per second at the edge of the cone, walking
  sneakFactor: 0.45,
  catchRange: 26,
  // A guard that loses sight keeps hunting the last seen spot for this long.
  huntSeconds: 3.5,
  lookAroundSeconds: 1.6,
};

export const CAMERA = {
  range: 252,
  half: 0.30,
  sweepSpeed: 0.55, // radians per second
  alarmRate: 0.62, // alarm (0..1) per second while a camera sees Wren
  hackSeconds: 25, // how long a hack keeps the cameras dark
  hackTime: 1.7, // seconds holding E at the panel to hack
};

export const ALARM = {
  decay: 0.10, // alarm per second while nobody sees Wren
  chaseAt: 1.0, // alarm level that triggers the chase
  calmBelow: 0.35, // alarm level where guards give up and resume patrol
};

export const COIN = {
  range: 280, // how far a thrown coin can fly
  flightSeconds: 0.55,
  attractRange: 340, // guards closer than this go to investigate
};

// Loot: id, label, value, position, seconds holding E to grab it.
export const LOOT_DEFS = [
  { id: 'star', kind: 'star', label: 'STAR', value: 500000, x: 480, y: 104, grabTime: 1.5 },
  { id: 'painting-l', kind: 'painting', label: '$50k', value: 50000, x: 62, y: 132, grabTime: 1.0 },
  { id: 'painting-r', kind: 'painting', label: '$50k', value: 50000, x: 898, y: 132, grabTime: 1.0 },
  { id: 'gems-l', kind: 'gems', label: '$75k', value: 75000, x: 330, y: 512, grabTime: 1.1 },
  { id: 'gems-r', kind: 'gems', label: '$75k', value: 75000, x: 630, y: 512, grabTime: 1.1 },
  { id: 'pouch', kind: 'pouch', label: '$25k', value: 25000, x: 480, y: 330, grabTime: 0.8 },
];

export const EXIT_ZONE = { x: 26, y: 498, w: 52, h: 68 };
export const PANEL = { x: 908, y: 468 };
export const SPAWN = { x: 52, y: 532 };

export const GRADES = [
  { maxAlarms: 0, allLoot: true, title: 'GHOST GETAWAY', line: 'Not a soul saw a thing. A perfect ghost.' },
  { maxAlarms: 0, allLoot: false, title: 'SILENT GETAWAY', line: 'In and out without a whisper.' },
  { maxAlarms: 1, allLoot: false, title: 'SLICK GETAWAY', line: 'One scare, one clean exit. Slick work.' },
  { maxAlarms: 99, allLoot: false, title: 'LOUD GETAWAY', line: 'Loud, but rich. The gallery will remember tonight.' },
];

export const PALETTE = {
  night: '#0b1026',
  floorA: '#1c2340',
  floorB: '#232b4d',
  floorLine: '#2e3866',
  wall: '#141a33',
  wallTrim: '#c9a227',
  wood: '#4a3220',
  woodDark: '#33220f',
  gold: '#d8b45a',
  goldBright: '#f4d47c',
  teal: '#2ec4b6',
  tealDark: '#178f85',
  red: '#e5484d',
  redDark: '#8f1d22',
  amber: '#f5a623',
  cream: '#f2ead8',
  ink: '#0d1120',
  hud: '#0d1226',
  hudLine: '#2a3358',
};
