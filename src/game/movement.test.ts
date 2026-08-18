import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { movePet } from './movement'
import { STARTER_AGE_MS } from './lifeStage'

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

describe('movePet gaits', () => {
  it('accelerates gradually instead of snapping to full speed', () => {
    const pet = makePet({ action: 'walking', destination: { x: 800, y: 300 } })
    const stepped = movePet(pet, 16)
    expect(stepped.currentSpeed).toBeGreaterThan(0)
    expect(stepped.currentSpeed).toBeLessThan(15) // one frame of ACCEL, nowhere near cruise
  })

  it('trots faster toward a wanted item than it ambles on a wander', () => {
    let wanderer = makePet({ action: 'walking', destination: { x: 2000, y: 300 } })
    let chaser = makePet({
      action: 'walking',
      destination: { x: 2000, y: 300 },
      targetItemId: 'ball-1',
    })
    for (let i = 0; i < 120; i++) {
      wanderer = movePet(wanderer, 16)
      chaser = movePet(chaser, 16)
    }
    expect(chaser.currentSpeed).toBeGreaterThan(wanderer.currentSpeed * 1.5)
  })

  it('runs flat-out during zoomies', () => {
    let pet = makePet({ action: 'zoomies', destination: { x: 3000, y: 300 } })
    for (let i = 0; i < 200; i++) pet = movePet(pet, 16)
    expect(pet.currentSpeed).toBeGreaterThan(150)
  })

  it('actually creeps toward its destination while stalking', () => {
    let pet = makePet({
      action: 'stalking',
      targetItemId: 'mouse-1',
      destination: { x: 800, y: 300 },
    })
    for (let i = 0; i < 60; i++) pet = movePet(pet, 16)
    expect(pet.position.x).toBeGreaterThan(200) // actually moved, not frozen
  })

  it('stalks slower than it trots toward the same wanted item', () => {
    let stalker = makePet({
      action: 'stalking',
      targetItemId: 'mouse-1',
      destination: { x: 2000, y: 300 },
    })
    let trotter = makePet({
      action: 'walking',
      targetItemId: 'mouse-1',
      destination: { x: 2000, y: 300 },
    })
    for (let i = 0; i < 120; i++) {
      stalker = movePet(stalker, 16)
      trotter = movePet(trotter, 16)
    }
    expect(stalker.currentSpeed).toBeLessThan(trotter.currentSpeed)
  })

  it('advances stride phase with distance traveled', () => {
    let pet = makePet({ action: 'walking', destination: { x: 800, y: 300 } })
    for (let i = 0; i < 60; i++) pet = movePet(pet, 16)
    expect(pet.stridePhase).toBeGreaterThan(0)
  })

  it('bleeds off leftover speed when no longer moving', () => {
    let pet = makePet({ action: 'idle', currentSpeed: 100 })
    for (let i = 0; i < 60; i++) pet = movePet(pet, 16)
    expect(pet.currentSpeed).toBe(0)
  })
})

describe('movePet jumps', () => {
  it('carries a pounce to its landing point and resolves to idle', () => {
    let pet = makePet({
      action: 'pouncing',
      targetItemId: 'ball-1',
      jump: { from: { x: 200, y: 300 }, to: { x: 270, y: 310 }, progressMs: 0, durationMs: 400 },
    })
    for (let i = 0; i < 30 && pet.jump; i++) pet = movePet(pet, 16)
    expect(pet.jump).toBeNull()
    expect(pet.action).toBe('idle')
    expect(pet.position).toEqual({ x: 270, y: 310 })
    expect(pet.targetItemId).toBe('ball-1') // kept, for the arrival pass
  })

  it('resumes zoomies after a hop lands', () => {
    let pet = makePet({
      action: 'zoomies',
      destination: { x: 900, y: 300 },
      jump: { from: { x: 200, y: 300 }, to: { x: 290, y: 300 }, progressMs: 0, durationMs: 420 },
    })
    for (let i = 0; i < 30 && pet.jump; i++) pet = movePet(pet, 16)
    expect(pet.jump).toBeNull()
    expect(pet.action).toBe('zoomies')
  })

  it('faces the direction of the leap', () => {
    const pet = makePet({
      facing: 'right',
      action: 'pouncing',
      jump: { from: { x: 200, y: 300 }, to: { x: 100, y: 300 }, progressMs: 0, durationMs: 400 },
    })
    expect(movePet(pet, 16).facing).toBe('left')
  })
})
