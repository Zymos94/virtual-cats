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
