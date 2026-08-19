export interface Point {
  x: number
  y: number
}

// Number of backward+forward passes run per tick. Low on purpose: a full
// convergence (10+ iterations) pulls an under-constrained chain toward
// whatever the *seed* happens to bias it toward, and since the seed is
// last tick's own shape (see resolveTailChain below), a handful of
// iterations is enough to keep both ends honest every tick without erasing
// the bend the chain already had — that's what keeps the tail reading as a
// continuous, flowing curve rather than snapping straight at the target
// every frame.
const ITERATIONS = 4

// Moves `point` so it sits exactly `dist` away from `from`, preserving
// whatever direction it currently is from `from` (only the distance
// changes). This is the one operation FABRIK is built from — apply it
// walking tip-to-anchor (pin the tip, drag everything else in line) and
// then anchor-to-tip (pin the anchor, drag everything else back out) and a
// chain of fixed-length links ends up simultaneously close to both a fixed
// start and a fixed end, without ever needing to know *how* it got there.
function moveToward(point: Point, from: Point, dist: number): Point {
  const dx = point.x - from.x
  const dy = point.y - from.y
  const d = Math.hypot(dx, dy) || 0.0001
  return { x: from.x + (dx / d) * dist, y: from.y + (dy / d) * dist }
}

// Resolves a chain of `prevSegments.length` fixed-length links stretched
// between a true, always-correct `anchor` (the body attach point) and a
// desired `target` (where the free tip is currently reaching for) — a
// small, real-time FABRIK solve, seeded each tick from where the chain
// already was for visual continuity.
//
// This replaces the old `stepChain`, which only ever knew about the
// anchor: it built the chain forward, link by link, easing each new
// segment toward the previous one with nothing pinning the *far* end to
// anything meaningful. That let the whole chain's overall shape wander
// unboundedly over sustained motion — every individual link stayed the
// right length, but nothing stopped the accumulated bend from slowly
// winding into a permanent coil over hundreds of cycles (see the M23
// postmortem in DEVLOG.md; a heuristic straightening bias patched the one
// sway pattern that was actually tested, not the underlying gap).
//
// Pinning *both* ends every tick closes that gap structurally rather than
// by tuning a bias constant harder: each frame's backward pass walks from
// the true target back to the anchor, and the forward pass walks from the
// true anchor back out to the target, so any drift that crept in gets
// pulled back toward a configuration consistent with where the tail
// *actually* is, not just nudged a fixed fraction toward "less bent."
// A chain that's perfectly still (anchor and target both unmoving) is a
// true fixed point of this iteration — once it satisfies both ends, the
// backward and forward passes reproduce the exact same positions forever,
// so there's no channel for slow numerical drift the way the old ease-based
// version had.
export function resolveTailChain(
  prevSegments: Point[],
  anchor: Point,
  target: Point,
  linkLength: number,
): Point[] {
  const n = prevSegments.length
  const totalLength = linkLength * n
  const dx = target.x - anchor.x
  const dy = target.y - anchor.y
  const distToTarget = Math.hypot(dx, dy)

  // Target further away than the chain can reach: there's only one valid
  // shape (fully extended, pointed straight at it), and FABRIK's own
  // iteration doesn't need to run to find it.
  if (distToTarget >= totalLength) {
    const dir =
      distToTarget > 0.0001 ? { x: dx / distToTarget, y: dy / distToTarget } : { x: 0, y: 1 }
    return Array.from({ length: n }, (_, i) => ({
      x: anchor.x + dir.x * linkLength * (i + 1),
      y: anchor.y + dir.y * linkLength * (i + 1),
    }))
  }

  // joints[0] is the anchor itself; joints[1..n] are the n rendered
  // segments (joints[n] is the tip). Seeding from last tick's actual
  // positions is what gives the chain its lag/momentum feel — a fresh
  // solve from a straight guess every tick would have none.
  const joints: Point[] = [anchor, ...prevSegments]

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Backward: snap the tip onto the target, then walk back toward the
    // anchor, each joint staying linkLength from the one now in front of it.
    joints[n] = target
    for (let i = n - 1; i >= 1; i--) {
      joints[i] = moveToward(joints[i], joints[i + 1], linkLength)
    }
    // Forward: snap the base back onto the true anchor (the backward pass
    // above will generally have dragged it away), then walk back out.
    joints[0] = anchor
    for (let i = 1; i <= n; i++) {
      joints[i] = moveToward(joints[i], joints[i - 1], linkLength)
    }
  }

  return joints.slice(1)
}

// Seeds a brand-new tail (a fresh game, a bred kitten, a mouse's first
// pounce target creating the very first tick a pet exists) with a gentle
// existing curve rather than a straight line. A perfectly straight seed
// collinear with the anchor is a degenerate fixed point of the FABRIK
// solve above (same reasoning as the old stepChain: "move toward a fixed
// neighbor, preserving direction" applied to a straight line reproduces
// that straight line forever) — the `sin` offset breaks collinearity so
// normal chain motion can take over from the very first tick, the same as
// any tail that's already settled into a natural resting curl.
export function initialSegments(anchor: Point, segmentCount: number, linkLength: number): Point[] {
  return Array.from({ length: segmentCount }, (_, i) => ({
    x: anchor.x + Math.sin((i + 1) * 0.6) * linkLength * 0.4,
    y: anchor.y + (i + 1) * linkLength,
  }))
}

// Exported for tailMood.ts / petStore.ts to size a target's reach as a
// fraction of the chain's full stretched-out length, and for tests.
export function chainLength(segmentCount: number, linkLength: number): number {
  return segmentCount * linkLength
}
