import { useRef } from 'react'
import type { PlacedItem } from '../types/item'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { useDraggable } from '../game/useDraggable'
import { usePetStore } from '../store/petStore'

interface ItemSpriteProps {
  placedItem: PlacedItem
}

const MAX_THROW_SPEED = 900 // px/sec — keeps a fast mouse jump from being absurd

export function ItemSprite({ placedItem }: ItemSpriteProps) {
  const definition = ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const velocityRef = useRef({ x: 0, y: 0 })

  // Every item is draggable/throwable now — what happens next (how far it
  // slides, whether it bounces) comes from its own physics profile, not
  // whether dragging is enabled at all.
  const { onPointerDown } = useDraggable(() => placedItem.position, {
    onDragStart: () => {
      lastMoveRef.current = { ...placedItem.position, t: performance.now() }
      velocityRef.current = { x: 0, y: 0 }
      usePetStore.getState().startDragItem(placedItem.id)
    },
    onDragMove: (x, y) => {
      const now = performance.now()
      const last = lastMoveRef.current
      if (last) {
        const dt = (now - last.t) / 1000
        if (dt > 0) velocityRef.current = { x: (x - last.x) / dt, y: (y - last.y) / dt }
      }
      lastMoveRef.current = { x, y, t: now }
      usePetStore.getState().dragItemTo(placedItem.id, x, y)
    },
    onDragEnd: () => {
      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y)
      const thrown =
        speed > MAX_THROW_SPEED
          ? {
              x: (velocityRef.current.x / speed) * MAX_THROW_SPEED,
              y: (velocityRef.current.y / speed) * MAX_THROW_SPEED,
            }
          : velocityRef.current
      usePetStore.getState().endDragItem(placedItem.id, thrown)
    },
  })

  if (!definition) return null

  const shadowScale = Math.max(0.4, 1 - placedItem.height / 120)

  return (
    <>
      <div
        className="item-shadow"
        style={{
          left: placedItem.position.x,
          top: placedItem.position.y,
          transform: `scale(${shadowScale})`,
          opacity: shadowScale * 0.35,
        }}
      />
      <div
        className="item-sprite"
        style={{ left: placedItem.position.x, top: placedItem.position.y - placedItem.height }}
        title={definition.name}
        onPointerDown={onPointerDown}
      >
        {definition.icon}
      </div>
    </>
  )
}
