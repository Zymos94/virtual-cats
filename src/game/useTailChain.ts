import { useEffect, useState } from 'react'

interface Point {
  x: number
  y: number
}

const EASE = 0.35

// Each segment eases toward the one in front of it, then gets pulled back
// to a fixed distance (linkLength) from it — like a short rope made of
// rigid links. That combination (ease + distance constraint) is what gives
// a trailing chain of circles its natural, slightly-lagging swing.
function stepChain(prevSegments: Point[], anchor: Point, linkLength: number): Point[] {
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

// Tracks a chain of `segmentCount` points trailing behind a moving anchor
// point, in the same coordinate space as the anchor. Re-simulates one step
// every time the anchor moves (i.e. every render caused by a position
// update from the game loop) — no separate animation loop needed.
export function useTailChain(anchor: Point, segmentCount: number, linkLength: number): Point[] {
  const [segments, setSegments] = useState<Point[]>(() =>
    Array.from({ length: segmentCount }, (_, i) => ({ x: anchor.x, y: anchor.y + i * linkLength })),
  )

  useEffect(() => {
    setSegments((prev) => stepChain(prev, anchor, linkLength))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.x, anchor.y])

  return segments
}
