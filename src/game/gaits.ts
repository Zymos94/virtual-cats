import type { Pet } from '../types/pet'

export type GaitName = 'walk' | 'trot'

export interface GaitDef {
  name: GaitName
  // Per-leg phase offset as a fraction of the full cycle (0..1), in the
  // same order as catPose.ts's LEGS array: [farBack, nearBack, farFront,
  // nearFront].
  legPhase: [number, number, number, number]
  // Fraction of the cycle each foot spends planted on the ground. Higher
  // duty factor reads as a slower, more deliberate gait (walk); lower
  // duty factor is bouncier, feet off the ground more (trot, and
  // eventually gallop — see ANIMATION_PLAN.md Phase A2).
  dutyFactor: number
}

// Trot: the diagonal pairing the old flat-leg renderer always had (far
// back + near front together, near back + far front together) — kept as
// the purposeful middle gait for a cat actually heading toward something.
export const TROT: GaitDef = {
  name: 'trot',
  legPhase: [0, 0.5, 0.5, 0],
  dutyFactor: 0.55,
}

// Walk: a real lateral-sequence walk — each leg touches down a quarter
// cycle after the last (hind foot on a side, then the fore foot on that
// same side a beat later, then the other side repeats it half a cycle on)
// rather than trot's synchronized diagonal pairs. Higher duty factor for
// an unhurried, more feet-on-the-ground amble.
export const WALK: GaitDef = {
  name: 'walk',
  legPhase: [0, 0.5, 0.25, 0.75],
  dutyFactor: 0.65,
}

// Aimless wandering is an amble; heading toward something it actually
// wants (a toy, another cat) is a purposeful trot. Gallop (zoomies/urgent
// want) and strut (high mood) land in ANIMATION_PLAN.md Phase A2.
export function selectGait(pet: Pet): GaitDef {
  return pet.targetItemId || pet.targetPetId ? TROT : WALK
}

const TWO_PI = Math.PI * 2

// Foot offset (from the hip's rest position) for one leg at a given point
// in the stride. This is the fix for the moonwalk bug documented in
// ANIMATION_PLAN.md: a planted foot must sweep *backward* relative to the
// hip (pushing the body forward over it) and a lifted foot must swing
// *forward* to its next landing spot — the previous sinusoid-based cycle
// had that backwards. Stance sweeps foot dx linearly from +strideAmp/2 to
// -strideAmp/2 at a constant rate (so a planted foot never slides
// relative to the ground); swing arcs it back from -strideAmp/2 to
// +strideAmp/2 with a lift that peaks mid-arc and returns to 0 by
// touchdown, so there's no pop at the stance/swing boundary.
export function footOffset(
  stridePhase: number,
  legPhaseFraction: number,
  dutyFactor: number,
  strideAmp: number,
  liftAmp: number,
): { dx: number; dy: number } {
  const phase = stridePhase + legPhaseFraction * TWO_PI
  const p = (((phase % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI // normalized 0..1
  if (p < dutyFactor) {
    const t = p / dutyFactor
    return { dx: strideAmp / 2 - t * strideAmp, dy: 0 }
  }
  const t = (p - dutyFactor) / (1 - dutyFactor)
  return { dx: -strideAmp / 2 + t * strideAmp, dy: -Math.sin(t * Math.PI) * liftAmp }
}
