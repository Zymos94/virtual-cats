import { getMouseHolePosition } from '../game/roomLayout'

interface MouseHoleSpriteProps {
  sceneBounds: { width: number; height: number }
  // Ambient life independent of any cat/mouse currently in the room — see
  // petStore.tick()'s MOUSEHOLE_* peek step. Purely cosmetic: whether a
  // mouse actually spawns is decided (and already reflected in `mice`) the
  // same tick a peek starts, not tied to this flag in the renderer at all.
  peeking: boolean
}

// A fixed feature of the room, not a placeable item — always exists,
// always exactly on the wall/floor line (recomputed from live sceneBounds
// every render, so it stays correctly positioned even across a window
// resize), and isn't draggable. A drawn arch reads as "a hole cut into
// the wall" far better than a floating emoji badge would.
export function MouseHoleSprite({ sceneBounds, peeking }: MouseHoleSpriteProps) {
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
        {/* Two little eyes catching the light — pale eye-shine ovals with a
            dark pupil, low enough in the arch to read as just inside the
            opening rather than floating above it. */}
        {peeking && (
          <>
            <ellipse cx={9} cy={13} rx={1.3} ry={1.6} fill="#e8d9a0" />
            <ellipse cx={17} cy={13} rx={1.3} ry={1.6} fill="#e8d9a0" />
            <circle cx={9} cy={13.4} r={0.6} fill="#1f1a16" />
            <circle cx={17} cy={13.4} r={0.6} fill="#1f1a16" />
          </>
        )}
      </svg>
    </div>
  )
}
