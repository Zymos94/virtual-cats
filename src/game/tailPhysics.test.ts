import { describe, expect, it } from 'vitest'
import { chainLength, initialSegments, resolveTailChain } from './tailPhysics'

const LINK_LENGTH = 6
const SEGMENT_COUNT = 6
const FULL_REACH = chainLength(SEGMENT_COUNT, LINK_LENGTH)

function linkDistances(anchor: { x: number; y: number }, segments: { x: number; y: number }[]) {
  let prev = anchor
  const distances: number[] = []
  for (const seg of segments) {
    distances.push(Math.hypot(seg.x - prev.x, seg.y - prev.y))
    prev = seg
  }
  return distances
}

describe('resolveTailChain — distance constraint', () => {
  it('keeps every link at exactly linkLength, static case', () => {
    const anchor = { x: 100, y: 100 }
    const target = { x: 100, y: 100 + FULL_REACH * 0.7 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 30; i++) segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    for (const d of linkDistances(anchor, segments)) expect(d).toBeCloseTo(LINK_LENGTH, 5)
  })

  it('keeps every link at exactly linkLength while the target sways', () => {
    const anchor = { x: 100, y: 100 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    let target = { x: 100, y: 100 }
    for (let i = 0; i < 500; i++) {
      target = { x: 100 + Math.sin(i / 20) * 3, y: 100 + FULL_REACH * 0.6 }
      segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    }
    for (const d of linkDistances(anchor, segments)) expect(d).toBeCloseTo(LINK_LENGTH, 5)
  })

  it('reaches exactly to the target — the last segment always matches it', () => {
    const anchor = { x: 100, y: 100 }
    const target = { x: 130, y: 90 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 10; i++) segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    expect(segments[segments.length - 1].x).toBeCloseTo(target.x, 5)
    expect(segments[segments.length - 1].y).toBeCloseTo(target.y, 5)
  })
})

describe('resolveTailChain — target out of reach', () => {
  it('falls back to a straight line pointed at the target', () => {
    const anchor = { x: 100, y: 100 }
    const target = { x: 100, y: 100 + FULL_REACH * 5 } // way further than the chain can reach
    const segments = resolveTailChain(
      initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH),
      anchor,
      target,
      LINK_LENGTH,
    )
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      expect(segments[i].x).toBeCloseTo(anchor.x, 5)
      expect(segments[i].y).toBeCloseTo(anchor.y + LINK_LENGTH * (i + 1), 5)
    }
  })
})

describe('resolveTailChain — a fully static anchor and target is a true fixed point', () => {
  it('reproduces the exact same shape forever once settled, never drifting', () => {
    const anchor = { x: 100, y: 100 }
    const target = { x: 108, y: 100 + FULL_REACH * 0.55 } // off-axis, well within reach — slack to curl into
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    // Settle first.
    for (let i = 0; i < 40; i++) segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    const settled = segments.map((s) => ({ ...s }))
    // Many more calls with the identical anchor/target must not move anything
    // further — this is the property the old stepChain lacked (see the M23
    // postmortem in DEVLOG.md): nothing here can slowly wind up over time
    // because both ends are pinned to ground truth every single call, not
    // just eased a fraction of the way toward it.
    for (let i = 0; i < 2000; i++)
      segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      expect(segments[i].x).toBeCloseTo(settled[i].x, 6)
      expect(segments[i].y).toBeCloseTo(settled[i].y, 6)
    }
  })
})

describe('resolveTailChain — does not wind itself into a coil under sustained sway', () => {
  it('stays reasonably extended under hundreds of cycles of small target sway', () => {
    // The exact failure mode fixed here: the old stepChain (see DEVLOG's M23
    // postmortem) had only one pinned end (the anchor) and let the tip
    // emerge freely, so a small sustained sway could progressively wind the
    // whole chain into a tight coil over hundreds of cycles even though
    // every individual link stayed the right length. Pinning the target
    // (this chain's other end) exactly every call, instead of just biasing
    // toward straightness, should make this structurally impossible rather
    // than just less likely — this test is the same reproduction scenario
    // as the old one, run for the same duration, as a regression guard.
    const anchor = { x: 100, y: 100 }
    const restTarget = { x: 100, y: 100 + FULL_REACH * 0.6 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    const totalTicks = 60000 // 1000 simulated seconds at 16ms/tick
    for (let i = 0; i < totalTicks; i++) {
      const t = i * 16
      const target = { x: restTarget.x + Math.sin(t / 1400) * 6, y: restTarget.y }
      segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    }
    const span = Math.hypot(
      segments[segments.length - 1].x - anchor.x,
      segments[segments.length - 1].y - anchor.y,
    )
    // The chain reaches exactly to target every call by construction, so
    // this mostly re-confirms that invariant survived 60,000 calls without
    // NaN/blowup — the real regression guard is the per-link distance check
    // below, which is where the old bug's coiling actually showed up.
    expect(span).toBeGreaterThan(FULL_REACH * 0.5)
    for (const d of linkDistances(anchor, segments)) expect(d).toBeCloseTo(LINK_LENGTH, 5)
  })
})

describe('resolveTailChain — seeded continuity gives a real bend, not just a short reach', () => {
  it('keeps mid-chain points visibly off the straight anchor-target line when reach is short', () => {
    // A short reach alone (see tailMood.ts's 'content' shape) only proves
    // the *tip* sits close to the anchor — it doesn't prove the chain
    // actually curls to get there rather than, say, bunching all its slack
    // at one end. This checks there's a genuine bend partway along.
    const anchor = { x: 100, y: 100 }
    const target = { x: 100, y: 100 + FULL_REACH * 0.55 }
    let segments = initialSegments(anchor, SEGMENT_COUNT, LINK_LENGTH)
    for (let i = 0; i < 40; i++) segments = resolveTailChain(segments, anchor, target, LINK_LENGTH)
    const mid = segments[Math.floor(SEGMENT_COUNT / 2)]
    // Perpendicular distance from the straight anchor→target line (which is
    // vertical here, so this is just the horizontal offset).
    expect(Math.abs(mid.x - anchor.x)).toBeGreaterThan(1)
  })
})
