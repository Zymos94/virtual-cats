import type { Pet } from '../types/pet'
import { useTailChain } from '../game/useTailChain'
import { usePetStore } from '../store/petStore'
import { deriveAppearance } from '../game/appearance'

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

const LEG_X_POSITIONS = [14, 24, 40, 50]
const SPOT_POSITIONS = [
  { x: 24, y: 29, r: 3 },
  { x: 37, y: 38, r: 2.5 },
  { x: 30, y: 25, r: 2 },
]

export function PetSprite({ pet, selected }: PetSpriteProps) {
  const anchorWorld = {
    x: pet.position.x + TAIL_ANCHOR_LOCAL.x,
    y: pet.position.y + TAIL_ANCHOR_LOCAL.y,
  }
  const tailWorld = useTailChain(anchorWorld, TAIL_SEGMENTS, TAIL_LINK_LENGTH)
  const tailLocal = tailWorld.map((p) => ({ x: p.x - pet.position.x, y: p.y - pet.position.y }))

  const isIdleLike = pet.action !== 'walking'
  const { body, stroke, eye, scale, spotted } = deriveAppearance(pet.genetics)
  const xScale = pet.facing === 'left' ? -scale : scale

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
        style={{ transform: `scale(${xScale}, ${scale})`, transformOrigin: '50% 50%' }}
      >
        <g
          className={isIdleLike ? 'tail-idle-sway' : undefined}
          style={{ transformOrigin: `${TAIL_ANCHOR_LOCAL.x}px ${TAIL_ANCHOR_LOCAL.y}px` }}
        >
          {tailLocal.map((seg, i) => (
            <circle key={i} cx={seg.x} cy={seg.y} r={4 - i * 0.4} fill={body} stroke={stroke} strokeWidth={1} />
          ))}
        </g>

        {LEG_X_POSITIONS.map((x, i) => (
          <rect key={i} x={x} y={42} width={6} height={12} rx={2} fill={body} stroke={stroke} strokeWidth={1} />
        ))}

        <ellipse cx={32} cy={34} rx={20} ry={13} fill={body} stroke={stroke} strokeWidth={2} />
        {spotted &&
          SPOT_POSITIONS.map((spot, i) => <circle key={i} cx={spot.x} cy={spot.y} r={spot.r} fill={stroke} opacity={0.6} />)}

        <polygon points="42,34 50,12 66,12 74,34" fill={body} stroke={stroke} strokeWidth={2} />
        <polygon points="47,14 53,2 58,15" fill={body} stroke={stroke} strokeWidth={1.5} />
        <polygon points="60,15 65,2 70,14" fill={body} stroke={stroke} strokeWidth={1.5} />

        <circle cx={55} cy={23} r={1.8} fill={eye} />
        <circle cx={63} cy={23} r={1.8} fill={eye} />
      </svg>
    </div>
  )
}
