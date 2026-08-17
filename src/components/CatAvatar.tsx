import { useState } from 'react'
import type { Pet } from '../types/pet'
import { usePetStore } from '../store/petStore'
import { deriveAppearance } from '../game/appearance'

interface CatAvatarProps {
  pet: Pet
}

// A small draggable icon representing a cat that's currently "put away".
// Not built on useDraggable — that hook assumes the draggable thing already
// has a position in scene coordinates, but this avatar lives inside a fixed
// UI panel and only gains a scene position once it's dropped into the room.
export function CatAvatar({ pet }: CatAvatarProps) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const { body, stroke } = deriveAppearance(pet.genetics)

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    setDragPos({ x: e.clientX, y: e.clientY })

    function onMove(ev: PointerEvent) {
      setDragPos({ x: ev.clientX, y: ev.clientY })
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragPos(null)

      const droppedOnSuitcase = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.suitcase-panel')
      if (!droppedOnSuitcase) {
        usePetStore.getState().takePetFromSuitcase(pet.id, { x: ev.clientX - 40, y: ev.clientY - 30 })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <>
      <button className="cat-avatar" onPointerDown={onPointerDown} title={`Drag ${pet.name} into the room`}>
        <span className="cat-avatar-dot" style={{ background: body, borderColor: stroke }} />
        <span className="cat-avatar-name">{pet.name}</span>
      </button>
      {dragPos && (
        <div
          className="cat-avatar-ghost"
          style={{ left: dragPos.x - 16, top: dragPos.y - 16, background: body, borderColor: stroke }}
        />
      )}
    </>
  )
}
