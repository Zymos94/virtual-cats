export interface Point {
  x: number
  y: number
}

const EASE = 0.35

// Each segment eases toward the one in front of it, then gets pulled back
// to a fixed distance (linkLength) from it — like a short rope made of
// rigid links. That combination (ease + distance constraint) is what gives
// a trailing chain of circles its natural, slightly-lagging swing.
//
// This must run every real animation frame, even for a pet that isn't
// currently moving — a tail that only re-simulates when its anchor moves
// freezes mid-shape the instant a cat stops walking, which then looks
// broken once the idle-sway/flick rotation is applied on top of a frozen,
// still-stretched-out shape. So this lives in the central game loop
// (petStore.tick), not a React effect tied to position changes.
export function stepChain(prevSegments: Point[], anchor: Point, linkLength: number): Point[] {
  const next: Point[] = []
  let target = anchor

  for (const seg of prevSegments) {
    const eased = {
      x: seg.x + (target.x - seg.x) * EASE,
      y: seg.y + (target.y - seg.y) * EASE,
    }
    const dx = eased.x - target.x
    const dy = eased.y - target.y
    const dist = Math.hypot(dx, dy) || 0.0001
    const constrained = {
      x: target.x + (dx / dist) * linkLength,
      y: target.y + (dy / dist) * linkLength,
    }
    next.push(constrained)
    target = constrained
  }

  return next
}

// Two related fixed points of stepChain above, both only reachable when the
// anchor holds completely still for a while (mood 'neutral' — see
// tailMood.ts — deliberately gives the anchor zero swing, and a stationary
// cat's bob is zero too, so "sitting still" really does mean a perfectly
// static anchor tick after tick):
//
// 1. A perfectly straight line (every segment's x exactly equal to the
//    anchor's) never relaxes out of that shape: easing a segment toward a
//    target directly above/below it, then re-constraining to exactly
//    linkLength along that same vertical line, exactly reproduces the
//    segment's own starting position, forever.
// 2. A segment placed *exactly on* its own target (zero distance) stays
//    there permanently too — the direction to re-constrain along is
//    undefined at zero distance, and easing a point toward a target it's
//    already sitting on cannot move it at all, regardless of EASE.
//
// The old formula (`i * linkLength`, `x: anchor.x`) hit both at once for
// segment 0 specifically (i=0 lands exactly on the anchor) and hit #1 for
// every other segment (all sharing the anchor's x). Found live: a
// freshly-created tail (a new game, a bred kitten, a mouse's first pounce
// target) whose owner then sits and holds still never relaxed out of a
// ramrod-straight shape with its base glued to the attach point, since
// nothing ever perturbed either fixed point. `(i + 1)` gives every segment,
// including the first, a nonzero starting distance from the anchor along a
// gently curved (not collinear) path, so normal chain physics can actually
// take over from frame one — the same as any tail that's already settled
// into a natural curl.
export function initialSegments(anchor: Point, segmentCount: number, linkLength: number): Point[] {
  return Array.from({ length: segmentCount }, (_, i) => ({
    x: anchor.x + Math.sin((i + 1) * 0.6) * linkLength * 0.4,
    y: anchor.y + (i + 1) * linkLength,
  }))
}
