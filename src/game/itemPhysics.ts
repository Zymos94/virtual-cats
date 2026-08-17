import type { PhysicsProfile, PlacedItem } from '../types/item'
import { WALL_BAND_FRACTION } from './roomLayout'

const GRAVITY = 1800 // px/s^2, constantly pulls height back toward the floor
const Z_STOP_THRESHOLD = 20 // px/s vertical speed — below this on landing, it's fully settled
const XY_STOP_THRESHOLD = 6 // px/s ground speed — below this, snap to a full stop
const MARGIN = 16 // keeps the item's icon fully inside the room's side/front edges
// Belt-and-suspenders cap alongside useGameLoop's deltaMs clamp — no throw
// in this room should ever need to arc higher than this.
const MAX_HEIGHT = 400

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
      x = floor.left
      vx = -vx * profile.bounciness
    } else if (x > floor.right) {
      x = floor.right
      vx = -vx * profile.bounciness
    }

    // The horizon (back wall boundary) only constrains the item once it's
    // actually resting on the floor — while airborne it can freely sail
    // into that space above/behind the horizon line, same as a ball
    // thrown up toward the back of a real room. Gravity always brings it
    // down eventually; once it lands, it's pulled back onto the floor
    // plane rather than resting "inside" the wall.
    if (height <= 0 && y < floor.top) {
      y = floor.top
      vy = 0
    } else if (y > floor.bottom) {
      y = floor.bottom
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
