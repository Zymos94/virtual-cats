import { describe, expect, it } from 'vitest'
import { computeLegPoses, GROUND_Y } from './catPose'
import { WALK } from './gaits'

function basePose(overrides: Partial<Parameters<typeof computeLegPoses>[0]> = {}) {
  return computeLegPoses({
    stridePhase: 0,
    gait: WALK,
    speed01: 0,
    moving01: 0,
    sit: 0,
    lie: 0,
    hop: 0,
    bob: 0,
    hold: 0,
    holdSwingPhase: 0,
    holdSwingAmount: 0,
    groom: 0,
    groomVariant: 'lick',
    groomPhase: 0,
    stretch: 0,
    knead: 0,
    kneadPhase: 0,
    ...overrides,
  })
}

describe('computeLegPoses held/scruff-dangle blend', () => {
  it('leaves the standing pose untouched when hold is 0', () => {
    const standing = basePose()
    const held = basePose({ hold: 0 })
    expect(held).toEqual(standing)
  })

  it('drops every foot below its hip once fully held', () => {
    const legs = basePose({ hold: 1, holdSwingPhase: 0.7 })
    for (const leg of legs) {
      expect(leg.foot.y).toBeGreaterThan(leg.hip.y)
    }
  })

  it('hangs shorter than a standing leg — relaxed, not reaching for the floor', () => {
    // A standing/planted foot sits at GROUND_Y; the dangle should read as
    // visibly shorter than that, not touching down like a standing pose.
    const legs = basePose({ hold: 1, holdSwingPhase: 0 })
    for (const leg of legs) {
      expect(leg.foot.y).toBeLessThan(GROUND_Y)
    }
  })

  it('swings feet side to side as holdSwingPhase advances', () => {
    const a = basePose({ hold: 1, holdSwingPhase: 0, holdSwingAmount: 1 })
    const b = basePose({ hold: 1, holdSwingPhase: Math.PI / 2, holdSwingAmount: 1 })
    // At least one foot should have visibly moved horizontally between
    // these two phases of the pendulum swing.
    const moved = a.some((leg, i) => Math.abs(leg.foot.x - b[i].foot.x) > 0.5)
    expect(moved).toBe(true)
  })

  it('blends smoothly between standing and fully held', () => {
    const standing = basePose({ hold: 0 })
    const half = basePose({ hold: 0.5, holdSwingPhase: 0.3, holdSwingAmount: 0.5 })
    const full = basePose({ hold: 1, holdSwingPhase: 0.3, holdSwingAmount: 0.5 })
    for (let i = 0; i < standing.length; i++) {
      const standDist = Math.abs(half[i].foot.y - standing[i].foot.y)
      const fullDist = Math.abs(half[i].foot.y - full[i].foot.y)
      // The halfway pose should sit between the two endpoints, not equal
      // either one outright.
      expect(standDist).toBeGreaterThan(0)
      expect(fullDist).toBeGreaterThan(0)
    }
  })
})

describe('computeLegPoses grooming', () => {
  it('leaves every leg alone for a flank-lick — the head does the work', () => {
    const standing = basePose()
    const licking = basePose({ groom: 1, groomVariant: 'lick', groomPhase: 1.4 })
    expect(licking).toEqual(standing)
  })

  it('lifts only the near-front paw for a paw-wash', () => {
    const legs = basePose({ groom: 1, groomVariant: 'pawWash', groomPhase: Math.PI / 2 })
    for (const leg of legs) {
      const isWashingPaw = leg.isFront && leg.isNear
      if (isWashingPaw) {
        expect(leg.foot.y).toBeLessThan(leg.hip.y) // reaching up toward the face
      } else {
        expect(leg.foot.y).toBeCloseTo(GROUND_Y, 5) // planted, standing still
      }
    }
  })

  it('the wash paw returns to rest partway through the cycle, not stuck raised', () => {
    const raised = basePose({ groom: 1, groomVariant: 'pawWash', groomPhase: Math.PI / 2 })
    const resting = basePose({ groom: 1, groomVariant: 'pawWash', groomPhase: Math.PI })
    const washPaw = (legs: ReturnType<typeof basePose>) => legs.find((l) => l.isFront && l.isNear)!
    expect(washPaw(raised).foot.y).toBeLessThan(washPaw(resting).foot.y)
  })
})

describe('computeLegPoses stretching', () => {
  it('reaches the front paws forward and braces the hind legs back', () => {
    const standing = basePose()
    const stretching = basePose({ stretch: 1 })
    for (let i = 0; i < standing.length; i++) {
      if (standing[i].isFront) {
        expect(stretching[i].foot.x).toBeGreaterThan(standing[i].foot.x)
      } else {
        expect(stretching[i].foot.x).toBeLessThan(standing[i].foot.x)
      }
    }
  })
})

describe('computeLegPoses kneading', () => {
  it('only moves the front paws', () => {
    const standing = basePose()
    const kneading = basePose({ knead: 1, kneadPhase: 0.8 })
    for (let i = 0; i < standing.length; i++) {
      if (!standing[i].isFront) {
        expect(kneading[i]).toEqual(standing[i])
      }
    }
  })

  it('runs the near and far front paw half a cycle apart', () => {
    const legs = basePose({ knead: 1, kneadPhase: Math.PI / 2 })
    const near = legs.find((l) => l.isFront && l.isNear)!
    const far = legs.find((l) => l.isFront && !l.isNear)!
    expect(near.foot.x).not.toBeCloseTo(far.foot.x, 1)
  })
})
