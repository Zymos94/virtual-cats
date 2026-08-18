import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { bodyPoseFor, footOffset, GALLOP, selectGait, SLINK, STRUT, TROT, WALK } from './gaits'
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

const STRIDE_AMP = 8
const LIFT_AMP = 6
const TWO_PI = Math.PI * 2

// footOffset is phase-shift invariant — a leg's own legPhaseFraction just
// decides *when in the cycle* this curve applies to it, not its shape. So
// sweeping stridePhase across a full cycle at legPhaseFraction 0 exercises
// the same math every leg in every gait uses.
function sampleCycle(dutyFactor: number, steps = 400) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const stridePhase = (i / steps) * TWO_PI
    const { dx, dy } = footOffset(stridePhase, 0, dutyFactor, STRIDE_AMP, LIFT_AMP)
    return { p: i / steps, dx, dy }
  })
}

describe.each([WALK, TROT, SLINK, GALLOP, STRUT])('footOffset ($name)', (gait) => {
  const points = sampleCycle(gait.dutyFactor)
  const stance = points.filter((pt) => pt.p > 0.005 && pt.p < gait.dutyFactor - 0.005)
  const swing = points.filter((pt) => pt.p > gait.dutyFactor + 0.005 && pt.p < 0.995)

  it('never slides a planted foot forward — the moonwalk bug', () => {
    // A planted foot must sweep monotonically backward (dx strictly
    // non-increasing) as the body moves over it. If this regresses, the
    // renderer goes back to looking like the cat is moonwalking.
    for (let i = 1; i < stance.length; i++) {
      expect(stance[i].dx).toBeLessThanOrEqual(stance[i - 1].dx + 1e-9)
    }
  })

  it('keeps a lifted foot off the ground through the whole swing', () => {
    for (const pt of swing) expect(pt.dy).toBeLessThanOrEqual(1e-9)
  })

  it('has no pop where stance hands off to swing', () => {
    const justBeforeLiftoff = footOffset(
      gait.dutyFactor * TWO_PI - 0.001,
      0,
      gait.dutyFactor,
      STRIDE_AMP,
      LIFT_AMP,
    )
    const justAfterLiftoff = footOffset(
      gait.dutyFactor * TWO_PI + 0.001,
      0,
      gait.dutyFactor,
      STRIDE_AMP,
      LIFT_AMP,
    )
    expect(justAfterLiftoff.dx).toBeCloseTo(justBeforeLiftoff.dx, 1)
    expect(justAfterLiftoff.dy).toBeCloseTo(justBeforeLiftoff.dy, 1)
  })

  it('touches down exactly where the next stance begins', () => {
    const justBeforeTouchdown = footOffset(TWO_PI - 0.001, 0, gait.dutyFactor, STRIDE_AMP, LIFT_AMP)
    const justAfterTouchdown = footOffset(0.001, 0, gait.dutyFactor, STRIDE_AMP, LIFT_AMP)
    expect(justAfterTouchdown.dx).toBeCloseTo(justBeforeTouchdown.dx, 1)
    expect(justAfterTouchdown.dy).toBeCloseTo(justBeforeTouchdown.dy, 1)
  })
})

describe('selectGait', () => {
  it('walks on an aimless wander', () => {
    expect(selectGait(makePet()).name).toBe('walk')
  })

  it('trots toward a wanted item', () => {
    expect(selectGait(makePet({ targetItemId: 'ball-1' })).name).toBe('trot')
  })

  it('trots toward another cat', () => {
    expect(selectGait(makePet({ targetPetId: 'cat-2' })).name).toBe('trot')
  })

  it('trots after a mouse that is merely sneaking', () => {
    expect(selectGait(makePet({ targetMouseId: 'mouse-1' }), false).name).toBe('trot')
  })

  it('gallops after a mouse that is actually fleeing', () => {
    expect(selectGait(makePet({ targetMouseId: 'mouse-1' }), true).name).toBe('gallop')
  })

  it('does not gallop from a fleeing mouse elsewhere in the room it is not even chasing', () => {
    expect(selectGait(makePet(), true).name).toBe('walk')
  })

  it('slinks while stalking', () => {
    expect(selectGait(makePet({ action: 'stalking', targetItemId: 'mouse-1' })).name).toBe('slink')
  })

  it('gallops during zoomies', () => {
    expect(selectGait(makePet({ action: 'zoomies' })).name).toBe('gallop')
  })

  it('gallops toward a wanted item when very hungry', () => {
    const pet = makePet({ targetItemId: 'food-1', needs: { ...makePet().needs, hunger: 15 } })
    expect(selectGait(pet).name).toBe('gallop')
  })

  it('gallops toward a wanted item when nearly out of energy', () => {
    const pet = makePet({ targetItemId: 'bed-1', needs: { ...makePet().needs, energy: 10 } })
    expect(selectGait(pet).name).toBe('gallop')
  })

  it('does not gallop from urgency alone without something to walk toward', () => {
    const pet = makePet({ needs: { ...makePet().needs, hunger: 5 } })
    expect(selectGait(pet).name).toBe('walk')
  })

  it('struts a happy aimless wander', () => {
    const pet = makePet({ action: 'walking', needs: { ...makePet().needs, happiness: 95 } })
    expect(selectGait(pet).name).toBe('strut')
  })

  it('does not strut a happy cat that is not actually walking', () => {
    const pet = makePet({ action: 'idle', needs: { ...makePet().needs, happiness: 95 } })
    expect(selectGait(pet).name).toBe('walk')
  })

  it('does not strut a happy cat heading toward something specific', () => {
    const pet = makePet({
      action: 'walking',
      targetItemId: 'toy-1',
      needs: { ...makePet().needs, happiness: 95 },
    })
    expect(selectGait(pet).name).toBe('trot')
  })
})

describe('bodyPoseFor', () => {
  it('applies none of a neutral gait posture', () => {
    expect(bodyPoseFor(WALK, 1.2, 1)).toEqual({
      heightOffset: 0,
      stretch: 0,
      headHeightOffset: 0,
      headPitchDeg: 0,
    })
  })

  it('scales posture in with moving01, absent when standing still', () => {
    const standing = bodyPoseFor(SLINK, 1.2, 0)
    expect(standing.heightOffset).toBe(0)
    expect(standing.headHeightOffset).toBe(0)
    expect(standing.headPitchDeg).toBe(0)

    const moving = bodyPoseFor(SLINK, 1.2, 1)
    expect(moving.heightOffset).toBe(SLINK.bodyHeight)
    expect(moving.headHeightOffset).toBe(SLINK.headHeight)
    expect(moving.headPitchDeg).toBe(SLINK.headPitchDeg)
  })

  it('only gallop carries a nonzero spine stretch', () => {
    expect(bodyPoseFor(WALK, 1.2, 1).stretch).toBe(0)
    expect(bodyPoseFor(TROT, 1.2, 1).stretch).toBe(0)
    expect(bodyPoseFor(SLINK, 1.2, 1).stretch).toBe(0)
    expect(bodyPoseFor(STRUT, 1.2, 1).stretch).toBe(0)
    expect(bodyPoseFor(GALLOP, 1.2, 1).stretch).not.toBe(0)
  })

  it('cycles gallop stretch twice per stride (once per suspension)', () => {
    const atZero = bodyPoseFor(GALLOP, 0, 1).stretch
    const atHalf = bodyPoseFor(GALLOP, Math.PI, 1).stretch
    const atFull = bodyPoseFor(GALLOP, Math.PI * 2, 1).stretch
    expect(atZero).toBeCloseTo(0, 5)
    expect(atHalf).toBeCloseTo(0, 5) // sin(2*pi) — a full extra cycle already completed
    expect(atFull).toBeCloseTo(0, 5)
  })
})
