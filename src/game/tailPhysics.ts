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

export function initialSegments(anchor: Point, segmentCount: number, linkLength: number): Point[] {
  return Array.from({ length: segmentCount }, (_, i) => ({ x: anchor.x, y: anchor.y + i * linkLength }))
}

// The sprite's whole SVG mirrors horizontally when facing flips, but these
// segment positions are plain scene coordinates that know nothing about
// that mirror. Without this, a flip leaves old segments on what is now
// visually the wrong side, sweeping back through the body over several
// frames while easing to the new anchor. Called once, the instant facing
// changes, so the chain's visual shape stays continuous through the flip.
export function mirrorSegments(segments: Point[], petPositionX: number, spriteWidth: number): Point[] {
  return segments.map((seg) => ({ x: 2 * petPositionX + spriteWidth - seg.x, y: seg.y }))
}
