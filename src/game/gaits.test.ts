import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { footOffset, selectGait, TROT, WALK } from './gaits'
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

describe.each([WALK, TROT])('footOffset ($name)', (gait) => {
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
})
