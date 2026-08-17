export type ActionState = 'idle' | 'walking' | 'eating' | 'sleeping' | 'playing'
export type Facing = 'left' | 'right'

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
  destination: { x: number; y: number } | null
  action: ActionState
  facing: Facing
  actionStartedAt: number
  // Fixed per-pet coloring for now. Replaced by genetics-derived phenotype
  // colors in M5, once breeding exists.
  color: { body: string; stroke: string }
}
