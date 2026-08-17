import { useState } from 'react'
import { usePetStore } from '../store/petStore'
import { isMuted, setMuted } from '../game/sound'

export function SaveLoadControls() {
  const [muted, setMutedState] = useState(isMuted())

  return (
    <div className="save-controls">
      <button
        onClick={() => {
          const next = !muted
          setMuted(next)
          setMutedState(next)
        }}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button onClick={() => usePetStore.getState().resetGame()}>Reset Game</button>
    </div>
  )
}
