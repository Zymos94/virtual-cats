import type { Genetics } from './genetics'

export type ActionState = 'idle' | 'walking' | 'eating' | 'sleeping' | 'playing' | 'held' | 'petting'
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
  genetics: Genetics
  parentIds: [string, string] | null
  // Cats "put away" in the suitcase don't render in the room and don't
  // tick (no decay, no AI, no tail physics) — matches a real Petz carrier
  // pausing a pet while it's stored.
  inSuitcase: boolean
  // Set while walking toward a dropped item it wants to use — cleared on
  // arrival (consumption) or on interruption (picked up, put away).
  targetItemId: string | null
  // How far this cat notices things (items or other cats) worth reacting
  // to. A personal trait, not a fixed global constant, so cats can differ.
  attentionSpan: number
  // Set while walking toward another cat to play, and again (pointing at
  // each other) for the duration of mutual 'playing' once they meet.
  targetPetId: string | null
  // Set on a cat that another cat is currently approaching for play — a
  // simple exclusivity lock (like an item's claimedBy) so a lonely cat
  // doesn't get beelined-at by two others at once. Also makes the claimed
  // cat wait in place rather than wander off mid-approach.
  socialClaimedBy: string | null
  // A fixed personality trait (0-100) — how much this cat enjoys being
  // petted by hand. Higher means faster happiness gain per second while
  // held in the 'petting' action. Like attentionSpan, not part of the
  // formal genetics system, just a per-cat trait kittens roughly inherit.
  affection: number
  // Real milliseconds this cat has spent out of the suitcase, accumulated
  // in petStore.tick(). Purely a source value — life stage, size, and
  // speed are all derived from it on the fly via lifeStage.ts rather than
  // stored redundantly.
  ageMs: number
}
