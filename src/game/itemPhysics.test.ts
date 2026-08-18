import { describe, expect, it } from 'vitest'
import type { PhysicsProfile, PlacedItem } from '../types/item'
import { stepItemPhysics } from './itemPhysics'

const BOUNDS = { width: 1200, height: 800 }
const BALL: PhysicsProfile = { mass: 0.5, friction: 0.55, bounciness: 0.55 }
const KIBBLE: PhysicsProfile = { mass: 1, friction: 0.95, bounciness: 0 }

function makeItem(overrides: Partial<PlacedItem> = {}): PlacedItem {
  return {
    id: 'test-item',
    itemTypeId: 'ball',
    position: { x: 400, y: 500 },
    height: 0,
    velocity: { x: 0, y: 0 },
    verticalVelocity: 0,
    claimedBy: null,
    held: false,
    ...overrides,
  }
}

// Runs the simulation in fixed steps until the item fully settles (or the
// frame budget runs out), mirroring how tick() drives it frame by frame.
function simulateUntilSettled(item: PlacedItem, profile: PhysicsProfile, stepMs = 16, maxFrames = 3000) {
  let current = item
  let frames = 0
  while (frames < maxFrames) {
    current = stepItemPhysics(current, profile, stepMs, BOUNDS)
    frames++
    const moving =
      current.velocity.x !== 0 ||
      current.velocity.y !== 0 ||
      current.height > 0 ||
      current.verticalVelocity !== 0
    if (!moving) break
  }
  return { item: current, frames, settled: frames < maxFrames }
}

describe('stepItemPhysics', () => {
  it('leaves a held item completely untouched', () => {
    const item = makeItem({ held: true, velocity: { x: 300, y: 0 }, height: 50, verticalVelocity: 200 })
    expect(stepItemPhysics(item, BALL, 16, BOUNDS)).toBe(item)
  })

  it('does not apply ground friction while airborne', () => {
    const item = makeItem({ height: 100, verticalVelocity: 300, velocity: { x: 400, y: 0 } })
    const stepped = stepItemPhysics(item, BALL, 16, BOUNDS)
    expect(stepped.height).toBeGreaterThan(0)
    expect(stepped.velocity.x).toBe(400)
  })

  it('scrubs ground speed on each floor bounce', () => {
    // Falling fast enough to bounce (above Z_STOP_THRESHOLD on impact).
    const item = makeItem({ height: 2, verticalVelocity: -400, velocity: { x: 400, y: 0 } })
    const stepped = stepItemPhysics(item, BALL, 16, BOUNDS)
    expect(stepped.height).toBe(0)
    expect(stepped.verticalVelocity).toBeGreaterThan(0) // bounced back up
    expect(stepped.velocity.x).toBeLessThan(400) // lost ground speed at the contact
    expect(stepped.velocity.x).toBeGreaterThan(0)
  })

  it('applies rolling friction while on the floor until it stops', () => {
    const rolling = makeItem({ velocity: { x: 300, y: 0 } })
    const { item, settled } = simulateUntilSettled(rolling, BALL)
    expect(settled).toBe(true)
    expect(item.velocity.x).toBe(0)
    // It rolled forward a real distance but did not slide anywhere near the
    // room's full width from a modest push.
    expect(item.position.x).toBeGreaterThan(450)
    expect(item.position.x).toBeLessThan(900)
  })

  it('a zero-bounciness item lands dead instead of bouncing', () => {
    const item = makeItem({ itemTypeId: 'kibble', height: 60, verticalVelocity: 0, velocity: { x: 0, y: 0 } })
    const { item: landed, settled } = simulateUntilSettled(item, KIBBLE)
    expect(settled).toBe(true)
    expect(landed.height).toBe(0)
    expect(landed.verticalVelocity).toBe(0)
  })

  it('a hard ball throw settles inside the room in a reasonable time', () => {
    // Mirrors endDragItem's split for a max-speed swipe (900 px/s, mass 0.5,
    // GROUND_RATIO 0.55, LIFT_RATIO 0.35 capped at 600).
    const thrown = makeItem({
      position: { x: 100, y: 500 },
      velocity: { x: 990, y: 0 },
      verticalVelocity: 600,
      height: 0,
    })
    const { item, frames, settled } = simulateUntilSettled(thrown, BALL)
    expect(settled).toBe(true)
    // Stays inside the room (wall bounces contain it)…
    expect(item.position.x).toBeGreaterThan(0)
    expect(item.position.x).toBeLessThan(BOUNDS.width)
    // …travels a genuine distance from the release point…
    expect(Math.abs(item.position.x - 100)).toBeGreaterThan(300)
    // …and comes to rest within ~8 seconds, not the old 20+.
    expect(frames * 16).toBeLessThan(8000)
  })

  it('reflects off a side wall with reduced speed', () => {
    const item = makeItem({ position: { x: 20, y: 500 }, velocity: { x: -800, y: 0 } })
    const stepped = stepItemPhysics(item, BALL, 16, BOUNDS)
    expect(stepped.velocity.x).toBeGreaterThan(0)
    expect(Math.abs(stepped.velocity.x)).toBeLessThan(800)
    expect(stepped.position.x).toBeGreaterThanOrEqual(16) // back inside MARGIN
  })
})
