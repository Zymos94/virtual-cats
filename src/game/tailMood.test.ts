import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { getTailAnchorLocal } from './tailMood'
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

// Only the seated-posture/tail-wrap logic added for grooming/stretching/
// kneading is covered here — getTailMood's broader mood table predates
// this session and isn't re-tested from scratch.
describe('getTailAnchorLocal — seated posture', () => {
  it('drops the tail the same way for sitting, grooming, and kneading', () => {
    const sitting = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 0)
    const grooming = getTailAnchorLocal(makePet({ action: 'grooming', actionStartedAt: 0 }), 0)
    const kneading = getTailAnchorLocal(makePet({ action: 'kneading', actionStartedAt: 0 }), 0)
    expect(grooming.y).toBeCloseTo(sitting.y, 5)
    expect(kneading.y).toBeCloseTo(sitting.y, 5)
  })

  it('does not drop the tail for plain idle', () => {
    const idle = getTailAnchorLocal(makePet({ action: 'idle' }), 0)
    const sitting = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 0)
    expect(idle.y).toBeLessThan(sitting.y)
  })
})

describe('getTailAnchorLocal — tail-wrap curl', () => {
  it('has no curl the instant a cat sits down', () => {
    const atSitDown = getTailAnchorLocal(
      makePet({ action: 'sitting', actionStartedAt: 1000 }),
      1000,
    )
    const stillIdle = getTailAnchorLocal(makePet({ action: 'idle' }), 1000)
    expect(atSitDown.x).toBe(stillIdle.x)
  })

  it('ramps the curl in over the first 1.2s of sitting, then holds', () => {
    const pet = makePet({ action: 'sitting', actionStartedAt: 0 })
    const start = getTailAnchorLocal(pet, 0).x
    const early = getTailAnchorLocal(pet, 200).x
    const mid = getTailAnchorLocal(pet, 600).x
    const settled = getTailAnchorLocal(pet, 1200).x
    const wellPast = getTailAnchorLocal(pet, 5000).x
    expect(early).toBeGreaterThan(start)
    expect(mid).toBeGreaterThan(early)
    expect(settled).toBeGreaterThan(mid)
    expect(wellPast).toBeCloseTo(settled, 5) // capped, doesn't keep growing
  })

  it('never curls a cat that never sits down', () => {
    const pet = makePet({ action: 'idle', actionStartedAt: 0 })
    expect(getTailAnchorLocal(pet, 5000).x).toBe(getTailAnchorLocal(pet, 0).x)
  })

  it('applies the same unflipped local curl regardless of facing', () => {
    // Deliberately unflipped — see the comment on getTailAnchorLocal's `x`
    // for why a directional push and a position correction mirror
    // oppositely. This pins that choice down so it can't silently flip.
    const rightDelta =
      getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0, facing: 'right' }), 1200)
        .x - getTailAnchorLocal(makePet({ action: 'idle', facing: 'right' }), 1200).x
    const leftDelta =
      getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0, facing: 'left' }), 1200)
        .x - getTailAnchorLocal(makePet({ action: 'idle', facing: 'left' }), 1200).x
    expect(rightDelta).toBeCloseTo(leftDelta, 5)
  })
})

// Both added so the tail anchor tracks the body's actual rendered
// position instead of a fixed offset that only ever matched a standing
// pose — a mismatch here is what reads as the tail "disconnecting" from
// the body in poses added after the anchor was originally tuned.
describe('getTailAnchorLocal — tracks the body it is actually attached to', () => {
  it('raises the tail for a stretch, where the rump silhouette sits well above standing', () => {
    const standing = getTailAnchorLocal(makePet({ action: 'idle' }), 0)
    const stretching = getTailAnchorLocal(makePet({ action: 'stretching' }), 0)
    expect(stretching.y).toBeLessThan(standing.y)
  })

  it('follows a moving gait’s crouch/rise, scaled by how fast it is actually moving', () => {
    const standingStill = getTailAnchorLocal(makePet({ action: 'stalking', currentSpeed: 0 }), 0)
    const slinking = getTailAnchorLocal(makePet({ action: 'stalking', currentSpeed: 30 }), 0)
    // SLINK's bodyHeight is positive (crouches down) and only applies
    // scaled by how fast the cat is actually moving (moving01) — both
    // samples are 'stalking' so tailCarriage/mood are held constant,
    // isolating just the gait-height contribution.
    expect(slinking.y).toBeGreaterThan(standingStill.y)
  })
})
