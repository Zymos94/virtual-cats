import type { PhysicsProfile, PlacedItem } from '../types/item'
import { WALL_BAND_FRACTION } from './roomLayout'

const GRAVITY = 1800 // px/s^2, constantly pulls height back toward the floor
const Z_STOP_THRESHOLD = 20 // px/s vertical speed — below this on landing, it's fully settled
const XY_STOP_THRESHOLD = 6 // px/s ground speed — below this, snap to a full stop
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
  if (item.held) return item

  const dt = deltaMs / 1000

  let height = item.height
  let vz = item.verticalVelocity
  if (height > 0 || vz !== 0) {
    vz -= GRAVITY * dt
    height += vz * dt
    if (height <= 0) {
      height = 0
      vz = Math.abs(vz) < Z_STOP_THRESHOLD ? 0 : -vz * profile.bounciness
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

    // Grounded (not mid-bounce, not airborne) — friction takes over.
    if (height === 0 && vz === 0) {
      const decay = Math.pow(1 - profile.friction, dt)
      vx *= decay
      vy *= decay
      if (Math.hypot(vx, vy) < XY_STOP_THRESHOLD) {
        vx = 0
        vy = 0
      }
    }
  }

  return { ...item, position: { x, y }, velocity: { x: vx, y: vy }, height, verticalVelocity: vz }
}
