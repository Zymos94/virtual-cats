import type { Pet } from '../types/pet'
import { useTailChain } from '../game/useTailChain'
import { usePetStore } from '../store/petStore'
import { deriveAppearance } from '../game/appearance'
import { mousePosition } from '../game/mousePosition'

interface PetSpriteProps {
  pet: Pet
  selected: boolean
}

const SVG_WIDTH = 80
const SVG_HEIGHT = 60
const TAIL_SEGMENTS = 6
const TAIL_LINK_LENGTH = 6

// Fixed attach point (in the SVG's own local coordinates, always drawn as
// if facing right) where the tail meets the body. Facing left/right is
// handled purely by CSS-flipping the whole SVG, so this point never needs
// to change based on facing — see the render code below.
const TAIL_ANCHOR_LOCAL = { x: 14, y: 28 }
const HEAD_PIVOT_LOCAL = { x: 44, y: 32 }

const LEG_X_POSITIONS = [14, 24, 40, 50]
// Diagonal trot pairing: legs 0&3 swing together, legs 1&2 swing opposite.
const LEG_PHASE_OFFSETS = [0, Math.PI, Math.PI, 0]
const WALK_CYCLE_MS = 300
const LEG_BOUNCE_PX = 2

const SPOT_POSITIONS = [
  { x: 24, y: 29, r: 3 },
  { x: 37, y: 38, r: 2.5 },
  { x: 30, y: 25, r: 2 },
]

const ATTENTION_RADIUS = 260
const MAX_HEAD_TILT_DEG = 14
const TAIL_RAISE_PX = 6

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// A simple first pass at mood-driven tail carriage, using only the stats
// we have today (needs + current action). 'agitated' -> a sharp flick;
// 'content' -> tail carried up; 'neutral' -> the calm resting sway/trail.
// A real attention/mood system (M14+) can replace this with richer inputs
// without changing how PetSprite consumes the result.
type TailMood = 'content' | 'neutral' | 'agitated'

function getTailMood(pet: Pet): TailMood {
  if (pet.action === 'playing') return 'agitated'
  if (pet.needs.hunger < 30 || pet.needs.happiness < 30) return 'agitated'
  if (pet.needs.happiness > 70 && pet.action !== 'walking') return 'content'
  return 'neutral'
}

export function PetSprite({ pet, selected }: PetSpriteProps) {
  const tailMood = getTailMood(pet)
  const tailAnchorLocal = {
    x: TAIL_ANCHOR_LOCAL.x,
    y: tailMood === 'content' ? TAIL_ANCHOR_LOCAL.y - TAIL_RAISE_PX : TAIL_ANCHOR_LOCAL.y,
  }
  const anchorWorld = {
    x: pet.position.x + tailAnchorLocal.x,
    y: pet.position.y + tailAnchorLocal.y,
  }
  const tailWorld = useTailChain(anchorWorld, TAIL_SEGMENTS, TAIL_LINK_LENGTH, pet.facing, pet.position.x, SVG_WIDTH)
  const tailLocal = tailWorld.map((p) => ({ x: p.x - pet.position.x, y: p.y - pet.position.y }))

  const isWalking = pet.action === 'walking'
  const isIdleLike = !isWalking
  const tailClassName = tailMood === 'agitated' ? 'tail-flick' : isIdleLike ? 'tail-idle-sway' : undefined
  const { body, stroke, eye, scale, spotted } = deriveAppearance(pet.genetics)
  const xScale = pet.facing === 'left' ? -scale : scale

  const walkPhase = isWalking ? (performance.now() % WALK_CYCLE_MS) / WALK_CYCLE_MS : 0

  // Simple v1 of "heads react to attention": tilt toward the mouse cursor
  // when it's nearby, based on vertical offset only. A real attention
  // target (nearby item/cat) replaces the cursor once that AI exists.
  let headTiltDeg = 0
  if (pet.action !== 'sleeping') {
    const catCenterWorldX = pet.position.x + SVG_WIDTH / 2
    const catCenterWorldY = pet.position.y + SVG_HEIGHT / 2
    const dy = mousePosition.y - catCenterWorldY
    const dist = Math.hypot(mousePosition.x - catCenterWorldX, dy)
    const strength = Math.max(0, 1 - dist / ATTENTION_RADIUS)
    const rawTilt = clamp((dy / 80) * MAX_HEAD_TILT_DEG, -MAX_HEAD_TILT_DEG, MAX_HEAD_TILT_DEG) * strength
    // The SVG's facing-left flip mirrors rotation sense, so pre-correct here.
    headTiltDeg = pet.facing === 'left' ? -rawTilt : rawTilt
  }

  return (
    <div
      className={selected ? 'pet-sprite selected' : 'pet-sprite'}
      style={{ left: pet.position.x, top: pet.position.y }}
      title={pet.name}
      onClick={() => usePetStore.getState().selectPet(pet.id)}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={{ transform: `scale(${xScale}, ${scale})`, transformOrigin: '50% 50%', overflow: 'visible' }}
      >
        <g
          className={tailClassName}
          style={{ transformOrigin: `${tailAnchorLocal.x}px ${tailAnchorLocal.y}px` }}
        >
          {tailLocal.map((seg, i) => (
            <circle key={i} cx={seg.x} cy={seg.y} r={4 - i * 0.4} fill={body} stroke={stroke} strokeWidth={1} />
          ))}
        </g>

        {LEG_X_POSITIONS.map((x, i) => {
          const bounce = isWalking ? Math.sin(walkPhase * Math.PI * 2 + LEG_PHASE_OFFSETS[i]) * LEG_BOUNCE_PX : 0
          return (
            <rect key={i} x={x} y={42 + bounce} width={6} height={12} rx={2} fill={body} stroke={stroke} strokeWidth={1} />
          )
        })}

        <ellipse cx={32} cy={34} rx={20} ry={13} fill={body} stroke={stroke} strokeWidth={2} />
        {spotted &&
          SPOT_POSITIONS.map((spot, i) => <circle key={i} cx={spot.x} cy={spot.y} r={spot.r} fill={stroke} opacity={0.6} />)}

        <g style={{ transform: `rotate(${headTiltDeg}deg)`, transformOrigin: `${HEAD_PIVOT_LOCAL.x}px ${HEAD_PIVOT_LOCAL.y}px` }}>
          <polygon points="42,34 50,12 66,12 74,34" fill={body} stroke={stroke} strokeWidth={2} />
          <polygon points="47,14 53,2 58,15" fill={body} stroke={stroke} strokeWidth={1.5} />
          <polygon points="60,15 65,2 70,14" fill={body} stroke={stroke} strokeWidth={1.5} />

          <circle cx={55} cy={23} r={1.8} fill={eye} />
          <circle cx={63} cy={23} r={1.8} fill={eye} />
        </g>
      </svg>
    </div>
  )
}
