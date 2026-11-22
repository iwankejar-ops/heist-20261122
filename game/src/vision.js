// The Meridian Job — vision and geometry: line of sight, vision cones and
// collision. Guards and cameras can only see Wren when she is inside their
// cone AND no furniture stands between them; walls and cases are real cover.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Smallest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Does segment (ax,ay)-(bx,by) cross rectangle r? Uses the slab test.
function segmentHitsRect(ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (ax < r.x || ax > r.x + r.w) return false;
  } else {
    let t1 = (r.x - ax) / dx;
    let t2 = (r.x + r.w - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (ay < r.y || ay > r.y + r.h) return false;
  } else {
    let t1 = (r.y - ay) / dy;
    let t2 = (r.y + r.h - ay) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// True when nothing blocks the view from (ax,ay) to (bx,by).
export function losClear(ax, ay, bx, by, blockers) {
  for (const r of blockers) {
    if (segmentHitsRect(ax, ay, bx, by, r)) return false;
  }
  return true;
}

// Is point (px,py) inside the cone from (ox,oy) facing `facing`, with the
// given range and half-angle? Distance and angle only — callers add LOS.
export function inCone(px, py, ox, oy, facing, range, half) {
  const d = dist(px, py, ox, oy);
  if (d > range) return false;
  if (d < 1) return true;
  const ang = Math.atan2(py - oy, px - ox);
  return Math.abs(angleDiff(ang, facing)) <= half;
}

// Full sight test for a guard or a camera: cone + line of sight.
export function canSee(px, py, ox, oy, facing, range, half, blockers) {
  if (!inCone(px, py, ox, oy, facing, range, half)) return false;
  return losClear(ox, oy, px, py, blockers);
}

// How visible Wren is to a guard right now: 0 when unseen, up to 1 at
// point-blank range. Sneaking shrinks the rate; distance shrinks it too.
export function visibility(px, py, guard, blockers, sneaking, cfg) {
  if (!canSee(px, py, guard.x, guard.y, guard.facing, cfg.viewRange, cfg.viewHalf, blockers)) return 0;
  const d = dist(px, py, guard.x, guard.y);
  const near = 1 - clamp(d / cfg.viewRange, 0, 1);
  let rate = cfg.detectFar + (cfg.detectBase - cfg.detectFar) * near;
  if (sneaking) rate *= cfg.sneakFactor;
  return rate;
}

// Push a circle (x,y,r) out of every rectangle it overlaps, and out of the
// room bounds. Returns the corrected position.
export function resolveCircle(x, y, r, blockers, room) {
  let nx = clamp(x, room.x0 + r, room.x1 - r);
  let ny = clamp(y, room.y0 + r, room.y1 - r);
  for (const b of blockers) {
    const cx = clamp(nx, b.x, b.x + b.w);
    const cy = clamp(ny, b.y, b.y + b.h);
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 === 0) {
      // Centre inside the rectangle: push out along the smallest penetration.
      const left = nx - b.x;
      const right = b.x + b.w - nx;
      const top = ny - b.y;
      const bottom = b.y + b.h - ny;
      const m = Math.min(left, right, top, bottom);
      if (m === left) nx = b.x - r;
      else if (m === right) nx = b.x + b.w + r;
      else if (m === top) ny = b.y - r;
      else ny = b.y + b.h + r;
    } else {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    }
  }
  nx = clamp(nx, room.x0 + r, room.x1 - r);
  ny = clamp(ny, room.y0 + r, room.y1 - r);
  return { x: nx, y: ny };
}

// Is point (x,y) inside rectangle r (with a small margin)?
export function insideRect(x, y, r, margin = 0) {
  return x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin;
}
