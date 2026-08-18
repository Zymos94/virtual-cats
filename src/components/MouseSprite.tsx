import type { Mouse } from '../types/mouse'

// Deliberately tiny and simple — a background creature, not a second cat:
// one grey oval body, a thin curved tail, two small circle feet, a pink
// button nose, two dot eyes. No jointed legs — the "scurry" is a squash/
// wiggle on the whole body, not a gait.
const SVG_WIDTH = 22
const SVG_HEIGHT = 16

// Speed at which the wiggle reaches full amplitude — matches
// MOUSE_FLEE_SPEED in mouseMovement.ts (not imported directly, to keep
// this component decoupled from the exact tuning constant).
const FULL_WIGGLE_SPEED = 145

export function MouseSprite({ mouse }: { mouse: Mouse }) {
  const facingLeft = mouse.facing === 'left'
  const speed01 = Math.min(1, mouse.currentSpeed / FULL_WIGGLE_SPEED)
  // A slow idle wiggle even at a standstill (0.4 baseline), livelier the
  // faster it's actually moving.
  const wiggle = Math.sin(mouse.stridePhase) * (0.4 + 1.6 * speed01)
  const bob = -Math.abs(Math.sin(mouse.stridePhase)) * (0.3 + 0.9 * speed01)
  const heldTiltDeg = mouse.state === 'held' ? 14 : 0

  return (
    <div
      className="mouse-sprite"
      style={{ left: mouse.position.x, top: mouse.position.y }}
      title="Mouse"
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={{ transform: `scale(${facingLeft ? -1 : 1}, 1)`, overflow: 'visible' }}
      >
        {/* Tail — a thin curve trailing behind, wiggling opposite the body. */}
        <path
          d={`M 3 8 Q -3 ${8 - wiggle * 1.5} -8 ${6 - wiggle * 2}`}
          fill="none"
          stroke="#8a8078"
          strokeWidth={1.1}
          strokeLinecap="round"
        />

        <g
          style={{
            transform: `translateY(${bob}px) rotate(${wiggle * 3 + heldTiltDeg}deg)`,
            transformOrigin: '11px 8px',
          }}
        >
          {/* Small circle feet, just peeking out from under the body — no
              joints, no gait, purely decorative. */}
          <circle cx={7} cy={12.2} r={1.5} fill="#8a8078" />
          <circle cx={15} cy={12.2} r={1.5} fill="#8a8078" />

          <ellipse
            cx={11}
            cy={8}
            rx={9.5}
            ry={5.5}
            fill="#aca297"
            stroke="#7d746b"
            strokeWidth={1}
          />

          {/* Pink button nose at the front tip. */}
          <circle cx={20} cy={8} r={1.5} fill="#e79aa8" stroke="#c97b8a" strokeWidth={0.5} />

          {/* Dot eyes. */}
          <circle cx={15.5} cy={5.8} r={0.9} fill="#2b2620" />
          <circle cx={12.5} cy={5.2} r={0.9} fill="#2b2620" />
        </g>
      </svg>
    </div>
  )
}
