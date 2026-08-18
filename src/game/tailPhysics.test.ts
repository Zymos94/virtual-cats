import { describe, expect, it } from 'vitest'
import { initialSegments, stepChain } from './tailPhysics'

const LINK_LENGTH = 6
const SEGMENT_COUNT = 6

describe('initialSegments / stepChain — static-anchor fixed point', () => {
  it('does not get stuck as a rigid straight line under a perfectly still anchor', () => {
    // A cat that spawns already sitting (or otherwise holding a mood with
    // no deliberate swing — see tailMood.ts's 'neutral') never gives the
    // anchor any horizontal motion at all. A tail seeded in an exactly
    // vertical line under that anchor must still relax into a natural
    // curl over time, not stay frozen as a straight rod forever.
    const anchor = { x: 100, y: 100 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 60; i++) segments = stepChain(segments, anchor, LINK_LENGTH)
    const anyOffAxis = segments.some((seg) => Math.abs(seg.x - anchor.x) > 0.5)
    expect(anyOffAxis).toBe(true)
  })

  it('still keeps every link at the right distance from the one in front of it', () => {
    const anchor = { x: 100, y: 100 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 60; i++) segments = stepChain(segments, anchor, LINK_LENGTH)
    let prev = anchor
    for (const seg of segments) {
      expect(Math.hypot(seg.x - prev.x, seg.y - prev.y)).toBeCloseTo(LINK_LENGTH, 5)
      prev = seg
    }
  })

  it('still starts close to directly below the anchor, not a wild swing', () => {
    const anchor = { x: 100, y: 100 }
    const segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (const seg of segments) {
      expect(Math.abs(seg.x - anchor.x)).toBeLessThan(LINK_LENGTH)
    }
  })
})

describe('stepChain — moving anchor', () => {
  it('trails behind a moving anchor rather than snapping straight to it', () => {
    const anchor = { x: 100, y: 100 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 30; i++) segments = stepChain(segments, anchor, LINK_LENGTH)
    const movedAnchor = { x: 300, y: 100 }
    const stepped = stepChain(segments, movedAnchor, LINK_LENGTH)
    // The tip (last segment) hasn't caught up to the new anchor's x in one
    // step — that lag is the whole point of a chain-follow tail.
    expect(stepped[stepped.length - 1].x).toBeLessThan(movedAnchor.x - 20)
  })
})
