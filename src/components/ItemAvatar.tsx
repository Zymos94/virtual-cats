import { useState } from 'react'
import type { ItemDefinition } from '../types/item'
import { usePetStore } from '../store/petStore'

interface ItemAvatarProps {
  item: ItemDefinition
}

// Same bespoke drag pattern as CatAvatar — this button lives in a fixed UI
// panel, not scene coordinates, so it doesn't fit useDraggable's model of
// "something that already has a position in the space it'll be dropped
// into."
export function ItemAvatar({ item }: ItemAvatarProps) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

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

      const droppedOnSuitcase = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.game-panel')
      if (!droppedOnSuitcase) {
        usePetStore.getState().placeItem(item.id, { x: ev.clientX - 16, y: ev.clientY - 16 })
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <>
      <button className="item-button" onPointerDown={onPointerDown} title={`Drag ${item.name} into the room`}>
        <span className="item-icon">{item.icon}</span>
        <span className="item-name">{item.name}</span>
      </button>
      {dragPos && (
        <div className="item-ghost" style={{ left: dragPos.x - 16, top: dragPos.y - 16 }}>
          {item.icon}
        </div>
      )}
    </>
  )
}
