import { useRef, useState } from 'react'
import type { Pet } from '../types/pet'
import { usePetStore } from '../store/petStore'
import { useDraggable } from '../game/useDraggable'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { StatBar } from './StatBar'
import { CatAvatar } from './CatAvatar'
import { ItemAvatar } from './ItemAvatar'
import { getPersonalityLabel } from '../game/personality'
import { getBreedName } from '../game/breedName'
import { getLifeStage, getLifeStageLabel } from '../game/lifeStage'

type Tab = 'stats' | 'cats' | 'items' | 'breeding'

const MAX_THROW_SPEED = 900 // px/sec — same cap as items, keeps a fast mouse jump sane

interface GamePanelProps {
  selectedPet: Pet | null
  suitcasedPets: Pet[]
  roomPets: Pet[]
}

// The stats/cats/items/breeding menu, merged into one draggable box instead
// of three separate fixed panels. It's physically draggable the same way
// items are (see useDraggable + petStore's panel* actions), just with very
// high friction so a release only slides it a token distance rather than
// throwing it — it should feel grabbable, not like a toy.
export function GamePanel({ selectedPet, suitcasedPets, roomPets }: GamePanelProps) {
  const [tab, setTab] = useState<Tab>('stats')
  const [parentAId, setParentAId] = useState('')
  const [parentBId, setParentBId] = useState('')
  const position = usePetStore((state) => state.panelPosition)

  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const velocityRef = useRef({ x: 0, y: 0 })

  const { onPointerDown } = useDraggable(() => usePetStore.getState().panelPosition, {
    onDragStart: () => {
      lastMoveRef.current = { ...usePetStore.getState().panelPosition, t: performance.now() }
      velocityRef.current = { x: 0, y: 0 }
      usePetStore.getState().startDragPanel()
    },
    onDragMove: (x, y) => {
      const now = performance.now()
      const last = lastMoveRef.current
      if (last) {
        const dt = (now - last.t) / 1000
        if (dt > 0) velocityRef.current = { x: (x - last.x) / dt, y: (y - last.y) / dt }
      }
      lastMoveRef.current = { x, y, t: now }
      usePetStore.getState().dragPanelTo(x, y)
    },
    onDragEnd: () => {
      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y)
      const thrown =
        speed > MAX_THROW_SPEED
          ? { x: (velocityRef.current.x / speed) * MAX_THROW_SPEED, y: (velocityRef.current.y / speed) * MAX_THROW_SPEED }
          : velocityRef.current
      usePetStore.getState().endDragPanel(thrown)
    },
  })

  const canBreed = parentAId !== '' && parentBId !== '' && parentAId !== parentBId

  return (
    <div className="game-panel" style={{ left: position.x, top: position.y }}>
      <div className="game-panel-handle" onPointerDown={onPointerDown} title="Drag to move">
        ⠿
      </div>

      <div className="game-panel-tabs">
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          Stats
        </button>
        <button className={tab === 'cats' ? 'active' : ''} onClick={() => setTab('cats')}>
          Cats
        </button>
        <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
          Items
        </button>
        <button className={tab === 'breeding' ? 'active' : ''} onClick={() => setTab('breeding')}>
          Breeding
        </button>
      </div>

      <div className="game-panel-content">
        {tab === 'stats' &&
          (selectedPet ? (
            <>
              <input
                className="pet-name-input"
                value={selectedPet.name}
                maxLength={20}
                onChange={(e) => usePetStore.getState().renamePet(selectedPet.id, e.target.value)}
                aria-label="Cat name"
              />
              <p className="hint breed-hint">
                {getLifeStageLabel(getLifeStage(selectedPet.ageMs))} {getBreedName(selectedPet.genetics)}
              </p>
              <StatBar label="Hunger" value={selectedPet.needs.hunger} color="#e07a3f" />
              <StatBar label="Energy" value={selectedPet.needs.energy} color="#3f8ee0" />
              <StatBar label="Hygiene" value={selectedPet.needs.hygiene} color="#3fe0a0" />
              <StatBar label="Happiness" value={selectedPet.needs.happiness} color="#e0d63f" />
              <p className="hint personality-hint">{getPersonalityLabel(selectedPet.affection)} — hold to pet</p>
            </>
          ) : (
            <p className="hint">Click a cat in the room to see its stats.</p>
          ))}

        {tab === 'cats' &&
          (suitcasedPets.length === 0 ? (
            <p className="hint">All cats are out in the room. Drag one back here to put it away.</p>
          ) : (
            <div className="cat-avatar-grid">
              {suitcasedPets.map((pet) => (
                <CatAvatar key={pet.id} pet={pet} />
              ))}
            </div>
          ))}

        {tab === 'items' && (
          <>
            <p className="hint">Drag an item into the room — a cat that wants it will come use it.</p>
            <div className="item-grid">
              {ITEM_DEFINITIONS.map((item) => (
                <ItemAvatar key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        {tab === 'breeding' && (
          <div className="breeding-controls">
            <select value={parentAId} onChange={(e) => setParentAId(e.target.value)}>
              <option value="">Parent A</option>
              {roomPets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
            </select>
            <select value={parentBId} onChange={(e) => setParentBId(e.target.value)}>
              <option value="">Parent B</option>
              {roomPets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name}
                </option>
              ))}
            </select>
            <button
              disabled={!canBreed}
              onClick={() => {
                usePetStore.getState().breedPets(parentAId, parentBId)
                setParentAId('')
                setParentBId('')
              }}
            >
              Breed
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
