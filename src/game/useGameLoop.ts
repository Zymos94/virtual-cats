import { useEffect, useRef } from 'react'
import { usePetStore } from '../store/petStore'

const MAX_DELTA_MS = 100 // ~6 frames at 60fps — generous for normal jitter, small enough to keep physics stable

// Exactly one requestAnimationFrame loop, started once (empty dependency
// array), and cleaned up on unmount. This is the one pattern that prevents
// the most common React-game bug: stacking up multiple loops on re-render.
export function useGameLoop() {
  const rafId = useRef<number | undefined>(undefined)
  const lastTime = useRef(performance.now())

  useEffect(() => {
    function frame(now: number) {
      const rawDeltaMs = now - lastTime.current
      lastTime.current = now
      // A backgrounded/minimized tab (or a slow device) can leave a huge
      // real gap between frames. Physics math (gravity, velocity*time)
      // isn't stable for arbitrarily large steps — a multi-second dt can
      // send something flying off to an absurd position in one jump. Cap
      // it so a long pause just resumes smoothly instead of lurching.
      const deltaMs = Math.min(rawDeltaMs, MAX_DELTA_MS)

      usePetStore.getState().tick(now, deltaMs)

      rafId.current = requestAnimationFrame(frame)
    }

    rafId.current = requestAnimationFrame(frame)

    return () => {
      if (rafId.current !== undefined) cancelAnimationFrame(rafId.current)
    }
  }, [])
}
