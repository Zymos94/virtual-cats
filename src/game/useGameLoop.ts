import { useEffect, useRef } from 'react'
import { usePetStore } from '../store/petStore'

// Exactly one requestAnimationFrame loop, started once (empty dependency
// array), and cleaned up on unmount. This is the one pattern that prevents
// the most common React-game bug: stacking up multiple loops on re-render.
export function useGameLoop() {
  const rafId = useRef<number | undefined>(undefined)
  const lastTime = useRef(performance.now())

  useEffect(() => {
    function frame(now: number) {
      const deltaMs = now - lastTime.current
      lastTime.current = now

      usePetStore.getState().tick(now, deltaMs)

      rafId.current = requestAnimationFrame(frame)
    }

    rafId.current = requestAnimationFrame(frame)

    return () => {
      if (rafId.current !== undefined) cancelAnimationFrame(rafId.current)
    }
  }, [])
}
