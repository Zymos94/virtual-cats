import { useEffect } from 'react'
import { usePetStore } from '../store/petStore'

// Keeps sceneBounds in the store matching the actual browser window size,
// so wandering cats always roam the full visible room, even after resize.
export function useSceneBounds() {
  useEffect(() => {
    function updateBounds() {
      usePetStore.getState().setSceneBounds({ width: window.innerWidth, height: window.innerHeight })
    }

    updateBounds()
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [])
}
