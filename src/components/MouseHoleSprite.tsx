import { getMouseHolePosition } from '../game/roomLayout'

interface MouseHoleSpriteProps {
  sceneBounds: { width: number; height: number }
}

// A fixed feature of the room, not a placeable item — always exists,
// always exactly on the wall/floor line (recomputed from live sceneBounds
// every render, so it stays correctly positioned even across a window
// resize), and isn't draggable. A drawn arch reads as "a hole cut into
// the wall" far better than a floating emoji badge would.
export function MouseHoleSprite({ sceneBounds }: MouseHoleSpriteProps) {
  const position = getMouseHolePosition(sceneBounds)

  return (
    <div
      className="mousehole-sprite"
      style={{ left: position.x, top: position.y }}
      title="Mouse Hole"
    >
      <svg width={26} height={18} viewBox="0 0 26 18" overflow="visible">
        {/* Flat edge sits exactly at the bottom of the viewBox (y=18) so
            the CSS translate(-100%) lands it exactly on the floor line —
            tall/elongated upward (ry=18) rather than a squat dome. */}
        <path
          d="M 1 18 A 12 18 0 0 1 25 18 Z"
          fill="#1f1a16"
          stroke="#5c3a1e"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
