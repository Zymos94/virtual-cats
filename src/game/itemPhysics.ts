import type { PlacedItem } from '../types/item'

const FRICTION_PER_SEC = 0.06 // fraction of velocity retained per second
const STOP_THRESHOLD = 8 // px/sec — below this, just stop
const RESTITUTION = 0.55 // velocity kept after bouncing off a wall
const MARGIN = 16 // keeps the item's icon fully inside the room

// Used while an item is actively being dragged, so it can't be released
// past the boundary and get an artificial "instant max-strength bounce" on
// the very next physics step — it should visually stop at the wall while
// you're still holding it, same as it would while rolling on its own.
export function clampToRoom(
  position: { x: number; y: number },
  bounds: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(position.x, MARGIN), bounds.width - MARGIN),
    y: Math.min(Math.max(position.y, MARGIN), bounds.height - MARGIN),
  }
}

// Advances a rolling item by one frame: moves it by velocity * time, decays
// velocity via friction, bounces off the room's edges, and snaps to a full
// stop once it's slow enough that continuing to simulate it would just be
// visually imperceptible sliding.
export function stepItemPhysics(
  item: PlacedItem,
  deltaMs: number,
  bounds: { width: number; height: number },
): PlacedItem {
  if (item.held) return item

  const speed = Math.hypot(item.velocity.x, item.velocity.y)
  if (speed < STOP_THRESHOLD) {
    return speed === 0 ? item : { ...item, velocity: { x: 0, y: 0 } }
  }

  const dt = deltaMs / 1000
  let x = item.position.x + item.velocity.x * dt
  let y = item.position.y + item.velocity.y * dt
  let vx = item.velocity.x
  let vy = item.velocity.y

  if (x < MARGIN) {
    x = MARGIN
    vx = -vx * RESTITUTION
  } else if (x > bounds.width - MARGIN) {
    x = bounds.width - MARGIN
    vx = -vx * RESTITUTION
  }

  if (y < MARGIN) {
    y = MARGIN
    vy = -vy * RESTITUTION
  } else if (y > bounds.height - MARGIN) {
    y = bounds.height - MARGIN
    vy = -vy * RESTITUTION
  }

  const decay = Math.pow(FRICTION_PER_SEC, dt)
  vx *= decay
  vy *= decay

  return { ...item, position: { x, y }, velocity: { x: vx, y: vy } }
}
