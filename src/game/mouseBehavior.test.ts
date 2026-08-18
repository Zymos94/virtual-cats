import { describe, expect, it } from 'vitest'
import type { Mouse } from '../types/mouse'
import {
  MOUSE_CALM_MS,
  MOUSE_DETECT_RADIUS,
  MOUSE_STALK_DETECT_RADIUS,
  updateMouseBehavior,
} from './mouseBehavior'

const BOUNDS = { width: 1200, height: 800 }
const TOP_MARGIN = 160

function makeMouse(overrides: Partial<Mouse> = {}): Mouse {
  return {
    id: 'test-mouse',
    position: { x: 400, y: 400 },
    destination: null,
    state: 'sneaking',
    facing: 'right',
    actionStartedAt: 0,
    lastThreatenedAt: 0,
    claimedBy: null,
    heldBy: null,
    currentSpeed: 0,
    stridePhase: 0,
    jump: null,
    ...overrides,
  }
}

describe('updateMouseBehavior', () => {
  it('never acts on its own while held', () => {
    const mouse = makeMouse({ state: 'held' })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 400, y: 400 },
      holePosition: null,
    })
    expect(next).toBe(mouse)
  })

  it('waits out a chuck hop before deciding anything', () => {
    const mouse = makeMouse({
      jump: { from: { x: 0, y: 0 }, to: { x: 50, y: 0 }, progressMs: 100, durationMs: 300 },
    })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: null,
      holePosition: null,
    })
    expect(next).toBe(mouse)
  })

  it('flees when spotted', () => {
    const mouse = makeMouse()
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: null,
    })
    expect(next.state).toBe('fleeing')
    expect(next.lastThreatenedAt).toBe(1000)
    expect(next.destination).not.toBeNull()
  })

  it('heads straight for the mouse hole when spotted and one exists', () => {
    const mouse = makeMouse()
    const hole = { x: 50, y: 100 }
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: hole,
    })
    expect(next.destination).toEqual(hole)
  })

  it('keeps re-aiming at the hole every tick while fleeing, in case it moves', () => {
    const mouse = makeMouse({
      state: 'fleeing',
      lastThreatenedAt: 900,
      destination: { x: 1, y: 1 },
    })
    const hole = { x: 60, y: 90 }
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: hole,
    })
    expect(next.destination).toEqual(hole)
    expect(next.state).toBe('fleeing')
  })

  it('calms back down to sneaking after being unbothered long enough', () => {
    const mouse = makeMouse({ state: 'fleeing', lastThreatenedAt: 0, destination: { x: 1, y: 1 } })
    const next = updateMouseBehavior(mouse, {
      now: MOUSE_CALM_MS + 1,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: null,
    })
    expect(next.state).toBe('sneaking')
    expect(next.destination).toBeNull()
  })

  it('does not calm down before the timeout elapses', () => {
    const mouse = makeMouse({ state: 'fleeing', lastThreatenedAt: 0, destination: null })
    const next = updateMouseBehavior(mouse, {
      now: MOUSE_CALM_MS - 1,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: null,
    })
    expect(next.state).toBe('fleeing')
  })

  it('picks a new sneak destination once the pause elapses, when arrived', () => {
    const mouse = makeMouse({ destination: null, actionStartedAt: 0 })
    const next = updateMouseBehavior(mouse, {
      now: 5000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: null,
    })
    expect(next.destination).not.toBeNull()
  })

  it('does not pick a new destination before the pause elapses', () => {
    const mouse = makeMouse({ destination: null, actionStartedAt: 900 })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: null,
    })
    expect(next.destination).toBeNull()
  })

  it('flees away from the threat when no hole exists, not toward it', () => {
    const mouse = makeMouse({ position: { x: 400, y: 400 } })
    const threatPos = { x: 420, y: 400 }
    // The candidate destination is random — run many trials to make sure
    // the away-bias holds generally, not just for one lucky roll.
    for (let i = 0; i < 30; i++) {
      const next = updateMouseBehavior(mouse, {
        now: 1000,
        sceneBounds: BOUNDS,
        topMargin: TOP_MARGIN,
        spotted: true,
        nearestThreatPosition: threatPos,
        holePosition: null,
      })
      const distNow = Math.hypot(mouse.position.x - threatPos.x, mouse.position.y - threatPos.y)
      const distNext = Math.hypot(
        next.destination!.x - threatPos.x,
        next.destination!.y - threatPos.y,
      )
      expect(distNext).toBeGreaterThanOrEqual(distNow - 1e-6)
    }
  })
})

describe('detection radii', () => {
  it('lets a stalking cat get closer before being noticed than a loud one', () => {
    expect(MOUSE_STALK_DETECT_RADIUS).toBeLessThan(MOUSE_DETECT_RADIUS)
  })
})
