import type { PhysicsProfile, PlacedItem } from '../types/item'
import { WALL_BAND_FRACTION } from './roomLayout'

const GRAVITY = 1800 // px/s^2, constantly pulls height back toward the floor
const Z_STOP_THRESHOLD = 20 // px/s vertical speed — below this on landing, it's fully settled
const XY_STOP_THRESHOLD = 6 // px/s ground speed — below this, snap to a full stop
// Fraction of ground speed kept on each floor impact. Every bounce scrubs
// some horizontal momentum (a real ball skids slightly at the contact
// point), which is what lets airborne travel stay friction-free without a
// bouncing throw crossing the whole room: 3–4 bounces compound to roughly
// halving the ground speed before rolling friction takes over.
const BOUNCE_GROUND_KEEP = 0.72
// Constant rolling deceleration (px/s²) applied on top of the exponential
// friction while grounded. Exponential decay alone never really finishes —
// it leaves a long, slow creep at the tail (tens of px/s for seconds),
// which reads as gliding on ice. A small constant term barely registers at
// throw speeds but closes out the last bit of roll decisively, the way
// rolling resistance actually behaves.
const ROLL_DECEL = 60
const MARGIN = 16 // keeps the item's icon fully inside the room's side/front edges
// Belt-and-suspenders cap alongside useGameLoop's deltaMs clamp — no throw
// in this room should ever need to arc higher than this.
const MAX_HEIGHT = 400
// How far behind the wall's base line an airborne item may currently sit,
// per pixel of its current height — at MAX_HEIGHT that's a peek of ~140px.
const WALL_PEEK_RATIO = 0.35

// Reflects a position that overshot a boundary back on the correct side,
// scaled by bounciness — a real bounce, not a teleport. At bounciness 0
// this reduces to exactly clamping to the edge (the overshoot term
// vanishes); at higher bounciness a fast-moving item that overshot
// further rebounds further, instead of always snapping to the same point
// regardless of how hard it hit. A plain clamp-in-place reads as a sudden
// snap/jump right at the edge for anything moving fast enough to overshoot
// by a visible amount — most noticeably a ball thrown hard toward a wall.
function reflect(edge: number, overshootPastEdge: number, bounciness: number): number {
  return edge + overshootPastEdge * bounciness
}

// Same floor-plane bound pets wander within — an item resting or rolling
// on the ground never sits "inside" the wall band behind it.
function floorBounds(bounds: { width: number; height: number }) {
  return {
    left: MARGIN,
    right: bounds.width - MARGIN,
    top: bounds.height * WALL_BAND_FRACTION + MARGIN,
    bottom: bounds.height - MARGIN,
  }
}

export function clampToRoom(
  position: { x: number; y: number },
  bounds: { width: number; height: number },
): { x: number; y: number } {
  const floor = floorBounds(bounds)
  return {
    x: Math.min(Math.max(position.x, floor.left), floor.right),
    y: Math.min(Math.max(position.y, floor.top), floor.bottom),
  }
}

// TODO(maps): friction/bounciness currently come only from the item's own
// profile — there's no notion of what the floor itself is made of yet
// (tile vs. carpet vs. grass). Once rooms/maps exist, the floor should
// contribute its own friction (and maybe bounciness) that combines with
// the item's, so the same ball rolls differently on carpet vs. hardwood.

// Bounce physics is Euler-integrated (see stepItemPhysicsOnce below), which
// only approximates continuous motion well for small dt. useGameLoop's
// MAX_DELTA_MS caps a single *real* frame at 100ms for exactly this reason
// — but petStore.tick multiplies that by `timeScale` afterward, so a 4x/16x
// tick can still hand this a much larger effective deltaMs. At a large
// enough dt, gravity accelerates a falling item so much within one single
// step that its bounce-off velocity (scaled by bounciness) can land on an
// exact repeating value tick after tick — an artifact of the coarse
// discretization, not real physics, which would naturally lose energy each
// bounce and settle. Caught via deterministic testing: a mouse item at 16x
// speed got stuck bouncing at a constant ~77px/s forever, so it never
// registered as "settled" (verticalVelocity === 0) and never converted into
// a Mouse creature — the bug the "mouse only spawns at 1x" report was.
// Fixed by substepping internally at a small, fixed size regardless of the
// caller's deltaMs, so behavior — and stability — stays the same at every
// `timeScale`.
const PHYSICS_SUBSTEP_MS = 20

// Advances one physics frame for a placed item, using its material profile:
//
// - Height/gravity axis: a thrown item arcs upward then falls, same as a
//   real toss, and settles on the floor after zero or more bounces
//   (bounciness=0 means it just lands and stops — no bounce at all).
// - Ground (x,y) axis: always the item's floor position, kept within the
//   room's floor plane (below the wall band) via bounces off the side/
//   front/back edges. Friction only slows it down once it's actually
//   resting on the floor — while airborne it keeps its throw momentum,
//   like a real projectile.
export function stepItemPhysics(
  item: PlacedItem,
  profile: PhysicsProfile,
  deltaMs: number,
  bounds: { width: number; height: number },
): PlacedItem {
  if (item.held || deltaMs <= 0) return item

  const steps = Math.ceil(deltaMs / PHYSICS_SUBSTEP_MS)
  const subDeltaMs = deltaMs / steps
  let result = item
  for (let i = 0; i < steps; i++) {
    result = stepItemPhysicsOnce(result, profile, subDeltaMs, bounds)
  }
  return result
}

function stepItemPhysicsOnce(
  item: PlacedItem,
  profile: PhysicsProfile,
  deltaMs: number,
  bounds: { width: number; height: number },
): PlacedItem {
  const dt = deltaMs / 1000

  let height = item.height
  let vz = item.verticalVelocity
  let hitFloor = false
  if (height > 0 || vz !== 0) {
    vz -= GRAVITY * dt
    height += vz * dt
    if (height <= 0) {
      height = 0
      hitFloor = true
      const bounced = -vz * profile.bounciness
      // Checked both ways: a gentle-enough impact never bounces at all
      // (original intent), and separately, a resulting hop too small to
      // read as a bounce anyway is just as good as fully stopped. Without
      // the second check, a low-bounciness item's impact speed can settle
      // into an exact repeating value from one bounce to the next (gravity
      // reaccelerating it to the same speed each short hop) — since that
      // recurrence has no built-in energy loss over time the way a real
      // bounce does, verticalVelocity could stay stuck just above 0
      // forever rather than ever reaching exactly 0.
      vz = Math.abs(vz) < Z_STOP_THRESHOLD || Math.abs(bounced) < Z_STOP_THRESHOLD ? 0 : bounced
    } else if (height > MAX_HEIGHT) {
      height = MAX_HEIGHT
      vz = Math.min(vz, 0)
    }
  }

  let x = item.position.x
  let y = item.position.y
  let vx = item.velocity.x
  let vy = item.velocity.y

  if (vx !== 0 || vy !== 0) {
    x += vx * dt
    y += vy * dt

    const floor = floorBounds(bounds)
    if (x < floor.left) {
      x = reflect(floor.left, floor.left - x, profile.bounciness)
      vx = -vx * profile.bounciness
    } else if (x > floor.right) {
      x = reflect(floor.right, floor.right - x, profile.bounciness)
      vx = -vx * profile.bounciness
    }

    // The horizon (back wall boundary) relaxes for an airborne item — it
    // can sail up into that space, same as a ball thrown toward the back
    // of a real room — but only as far behind it as its current height
    // allows, an allowance that shrinks back to 0 as it descends. Ground
    // Y-velocity itself isn't touched by gravity or by this, so without
    // that shrinking allowance a hard throw could carry it arbitrarily far
    // into wall-space for the whole time it's in the air, however long
    // that is, leaving one huge, jarring correction to make all at once
    // right at the moment it finally lands. Easing the allowance shut
    // continuously through the descent instead means it's always within a
    // small, current-frame-sized correction of the floor plane, and lands
    // already on it with nothing left to snap.
    const wallPeek = Math.max(0, height * WALL_PEEK_RATIO)
    const effectiveTop = Math.max(0, floor.top - wallPeek)
    if (y < effectiveTop) {
      y = effectiveTop
      if (height <= 0) vy = -vy * profile.bounciness
    } else if (y > floor.bottom) {
      y = reflect(floor.bottom, floor.bottom - y, profile.bounciness)
      vy = -vy * profile.bounciness
    }

    // Ground friction applies only while actually touching the floor — an
    // airborne item keeps its full throw momentum, like a real projectile.
    // The earlier "gate friction behind fully-at-rest" bug (a bouncing
    // throw never slowing, sliding the full room width) is instead solved
    // where the energy is really lost: each floor impact scrubs a chunk of
    // ground speed (BOUNCE_GROUND_KEEP), and continuous rolling friction
    // takes over once the item is rolling on the floor.
    if (hitFloor) {
      vx *= BOUNCE_GROUND_KEEP
      vy *= BOUNCE_GROUND_KEEP
    }
    if (height <= 0) {
      const decay = Math.pow(1 - profile.friction, dt)
      vx *= decay
      vy *= decay
      const speed = Math.hypot(vx, vy)
      if (speed > 0) {
        const slowed = Math.max(0, speed - ROLL_DECEL * dt)
        vx *= slowed / speed
        vy *= slowed / speed
      }
    }
    if (Math.hypot(vx, vy) < XY_STOP_THRESHOLD) {
      vx = 0
      vy = 0
    }
  }

  return { ...item, position: { x, y }, velocity: { x: vx, y: vy }, height, verticalVelocity: vz }
}
