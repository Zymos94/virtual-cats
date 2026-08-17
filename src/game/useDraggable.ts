import type { PointerEvent as ReactPointerEvent } from 'react'

interface DragHandlers {
  onDragStart?: () => void
  onDragMove: (x: number, y: number) => void
  onDragEnd?: () => void
  // Fires instead of a drag when the pointer barely moved before release —
  // lets the same element support both "click to select" and "drag to move".
  onClick?: () => void
}

const CLICK_THRESHOLD_PX = 4

// Generic pick-up/move/drop mechanism: reusable for anything that should be
// draggable (cats, items, the ball). Window-level listeners during the drag
// keep tracking the pointer even if it moves faster than the element or
// leaves its bounds — the standard pattern for drag interactions.
export function useDraggable(getCurrentPosition: () => { x: number; y: number }, handlers: DragHandlers) {
  function onPointerDown(e: ReactPointerEvent) {
    e.preventDefault()
    const startPointer = { x: e.clientX, y: e.clientY }
    const start = getCurrentPosition()
    const grabOffsetX = e.clientX - start.x
    const grabOffsetY = e.clientY - start.y
    let moved = false

    handlers.onDragStart?.()

    function onMove(ev: PointerEvent) {
      const dist = Math.hypot(ev.clientX - startPointer.x, ev.clientY - startPointer.y)
      if (dist > CLICK_THRESHOLD_PX) moved = true
      handlers.onDragMove(ev.clientX - grabOffsetX, ev.clientY - grabOffsetY)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      handlers.onDragEnd?.()
      if (!moved) handlers.onClick?.()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { onPointerDown }
}
