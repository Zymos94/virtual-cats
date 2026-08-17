import { useEffect, useRef, useState } from 'react'

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
//
// `facing`/`petPositionX`/`spriteWidth` are only used to fix a visual bug:
// the sprite's whole SVG mirrors horizontally when facing flips, but this
// chain's positions are plain scene coordinates that know nothing about
// that mirror. Without correction, a flip leaves old segments on what is
// now visually the wrong side, and they sweep back through the body over
// several frames while easing to the new anchor. Instead, the moment facing
// flips, every existing segment gets mirrored around the sprite's own
// center — the same reflection the CSS is about to apply — so the chain's
// visual shape stays continuous instead of cutting through the cat.
export function useTailChain(
  anchor: Point,
  segmentCount: number,
  linkLength: number,
  facing: 'left' | 'right',
  petPositionX: number,
  spriteWidth: number,
): Point[] {
  const [segments, setSegments] = useState<Point[]>(() =>
    Array.from({ length: segmentCount }, (_, i) => ({ x: anchor.x, y: anchor.y + i * linkLength })),
  )
  const prevFacing = useRef(facing)

  useEffect(() => {
    setSegments((prev) => {
      let working = prev
      if (prevFacing.current !== facing) {
        working = prev.map((seg) => ({
          x: 2 * petPositionX + spriteWidth - seg.x,
          y: seg.y,
        }))
        prevFacing.current = facing
      }
      return stepChain(working, anchor, linkLength)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.x, anchor.y, facing])

  return segments
}
