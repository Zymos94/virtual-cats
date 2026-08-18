import { describe, expect, it } from 'vitest'
import type { Mouse } from '../types/mouse'
import {
  MOUSE_CALM_MS,
  MOUSE_DETECT_RADIUS,
  MOUSE_STALK_DETECT_RADIUS,
  scareMouse,
  updateMouseBehavior,
} from './mouseBehavior'

const BOUNDS = { width: 1200, height: 800 }
const TOP_MARGIN = 160
const HOLE = { x: 50, y: 100 }

function makeMouse(overrides: Partial<Mouse> = {}): Mouse {
  return {
    id: 'test-mouse',
    position: { x: 400, y: 400 },
    destination: null,
    state: 'sneaking',
    facing: 'right',
    livesRemaining: 4,
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
      holePosition: HOLE,
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
      holePosition: HOLE,
    })
    expect(next).toBe(mouse)
  })

  it('flees away from the threat when spotted with lives to spare — not toward the hole', () => {
    const mouse = makeMouse({ position: { x: 400, y: 400 }, livesRemaining: 4 })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: HOLE,
    })
    expect(next.state).toBe('fleeing')
    expect(next.lastThreatenedAt).toBe(1000)
    expect(next.destination).not.toBeNull()
    expect(next.destination).not.toEqual(HOLE)
    expect(next.livesRemaining).toBe(3)
  })

  it('heads straight for the mouse hole once a scare uses up its last life', () => {
    const mouse = makeMouse({ livesRemaining: 1 })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: HOLE,
    })
    expect(next.livesRemaining).toBe(0)
    expect(next.destination).toEqual(HOLE)
  })

  it('does not spend a life on a repeat scare within the same flee episode', () => {
    const mouse = makeMouse({ state: 'fleeing', livesRemaining: 2, destination: { x: 1, y: 1 } })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: HOLE,
    })
    expect(next.livesRemaining).toBe(2)
    expect(next.lastThreatenedAt).toBe(1000)
  })

  it('keeps heading to its already-chosen destination while still being chased, not re-rolling every tick', () => {
    const mouse = makeMouse({
      state: 'fleeing',
      lastThreatenedAt: 900,
      destination: { x: 111, y: 222 },
    })
    const next = updateMouseBehavior(mouse, {
      now: 1000,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: true,
      nearestThreatPosition: { x: 500, y: 400 },
      holePosition: HOLE,
    })
    expect(next.destination).toEqual({ x: 111, y: 222 })
  })

  it('calms back down to sneaking after being unbothered long enough', () => {
    const mouse = makeMouse({ state: 'fleeing', lastThreatenedAt: 0, destination: { x: 1, y: 1 } })
    const next = updateMouseBehavior(mouse, {
      now: MOUSE_CALM_MS + 1,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: HOLE,
    })
    expect(next.state).toBe('sneaking')
    expect(next.destination).toBeNull()
  })

  it('keeps its lives-remaining count across a calm-down — spooks accumulate for its whole life', () => {
    const mouse = makeMouse({ state: 'fleeing', lastThreatenedAt: 0, livesRemaining: 2 })
    const next = updateMouseBehavior(mouse, {
      now: MOUSE_CALM_MS + 1,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: HOLE,
    })
    expect(next.livesRemaining).toBe(2)
  })

  it('does not calm down before the timeout elapses', () => {
    const mouse = makeMouse({ state: 'fleeing', lastThreatenedAt: 0, destination: null })
    const next = updateMouseBehavior(mouse, {
      now: MOUSE_CALM_MS - 1,
      sceneBounds: BOUNDS,
      topMargin: TOP_MARGIN,
      spotted: false,
      nearestThreatPosition: null,
      holePosition: HOLE,
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
      holePosition: HOLE,
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
      holePosition: HOLE,
    })
    expect(next.destination).toBeNull()
  })

  it('picks an away-from-threat sneak point biased away from the nearest cat', () => {
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
        holePosition: HOLE,
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

describe('scareMouse', () => {
  it('is what a pounce/chuck reuses — a fresh scare from any non-fleeing state spends a life', () => {
    const mouse = makeMouse({ state: 'held', livesRemaining: 3 })
    const next = scareMouse(mouse, 1000, BOUNDS, TOP_MARGIN, { x: 0, y: 0 }, HOLE)
    expect(next.state).toBe('fleeing')
    expect(next.livesRemaining).toBe(2)
  })
})

describe('detection radii', () => {
  it('lets a stalking cat get closer before being noticed than a loud one', () => {
    expect(MOUSE_STALK_DETECT_RADIUS).toBeLessThan(MOUSE_DETECT_RADIUS)
  })
})
