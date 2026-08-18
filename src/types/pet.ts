import type { Genetics } from './genetics'

export type ActionState =
  | 'idle'
  | 'walking'
  | 'eating'
  | 'sleeping'
  | 'playing'
  | 'held'
  | 'petting'
  // Parked on its haunches for a while — an idle variant cats pick
  // sometimes instead of wandering. Gets up early if something worth
  // wanting appears (same bestTarget test as idle).
  | 'sitting'
  // A burst of playful sprinting between random points. Not need-driven —
  // happy, energetic cats (kittens especially) just do this.
  | 'zoomies'
  // Mid-leap at a toy: ballistic, steered by `jump` below rather than by
  // normal walking movement. Lands into the same arrival/consumption flow
  // as walking there.
  | 'pouncing'
  // Sneaking up on a grounded toy — behaves like 'walking' (still
  // destination-seeking, same arrival handling) but rendered with a
  // crouched slink gait, the stretch right before 'pouncing'. Triggered
  // store-side in petStore.tick() rather than the FSM, since it needs the
  // item's live position — same reason 'pouncing' itself is store-side.
  | 'stalking'
export type Facing = 'left' | 'right'

// A ballistic hop from one floor point to another, advanced by movement.ts
// in sim time. Purely a ground-track interpolation — the visible arc height
// is derived from progress at render time, so the pet never actually
// leaves the floor plane as far as the simulation is concerned.
export interface JumpState {
  from: { x: number; y: number }
  to: { x: number; y: number }
  progressMs: number
  durationMs: number
}

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
  // Actual movement speed right now (px/s), eased toward the gait target
  // for the current action (amble/trot/run) by movement.ts — cats speed up
  // and slow down rather than snapping between speeds. Render-side leg
  // animation reads this to match stride to real motion.
  currentSpeed: number
  // Accumulated leg-cycle phase in radians, advanced by distance actually
  // traveled (not wall time), so legs always move exactly as fast as the
  // ground goes by regardless of gait or timeScale.
  stridePhase: number
  // In-flight hop, if any (pounce, zoomies hop) — see JumpState.
  jump: JumpState | null
  // How long the current timed action (sitting, zoomies) should last —
  // rolled when the action starts so durations vary. 0 for actions with
  // fixed durations of their own.
  actionDurationMs: number
  // Real milliseconds this cat has spent out of the suitcase, accumulated
  // in petStore.tick(). Purely a source value — life stage, size, and
  // speed are all derived from it on the fly via lifeStage.ts rather than
  // stored redundantly.
  ageMs: number
}
