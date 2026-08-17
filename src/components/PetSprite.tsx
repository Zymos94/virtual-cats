import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Pet } from '../types/pet'
import { usePetStore } from '../store/petStore'
import { deriveAppearance } from '../game/appearance'
import { mousePosition } from '../game/mousePosition'
import { getTailAnchorLocal, getTailMood } from '../game/tailMood'
import { SVG_HEIGHT, SVG_WIDTH } from '../game/spriteConstants'
import { getLifeStage, getLifeStageScale } from '../game/lifeStage'

interface PetSpriteProps {
  pet: Pet
  selected: boolean
}

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

// Below this, a still pointer-down-then-up is a click (select); above it,
// movement is a drag. Shared with the hold-to-pet gesture below: staying
// under this threshold for HOLD_TO_PET_MS is what makes it a "hold" rather
// than either a click or a drag.
const CLICK_THRESHOLD_PX = 4
const HOLD_TO_PET_MS = 300

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function PetSprite({ pet, selected }: PetSpriteProps) {
  const tailWorld = usePetStore((state) => state.tailSegments[pet.id]) ?? []
  const tailLocal = tailWorld.map((p) => ({ x: p.x - pet.position.x, y: p.y - pet.position.y }))
  const tailAnchorLocal = getTailAnchorLocal(pet)
  const tailMood = getTailMood(pet)

  const isWalking = pet.action === 'walking'
  const isIdleLike = !isWalking
  const tailClassName = tailMood === 'agitated' ? 'tail-flick' : isIdleLike ? 'tail-idle-sway' : undefined
  const { body, stroke, eye, scale: geneticScale, spotted } = deriveAppearance(pet.genetics)
  const scale = geneticScale * getLifeStageScale(getLifeStage(pet.ageMs))
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

  const isHeld = pet.action === 'held'
  const isPetting = pet.action === 'petting'

  // Pets need a three-way gesture (click to select / hold in place to pet /
  // drag to carry) instead of the generic click-or-drag useDraggable gives
  // items and the ball, so this is a bespoke pointer handler rather than a
  // shared hook. Pickup is deferred until real movement is seen — until
  // then a still-held pointer is a candidate for petting, not a drag.
  function onPointerDown(e: ReactPointerEvent) {
    e.preventDefault()
    const startPointer = { x: e.clientX, y: e.clientY }
    const start = pet.position
    const grabOffsetX = e.clientX - start.x
    const grabOffsetY = e.clientY - start.y
    let moved = false
    let petting = false

    const holdTimer = window.setTimeout(() => {
      if (moved) return
      petting = true
      usePetStore.getState().startPetting(pet.id)
    }, HOLD_TO_PET_MS)

    function onMove(ev: PointerEvent) {
      if (petting) return // holding still to pet — not a drag, don't reposition
      const dist = Math.hypot(ev.clientX - startPointer.x, ev.clientY - startPointer.y)
      if (!moved && dist > CLICK_THRESHOLD_PX) {
        moved = true
        window.clearTimeout(holdTimer)
        usePetStore.getState().startDragPet(pet.id)
      }
      if (moved) usePetStore.getState().dragPetTo(pet.id, ev.clientX - grabOffsetX, ev.clientY - grabOffsetY)
    }

    function onUp(ev: PointerEvent) {
      window.clearTimeout(holdTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      if (petting) {
        usePetStore.getState().endPetting(pet.id)
      } else if (moved) {
        const droppedOnSuitcase = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.suitcase-panel')
        if (droppedOnSuitcase) {
          usePetStore.getState().putPetInSuitcase(pet.id)
        } else {
          usePetStore.getState().endDragPet(pet.id)
        }
      } else {
        usePetStore.getState().selectPet(pet.id)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={['pet-sprite', selected && 'selected', isHeld && 'dragging', isPetting && 'petting'].filter(Boolean).join(' ')}
      style={{ left: pet.position.x, top: pet.position.y }}
      title={pet.name}
      onPointerDown={onPointerDown}
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
