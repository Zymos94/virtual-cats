export type ActionState = 'idle' | 'walking' | 'eating' | 'sleeping' | 'playing'

export interface Needs {
  hunger: number // 0 (starving) - 100 (full)
  energy: number // 0 (exhausted) - 100 (energetic)
  hygiene: number // 0 (filthy) - 100 (clean)
  happiness: number // 0 (miserable) - 100 (delighted)
}

export interface Pet {
  id: string
  name: string
  needs: Needs
  position: { x: number; y: number }
  action: ActionState
}
