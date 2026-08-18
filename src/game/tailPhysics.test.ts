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

describe('stepChain — does not wind itself into a coil', () => {
  it('stays reasonably extended under hundreds of cycles of small sustained sway', () => {
    // Reproduces tailMood.ts's 'content' mood: a slow sine sway
    // (amplitude 3, period 1400ms) that runs continuously for as long as a
    // cat stays happy — hundreds of cycles over a real play session. With
    // no resistance to bending, easing toward a target then re-constraining
    // to exactly linkLength can progressively wind the chain into a tight
    // coil: every individual link stays exactly the right length (checked
    // below), but the *overall* tip-to-base reach can shrink to a third of
    // its stretched-out length or less. Found live via a multi-minute
    // free-running simulation, not a short synthetic check — a sitting cat
    // (mood 'neutral', zero swing of its own) later froze with whatever
    // coiled shape its tail had wound into while it was last content.
    const base = { x: 100, y: 100 }
    let segments = initialSegments(base, SEGMENT_COUNT, LINK_LENGTH)
    const totalTicks = 60000 // 1000 simulated seconds at 16ms/tick
    for (let i = 0; i < totalTicks; i++) {
      const t = i * 16
      const anchor = { x: base.x + Math.sin(t / 1400) * 3, y: base.y }
      segments = stepChain(segments, anchor, LINK_LENGTH)
    }
    const span = Math.hypot(
      segments[segments.length - 1].x - segments[0].x,
      segments[segments.length - 1].y - segments[0].y,
    )
    // Fully extended, 5 links apart (base is effectively the anchor) span
    // up to 5 * LINK_LENGTH = 30. Coiled, this dropped as low as ~11 before
    // the straightening bias existed.
    expect(span).toBeGreaterThan(20)
  })

  it('still keeps every link at the right distance after sustained sway', () => {
    const base = { x: 100, y: 100 }
    let segments = initialSegments(base, SEGMENT_COUNT, LINK_LENGTH)
    let anchor = base
    for (let i = 0; i < 60000; i++) {
      const t = i * 16
      anchor = { x: base.x + Math.sin(t / 1400) * 3, y: base.y }
      segments = stepChain(segments, anchor, LINK_LENGTH)
    }
    // Distances are measured against the anchor from this *last* tick, not
    // `base` — the anchor itself sways, so only the final tick's actual
    // anchor position is a valid distance-0 reference for segment 0.
    let prev = anchor
    for (const seg of segments) {
      expect(Math.hypot(seg.x - prev.x, seg.y - prev.y)).toBeCloseTo(LINK_LENGTH, 5)
      prev = seg
    }
  })
})
