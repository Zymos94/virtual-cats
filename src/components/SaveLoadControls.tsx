import { usePetStore } from '../store/petStore'

export function SaveLoadControls() {
  return (
    <div className="save-controls">
      <button onClick={() => usePetStore.getState().resetGame()}>Reset Game</button>
    </div>
  )
}
