import type { JumpState } from './pet'

// sneaking: slow cautious wander, tries to stay away from any cat it
// notices — mostly beneath cats' notice generally (see attention.ts's
// mouseUrgency), only really at risk from one that's close or actively
// stalking. fleeing: spotted (or just pounced at, or just chucked) — fast
// and, being visibly on the run, a magnet for *every* nearby cat's chase
// instinct, not just whichever one spooked it (the double-edged sword:
// escaping one cat's notice by bolting risks pulling in the whole room).
// Normally just runs away from whatever scared it; only beelines for the
// mouse hole once its livesRemaining hits 0. held: in a cat's jaws, not
// moving on its own — the store repositions it to the holding cat's mouth
// each tick.
export type MouseState = 'sneaking' | 'fleeing' | 'held'

export interface Mouse {
  id: string
  position: { x: number; y: number }
  destination: { x: number; y: number } | null
  state: MouseState
  facing: 'left' | 'right'
  // How many more scares this mouse can shrug off before it gives up on
  // just running away and makes a beeline for the mouse hole instead —
  // rolled once at spawn (2-7). Decremented only on a *fresh* scare (the
  // transition into 'fleeing' from something else), not every tick spent
  // already fleeing, so a single drawn-out chase is one scare, not many.
  livesRemaining: number
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
