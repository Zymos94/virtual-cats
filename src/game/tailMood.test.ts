import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { getTailAnchorLocal, getTailTipOffsetLocal } from './tailMood'
import { STARTER_AGE_MS } from './lifeStage'

const NEEDS = { hunger: 70, energy: 85, hygiene: 90, happiness: 60 }

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

// Only the seated-posture/tail-wrap logic added for grooming/stretching/
// kneading is covered here — getTailMood's broader mood table predates
// this session and isn't re-tested from scratch. Every posture below ramps
// in over POSE_TRANSITION_MS/SLEEP_TRANSITION_MS (see tailMood.ts) rather
// than snapping instantly, so most samples here are taken well past that
// (1000ms) to check the settled state — the ramp itself is covered
// separately below.
describe('getTailAnchorLocal — seated posture (settled)', () => {
  it('drops the tail the same way for sitting, grooming, and kneading', () => {
    const sitting = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 1000)
    const grooming = getTailAnchorLocal(makePet({ action: 'grooming', actionStartedAt: 0 }), 1000)
    const kneading = getTailAnchorLocal(makePet({ action: 'kneading', actionStartedAt: 0 }), 1000)
    expect(grooming.y).toBeCloseTo(sitting.y, 5)
    expect(kneading.y).toBeCloseTo(sitting.y, 5)
  })

  it('does not drop the tail for plain idle', () => {
    const idle = getTailAnchorLocal(makePet({ action: 'idle' }), 1000)
    const sitting = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 1000)
    expect(idle.y).toBeLessThan(sitting.y)
  })
})

describe('getTailAnchorLocal — posture and curl ramp in, not snap', () => {
  it('has no drop or curl the instant a cat sits down', () => {
    const atSitDown = getTailAnchorLocal(
      makePet({ action: 'sitting', actionStartedAt: 1000 }),
      1000,
    )
    const stillIdle = getTailAnchorLocal(makePet({ action: 'idle' }), 1000)
    expect(atSitDown.x).toBe(stillIdle.x)
    expect(atSitDown.y).toBe(stillIdle.y)
  })

  it('ramps the seated drop and curl in gradually, then holds', () => {
    const pet = makePet({ action: 'sitting', actionStartedAt: 0 })
    const start = getTailAnchorLocal(pet, 0)
    const early = getTailAnchorLocal(pet, 80)
    const mid = getTailAnchorLocal(pet, 200)
    const settled = getTailAnchorLocal(pet, 350)
    const wellPast = getTailAnchorLocal(pet, 5000)
    expect(early.x).toBeGreaterThan(start.x)
    expect(mid.x).toBeGreaterThan(early.x)
    expect(settled.x).toBeGreaterThan(mid.x)
    expect(wellPast.x).toBeCloseTo(settled.x, 5) // capped, doesn't keep growing
    expect(early.y).toBeGreaterThan(start.y)
    expect(mid.y).toBeGreaterThan(early.y)
    expect(settled.y).toBeGreaterThan(mid.y)
    expect(wellPast.y).toBeCloseTo(settled.y, 5)
  })

  it('never curls or drops a cat that never sits down', () => {
    const pet = makePet({ action: 'idle', actionStartedAt: 0 })
    expect(getTailAnchorLocal(pet, 5000).x).toBe(getTailAnchorLocal(pet, 0).x)
    expect(getTailAnchorLocal(pet, 5000).y).toBe(getTailAnchorLocal(pet, 0).y)
  })

  it('settles into sleeping a bit slower than sitting, matching the bigger pose change', () => {
    const sitter = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 350)
    const sitterStill = getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0 }), 0)
    const sleeper = getTailAnchorLocal(makePet({ action: 'sleeping', actionStartedAt: 0 }), 350)
    const sleeperStill = getTailAnchorLocal(makePet({ action: 'sleeping', actionStartedAt: 0 }), 0)
    // Sitting is fully ramped in by 350ms (its own transition length);
    // sleeping (a longer ramp) is only partway there at the same instant.
    expect(sitter.y - sitterStill.y).toBeCloseTo(30, 0)
    expect(sleeper.y - sleeperStill.y).toBeLessThan(24)
    expect(sleeper.y - sleeperStill.y).toBeGreaterThan(0)
  })

  it('applies the same unflipped local curl regardless of facing', () => {
    // Deliberately unflipped — see the comment on getTailAnchorLocal's `x`
    // for why a directional push and a position correction mirror
    // oppositely. This pins that choice down so it can't silently flip.
    const rightDelta =
      getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0, facing: 'right' }), 1000)
        .x - getTailAnchorLocal(makePet({ action: 'idle', facing: 'right' }), 1000).x
    const leftDelta =
      getTailAnchorLocal(makePet({ action: 'sitting', actionStartedAt: 0, facing: 'left' }), 1000)
        .x - getTailAnchorLocal(makePet({ action: 'idle', facing: 'left' }), 1000).x
    expect(rightDelta).toBeCloseTo(leftDelta, 5)
  })
})

// Both added so the tail anchor tracks the body's actual rendered
// position instead of a fixed offset that only ever matched a standing
// pose — a mismatch here is what reads as the tail "disconnecting" from
// the body in poses added after the anchor was originally tuned.
describe('getTailAnchorLocal — tracks the body it is actually attached to', () => {
  it('raises the tail for a stretch, where the rump silhouette sits well above standing', () => {
    const standing = getTailAnchorLocal(makePet({ action: 'idle' }), 1000)
    const stretching = getTailAnchorLocal(
      makePet({ action: 'stretching', actionStartedAt: 0 }),
      1000,
    )
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

  it('follows the same per-stride bounce the body actually renders, not just the gait height', () => {
    // Two otherwise-identical moving cats, differing only in stridePhase —
    // isolates the oscillating `bob` term (tied to stridePhase) from the
    // static gait.bodyHeight term (which wouldn't differ between them).
    const trough = getTailAnchorLocal(
      makePet({ action: 'walking', currentSpeed: 60, stridePhase: Math.PI / 2 }),
      0,
    )
    const crest = getTailAnchorLocal(
      makePet({ action: 'walking', currentSpeed: 60, stridePhase: 0 }),
      0,
    )
    expect(trough.y).not.toBeCloseTo(crest.y, 0)
  })

  it('gallops with a bigger bounce than a trot toward the same wanted item', () => {
    const trotting = getTailAnchorLocal(
      makePet({
        action: 'walking',
        targetItemId: 'ball-1',
        currentSpeed: 100,
        stridePhase: Math.PI / 2,
      }),
      0,
      false,
    )
    const galloping = getTailAnchorLocal(
      makePet({
        action: 'walking',
        targetMouseId: 'mouse-1',
        currentSpeed: 100,
        stridePhase: Math.PI / 2,
      }),
      0,
      true, // chasingFleeingMouse -> GALLOP, bounceMul 1.7 vs TROT's 1.0
    )
    const standing = getTailAnchorLocal(makePet({ action: 'idle', currentSpeed: 100 }), 0)
    expect(Math.abs(galloping.y - standing.y)).toBeGreaterThan(Math.abs(trotting.y - standing.y))
  })
})

// getTailTipOffsetLocal is the tip's own resting reach/direction, added to
// the (unit-tested above) anchor to get the FABRIK target — see the M25
// entry in DEVLOG.md for why this is a separate function from the anchor
// rather than folded into it.
describe('getTailTipOffsetLocal — mood shapes the resting reach', () => {
  it('content carries the tip up and in, shorter than neutral trails it down and out', () => {
    const content = getTailTipOffsetLocal(makePet({ needs: { ...NEEDS, happiness: 90 } }), 0)
    const neutral = getTailTipOffsetLocal(makePet(), 0)
    expect(content.y).toBeLessThan(0) // up
    expect(neutral.y).toBeGreaterThan(0) // down
    expect(Math.hypot(content.x, content.y)).toBeLessThan(Math.hypot(neutral.x, neutral.y))
  })

  it('agitated actually moves over time — the flick is not a static offset', () => {
    const pet = makePet({ needs: { ...NEEDS, hunger: 10 } })
    const atStart = getTailTipOffsetLocal(pet, 0)
    const midFlick = getTailTipOffsetLocal(pet, 400)
    expect(atStart.x).not.toBeCloseTo(midFlick.x, 0)
  })

  it('social swishes back and forth over time too', () => {
    const pet = makePet({ action: 'playing', targetPetId: 'other-pet' })
    const a = getTailTipOffsetLocal(pet, 0)
    const b = getTailTipOffsetLocal(pet, 325) // quarter of the 650ms-period swish
    expect(a.x).not.toBeCloseTo(b.x, 0)
  })
})

describe('getTailTipOffsetLocal — posture overrides ramp in, matching the anchor pattern', () => {
  it('seated: reaches forward once settled instead of neutral’s backward trail', () => {
    const freshlySeated = getTailTipOffsetLocal(
      makePet({ action: 'sitting', actionStartedAt: 1000 }),
      1000,
    )
    const settledSeated = getTailTipOffsetLocal(
      makePet({ action: 'sitting', actionStartedAt: 0 }),
      1000,
    )
    expect(freshlySeated.x).toBeLessThan(0) // still trailing back like neutral
    expect(settledSeated.x).toBeGreaterThan(0) // wrapped forward
  })

  it('held: settles onto a near-straight-down reach, no leftover mood direction', () => {
    const settledHeld = getTailTipOffsetLocal(makePet({ action: 'held', actionStartedAt: 0 }), 1000)
    expect(Math.abs(settledHeld.x)).toBeLessThan(3)
    expect(settledHeld.y).toBeGreaterThan(20) // straight down, and a long reach
  })

  it('stretching: settles onto an extended-back-and-up reach, not neutral’s down-trail', () => {
    const freshStretch = getTailTipOffsetLocal(
      makePet({ action: 'stretching', actionStartedAt: 1000 }),
      1000,
    )
    const settledStretch = getTailTipOffsetLocal(
      makePet({ action: 'stretching', actionStartedAt: 0 }),
      1000,
    )
    expect(freshStretch.y).toBeGreaterThan(0)
    expect(settledStretch.y).toBeLessThan(freshStretch.y)
  })
})
