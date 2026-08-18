import { useState } from 'react'
import { usePetStore } from '../store/petStore'
import { isMuted, setMuted } from '../game/sound'

// Sims-style speed steps — 1x is the normal cozy pace; the higher steps
// are mainly for skipping ahead during testing (watching a kitten grow up,
// needs actually drop, etc.) without a real wall-clock wait.
const SPEED_STEPS: { label: string; value: number }[] = [
  { label: '⏸', value: 0 },
  { label: '1x', value: 1 },
  { label: '4x', value: 4 },
  { label: '16x', value: 16 },
]

export function SaveLoadControls() {
  const [muted, setMutedState] = useState(isMuted())
  const timeScale = usePetStore((state) => state.timeScale)

  return (
    <div className="save-controls">
      <div className="speed-controls">
        {SPEED_STEPS.map((step) => (
          <button
            key={step.value}
            className={timeScale === step.value ? 'active' : ''}
            onClick={() => usePetStore.getState().setTimeScale(step.value)}
            aria-label={`Speed ${step.label}`}
            title={`Speed ${step.label}`}
          >
            {step.label}
          </button>
        ))}
      </div>
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
