import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pet } from '../types/pet'
import { updatePetBehavior } from './behaviorFSM'
import { STARTER_AGE_MS } from './lifeStage'

const BOUNDS = { width: 1200, height: 800 }

function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'test-pet',
    name: 'Testy',
    needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
    position: { x: 200, y: 300 },
    destination: null,
    action: 'idle',
    facing: 'right',
    actionStartedAt: 0,
    genetics: {
      furColor: { allele1: 'gray', allele2: 'gray' },
      pattern: { allele1: 'solid', allele2: 'solid' },
      eyeColor: { allele1: 'green', allele2: 'green' },
      size: { allele1: 'medium', allele2: 'medium' },
      faceShape: { allele1: 'wedge', allele2: 'wedge' },
    },
    parentIds: null,
    inSuitcase: false,
    targetItemId: null,
    attentionSpan: 300,
    targetPetId: null,
    targetMouseId: null,
    socialClaimedBy: null,
    affection: 60,
    ageMs: STARTER_AGE_MS,
    currentSpeed: 0,
    stridePhase: 0,
    jump: null,
    actionDurationMs: 0,
    ...overrides,
  }
}

// All idle-decision tests run past the initial idle pause.
const AFTER_PAUSE = 5000

afterEach(() => {
  vi.restoreAllMocks()
})

describe('idle decisions', () => {
  it('bursts into zoomies on a low roll when energetic and happy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('zoomies')
    expect(next.destination).not.toBeNull()
    expect(next.actionDurationMs).toBeGreaterThan(0)
  })

  it('never zoomies when too tired, even on the same roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const pet = makePet({ needs: { hunger: 70, energy: 30, hygiene: 90, happiness: 60 } })
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).not.toBe('zoomies')
  })

  it('sits down on a middling roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('sitting')
    expect(next.actionDurationMs).toBeGreaterThan(0)
  })

  it('wanders on a high roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('walking')
  })

  // Default makePet() needs (energy 85, happiness 60, hygiene 90) give
  // cumulative slices: zoomies [0, .08), sitting [.08, .38), groom
  // [.38, .48), stretch [.48, .54), knead [.54, .61), walking [.61, 1).
  it('grooms on a roll in the groom slice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('grooming')
    expect(next.actionDurationMs).toBeGreaterThan(0)
  })

  it('stretches on a roll in the stretch slice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('stretching')
    expect(next.actionDurationMs).toBeGreaterThan(0)
  })

  it('kneads on a roll in the knead slice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.58)
    const pet = makePet()
    const next = updatePetBehavior(pet, { now: AFTER_PAUSE, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('kneading')
    expect(next.actionDurationMs).toBeGreaterThan(0)
  })

  it('grooms more often when hygiene is low, same roll otherwise landing on a wander', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const clean = makePet()
    const dirty = makePet({ needs: { ...makePet().needs, hygiene: 20 } })
    const cleanNext = updatePetBehavior(clean, {
      now: AFTER_PAUSE,
      sceneBounds: BOUNDS,
      bestTarget: null,
    })
    const dirtyNext = updatePetBehavior(dirty, {
      now: AFTER_PAUSE,
      sceneBounds: BOUNDS,
      bestTarget: null,
    })
    expect(cleanNext.action).toBe('stretching')
    expect(dirtyNext.action).toBe('grooming')
  })
})

describe.each(['grooming', 'stretching', 'kneading'] as const)('%s', (action) => {
  it('runs to completion, ignoring a target that would interrupt sitting', () => {
    const pet = makePet({ action, actionStartedAt: 0, actionDurationMs: 5000 })
    const next = updatePetBehavior(pet, {
      now: 1000,
      sceneBounds: BOUNDS,
      bestTarget: { kind: 'item', id: 'ball-1', position: { x: 250, y: 300 } },
    })
    expect(next).toBe(pet)
  })

  it('returns to idle once its duration elapses', () => {
    const pet = makePet({ action, actionStartedAt: 0, actionDurationMs: 2000 })
    const next = updatePetBehavior(pet, { now: 2500, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('idle')
  })
})

describe('sitting', () => {
  it('stands straight up for something worth wanting', () => {
    const pet = makePet({ action: 'sitting', actionStartedAt: 0, actionDurationMs: 60000 })
    const next = updatePetBehavior(pet, {
      now: 1000,
      sceneBounds: BOUNDS,
      bestTarget: { kind: 'item', id: 'ball-1', position: { x: 500, y: 400 } },
    })
    expect(next.action).toBe('walking')
    expect(next.targetItemId).toBe('ball-1')
  })

  it('gets up on its own once the sit runs out', () => {
    const pet = makePet({ action: 'sitting', actionStartedAt: 0, actionDurationMs: 5000 })
    const still = updatePetBehavior(pet, { now: 3000, sceneBounds: BOUNDS, bestTarget: null })
    expect(still.action).toBe('sitting')
    const done = updatePetBehavior(pet, { now: 6000, sceneBounds: BOUNDS, bestTarget: null })
    expect(done.action).toBe('idle')
  })
})

describe('zoomies', () => {
  it('picks a fresh destination on arrival and keeps running', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // no hop this turn
    const pet = makePet({
      action: 'zoomies',
      actionStartedAt: 0,
      actionDurationMs: 60000,
      position: { x: 500, y: 400 },
      destination: { x: 502, y: 400 },
    })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('zoomies')
    expect(next.destination).not.toEqual(pet.destination)
  })

  it('sometimes turns the next sprint into a hop', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // below hop chance; also fixes the random point
    const pet = makePet({
      action: 'zoomies',
      actionStartedAt: 0,
      actionDurationMs: 60000,
      position: { x: 500, y: 400 },
      destination: null,
    })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('zoomies')
    expect(next.jump).not.toBeNull()
  })

  it('winds down to idle when the burst is over', () => {
    const pet = makePet({
      action: 'zoomies',
      actionStartedAt: 0,
      actionDurationMs: 4000,
      destination: { x: 900, y: 300 },
    })
    const next = updatePetBehavior(pet, { now: 5000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('idle')
  })
})

describe('pouncing', () => {
  it('waits out an in-flight jump', () => {
    const pet = makePet({
      action: 'pouncing',
      jump: { from: { x: 0, y: 0 }, to: { x: 70, y: 0 }, progressMs: 100, durationMs: 400 },
    })
    expect(updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })).toBe(pet)
  })

  it('recovers to idle if the jump vanished out from under it', () => {
    const pet = makePet({ action: 'pouncing', jump: null })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('idle')
  })
})

describe('stalking', () => {
  it('keeps creeping toward its destination', () => {
    const pet = makePet({
      action: 'stalking',
      targetItemId: 'mouse-1',
      destination: { x: 260, y: 300 },
    })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next).toBe(pet)
  })

  it('falls back to idle if its destination disappears', () => {
    const pet = makePet({ action: 'stalking', targetItemId: 'mouse-1', destination: null })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('idle')
  })

  it('settles to idle once it has closed the distance', () => {
    const pet = makePet({
      action: 'stalking',
      targetItemId: 'mouse-1',
      position: { x: 200, y: 300 },
      destination: { x: 201, y: 300 },
    })
    const next = updatePetBehavior(pet, { now: 1000, sceneBounds: BOUNDS, bestTarget: null })
    expect(next.action).toBe('idle')
  })
})
