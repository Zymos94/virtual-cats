import type { JumpState } from './pet'

// sneaking: slow cautious wander, tries to stay away from any cat it
// notices. fleeing: spotted (or just pounced at, or just chucked) —
// beelines for the mouse hole if one exists, otherwise just runs. held: in
// a cat's jaws, not moving on its own — the store repositions it to the
// holding cat's mouth each tick.
export type MouseState = 'sneaking' | 'fleeing' | 'held'

export interface Mouse {
  id: string
  position: { x: number; y: number }
  destination: { x: number; y: number } | null
  state: MouseState
  facing: 'left' | 'right'
  // When the current sneak-pause/destination was set — same "pause before
  // picking a new wander point" beat idle cats get.
  actionStartedAt: number
  // Real time of the last thing that spooked it (spotted, pounced at,
  // chucked) — if enough time passes with nothing threatening it, a
  // fleeing mouse calms back down to sneaking.
  lastThreatenedAt: number
  // A cat currently stalking/pouncing at this mouse — exclusivity lock,
  // same idea as an item's claimedBy, so two cats don't beeline for one.
  claimedBy: string | null
  // A cat currently holding this mouse in its jaws.
  heldBy: string | null
  currentSpeed: number
  // Advances by distance traveled, same anti-skate principle as a cat's
  // stridePhase — drives a simple scurry wiggle, not a real gait.
  stridePhase: number
  // The ballistic hop when a cat chucks it out of its jaws. Reuses the
  // same shape as a cat's own jump — see JumpState.
  jump: JumpState | null
}
