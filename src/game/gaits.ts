import type { Pet } from '../types/pet'

export type GaitName = 'walk' | 'trot' | 'slink' | 'gallop' | 'strut'

export interface GaitDef {
  name: GaitName
  // Per-leg phase offset as a fraction of the full cycle (0..1), in the
  // same order as catPose.ts's LEGS array: [farBack, nearBack, farFront,
  // nearFront].
  legPhase: [number, number, number, number]
  // Fraction of the cycle each foot spends planted on the ground. Higher
  // duty factor reads as a slower, more deliberate gait (walk, slink);
  // lower duty factor is bouncier, feet off the ground more (trot,
  // gallop).
  dutyFactor: number
  // Multiply the speed-driven stride length / foot lift (see catPose.ts's
  // computeLegPoses) so a gait differs in *character*, not just timing —
  // slink covers more ground per stride at a low lift; strut lifts
  // dramatically higher; gallop does both.
  strideAmpMul: number
  liftAmpMul: number
  // Multiplies the vertical body bounce (see PetSprite's `bob`) — nearly
  // flat for slink, pronounced for gallop.
  bounceMul: number
  // Crouch (+, down) or rise (-, up) applied to the hip/body baseline —
  // slink crouches low, strut stands tall. Same sign convention as the
  // existing `bob` value it's added alongside (negative = up the screen).
  bodyHeight: number
  // Head carriage bias layered on top of the existing gaze-tracking
  // system rather than replacing it: height offset (px, same up/down
  // sign convention) and pitch (deg, same sign convention as the
  // existing sleep-droop bias — positive = nose down/forward).
  headHeight: number
  headPitchDeg: number
  // Feeds tailMood.ts's carriage — strut flags the tail up, slink drops
  // it, the rest leave carriage to the existing mood system.
  tailCarriage: 'low' | 'level' | 'high'
  // Only gallop sets this: a real airborne moment (all four feet mid-swing
  // at once, which the low duty factor already produces for free — see
  // footOffset) worth animating an extra spine stretch-and-gather for.
  suspension: boolean
}

// Trot: the diagonal pairing the old flat-leg renderer always had (far
// back + near front together, near back + far front together) — kept as
// the purposeful middle gait for a cat actually heading toward something.
export const TROT: GaitDef = {
  name: 'trot',
  legPhase: [0, 0.5, 0.5, 0],
  dutyFactor: 0.55,
  strideAmpMul: 1,
  liftAmpMul: 1,
  bounceMul: 1,
  bodyHeight: 0,
  headHeight: 0,
  headPitchDeg: 0,
  tailCarriage: 'level',
  suspension: false,
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
  strideAmpMul: 1,
  liftAmpMul: 1,
  bounceMul: 1,
  bodyHeight: 0,
  headHeight: 0,
  headPitchDeg: 0,
  tailCarriage: 'level',
  suspension: false,
}

// Slink: the same lateral-sequence footfall as walk, but crouched low
// with big reaching strides that barely lift off the ground — a cat
// stretching itself out flat and creeping forward, not stepping high.
export const SLINK: GaitDef = {
  name: 'slink',
  legPhase: [0, 0.5, 0.25, 0.75],
  dutyFactor: 0.78,
  strideAmpMul: 1.5,
  liftAmpMul: 0.3,
  bounceMul: 0.25,
  bodyHeight: 5,
  headHeight: 2,
  headPitchDeg: 7,
  tailCarriage: 'low',
  suspension: false,
}

// Gallop: a rotary gallop — hind legs land nearly together, then the
// front pair nearly together half a cycle later, with a low duty factor
// so there's real air time between each landing. Big stretched strides
// and a pronounced bounce; bodyPoseFor below layers a stretch-and-gather
// spine motion on top since `suspension` is set.
export const GALLOP: GaitDef = {
  name: 'gallop',
  legPhase: [0, 0.1, 0.5, 0.6],
  dutyFactor: 0.3,
  strideAmpMul: 1.7,
  liftAmpMul: 1.5,
  bounceMul: 1.7,
  bodyHeight: 0,
  headHeight: -1,
  headPitchDeg: 0,
  tailCarriage: 'level',
  suspension: true,
}

// Strut: a proud, high-stepping walk — same unhurried footfall as walk,
// but with a dramatic lift, a raised chest, and the chin up.
export const STRUT: GaitDef = {
  name: 'strut',
  legPhase: [0, 0.5, 0.25, 0.75],
  dutyFactor: 0.55,
  strideAmpMul: 1.1,
  liftAmpMul: 1.8,
  bounceMul: 1.15,
  bodyHeight: -4,
  headHeight: -3,
  headPitchDeg: -8,
  tailCarriage: 'high',
  suspension: false,
}

// Urgent enough that a normal trot won't do — a cat this hungry or this
// low on energy breaks into a gallop to close the distance, the same way
// zoomies does. Deliberately strict thresholds: needs decay slowly by
// design (see CLAUDE.md's cozy-not-hectic rule), so this should read as a
// rare, dramatic moment, not a routine gait.
const URGENT_HUNGER = 20
const URGENT_ENERGY = 15
const STRUT_HAPPINESS = 80

export function selectGait(pet: Pet): GaitDef {
  if (pet.action === 'stalking') return SLINK
  if (pet.action === 'zoomies') return GALLOP
  if (pet.targetItemId && (pet.needs.hunger < URGENT_HUNGER || pet.needs.energy < URGENT_ENERGY)) {
    return GALLOP
  }
  if (pet.targetItemId || pet.targetPetId) return TROT
  if (pet.action === 'walking' && pet.needs.happiness > STRUT_HAPPINESS) return STRUT
  return WALK
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

export interface BodyPose {
  heightOffset: number
  // -1..1 extra horizontal stretch/vertical gather, cycling twice per
  // stride (once per airborne suspension — a rotary gallop has two: legs
  // extended, and legs gathered underneath). 0 for every gait but gallop.
  stretch: number
  headHeightOffset: number
  headPitchDeg: number
}

// Body/head posture derived from the current gait, scaled in by moving01
// so a standing-still cat doesn't hold a gait's crouch/strut pose with no
// motion to justify it.
export function bodyPoseFor(gait: GaitDef, stridePhase: number, moving01: number): BodyPose {
  return {
    heightOffset: gait.bodyHeight * moving01,
    stretch: gait.suspension ? Math.sin(stridePhase * 2) * moving01 : 0,
    headHeightOffset: gait.headHeight * moving01,
    headPitchDeg: gait.headPitchDeg * moving01,
  }
}
