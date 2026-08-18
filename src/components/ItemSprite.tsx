import { useRef } from 'react'
import type { PlacedItem } from '../types/item'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { useDraggable } from '../game/useDraggable'
import { usePetStore } from '../store/petStore'

interface ItemSpriteProps {
  placedItem: PlacedItem
}

const MAX_THROW_SPEED = 900 // px/sec — keeps a fast mouse jump from being absurd
// Swipe velocity is measured across this trailing window of pointer
// samples, not the last single pointer-move delta. One delta is ~8ms of
// motion on a fast mouse — pure jitter — and worse, it goes stale: hold
// the item still for a moment and release, and the "velocity" from before
// the pause would still be sitting there, launching a throw you never
// made. Averaging the window smooths the jitter, and an empty window
// (no movement within it) means the pointer was at rest → a drop, not a
// throw.
const SWIPE_WINDOW_MS = 100

export function ItemSprite({ placedItem }: ItemSpriteProps) {
  const definition = ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
  const samplesRef = useRef<{ x: number; y: number; t: number }[]>([])

  // Every item is draggable/throwable now — what happens next (how far it
  // slides, whether it bounces) comes from its own physics profile, not
  // whether dragging is enabled at all.
  const { onPointerDown } = useDraggable(() => placedItem.position, {
    onDragStart: () => {
      samplesRef.current = [{ ...placedItem.position, t: performance.now() }]
      usePetStore.getState().startDragItem(placedItem.id)
    },
    onDragMove: (x, y) => {
      const now = performance.now()
      const samples = samplesRef.current
      samples.push({ x, y, t: now })
      while (samples.length > 1 && samples[0].t < now - SWIPE_WINDOW_MS) samples.shift()
      usePetStore.getState().dragItemTo(placedItem.id, x, y)
    },
    onDragEnd: () => {
      const now = performance.now()
      const samples = samplesRef.current.filter((s) => s.t >= now - SWIPE_WINDOW_MS)
      let velocity = { x: 0, y: 0 }
      const first = samples[0]
      const last = samples[samples.length - 1]
      if (samples.length > 1 && last.t > first.t) {
        const dt = (last.t - first.t) / 1000
        velocity = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
      }
      const speed = Math.hypot(velocity.x, velocity.y)
      const thrown =
        speed > MAX_THROW_SPEED
          ? {
              x: (velocity.x / speed) * MAX_THROW_SPEED,
              y: (velocity.y / speed) * MAX_THROW_SPEED,
            }
          : velocity
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
