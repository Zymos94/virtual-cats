import { describe, expect, it } from 'vitest'
import type { Mouse } from '../types/mouse'
import { moveMouse, MOUSE_FLEE_SPEED, MOUSE_SNEAK_SPEED } from './mouseMovement'

function makeMouse(overrides: Partial<Mouse> = {}): Mouse {
  return {
    id: 'test-mouse',
    position: { x: 200, y: 300 },
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

describe('moveMouse', () => {
  it('accelerates toward its destination instead of snapping to full speed', () => {
    const mouse = makeMouse({ destination: { x: 800, y: 300 } })
    const stepped = moveMouse(mouse, 16)
    expect(stepped.currentSpeed).toBeGreaterThan(0)
    expect(stepped.currentSpeed).toBeLessThan(MOUSE_SNEAK_SPEED)
  })

  it('flees faster than it sneaks', () => {
    let sneaker = makeMouse({ destination: { x: 2000, y: 300 } })
    let fleer = makeMouse({ state: 'fleeing', destination: { x: 2000, y: 300 } })
    for (let i = 0; i < 120; i++) {
      sneaker = moveMouse(sneaker, 16)
      fleer = moveMouse(fleer, 16)
    }
    expect(fleer.currentSpeed).toBeGreaterThan(sneaker.currentSpeed)
    expect(fleer.currentSpeed).toBeCloseTo(MOUSE_FLEE_SPEED, 0)
    expect(sneaker.currentSpeed).toBeCloseTo(MOUSE_SNEAK_SPEED, 0)
  })

  it('does not move while held even with a destination set', () => {
    const mouse = makeMouse({ state: 'held', destination: { x: 900, y: 300 } })
    const stepped = moveMouse(mouse, 200)
    expect(stepped.position).toEqual(mouse.position)
  })

  it('bleeds off leftover speed when it has nowhere to go', () => {
    let mouse = makeMouse({ destination: null, currentSpeed: 100 })
    for (let i = 0; i < 60; i++) mouse = moveMouse(mouse, 16)
    expect(mouse.currentSpeed).toBe(0)
  })

  it('advances stride phase with distance traveled', () => {
    let mouse = makeMouse({ destination: { x: 800, y: 300 } })
    for (let i = 0; i < 60; i++) mouse = moveMouse(mouse, 16)
    expect(mouse.stridePhase).toBeGreaterThan(0)
  })

  it('carries a chuck hop to its landing point and clears it on arrival', () => {
    let mouse = makeMouse({
      jump: { from: { x: 200, y: 300 }, to: { x: 300, y: 300 }, progressMs: 0, durationMs: 300 },
    })
    for (let i = 0; i < 30 && mouse.jump; i++) mouse = moveMouse(mouse, 16)
    expect(mouse.jump).toBeNull()
    expect(mouse.position).toEqual({ x: 300, y: 300 })
  })

  it('faces the direction it moves', () => {
    const mouse = makeMouse({ destination: { x: 100, y: 300 }, position: { x: 200, y: 300 } })
    expect(moveMouse(mouse, 16).facing).toBe('left')
  })
})
