// Procedural pose math for the shape-built cat: two-bone jointed legs
// (hip → knee → foot, solved by IK each frame) plus the blend weights for
// sitting, lying, held, and mid-hop poses. Pure geometry — PetSprite feeds
// it the pet's live motion values and draws whatever comes back.

import { footOffset, type GaitDef } from './gaits'

export interface Point {
  x: number
  y: number
}

// Local sprite coordinates (80x60 viewBox, drawn facing right).
export const GROUND_Y = 54

interface LegSpec {
  hip: Point
  // Where this foot stands relative to its hip when at rest — a slight
  // spread so the stance doesn't look like all four feet on one point.
  restOffset: number
  phaseOffset: number
  upper: number
  lower: number
  isFront: boolean
  // Near legs (the pair on the viewer's side) draw over the body in full
  // body color; far legs draw behind it, slightly darkened.
  isNear: boolean
}

// Diagonal trot pairing preserved from the old flat legs: far-back pairs
// with near-front (phase 0), near-back with far-front (phase π).
// Hind legs get more bone than the hip→ground distance so the hock
// visibly bends; front legs are nearly straight, like the real animal.
const LEGS: LegSpec[] = [
  {
    hip: { x: 17, y: 41 },
    restOffset: -2,
    phaseOffset: 0,
    upper: 8.5,
    lower: 9,
    isFront: false,
    isNear: false,
  },
  {
    hip: { x: 27, y: 41 },
    restOffset: 2,
    phaseOffset: Math.PI,
    upper: 8.5,
    lower: 9,
    isFront: false,
    isNear: true,
  },
  {
    hip: { x: 43, y: 41 },
    restOffset: -2,
    phaseOffset: Math.PI,
    upper: 7,
    lower: 7,
    isFront: true,
    isNear: false,
  },
  {
    hip: { x: 53, y: 41 },
    restOffset: 2,
    phaseOffset: 0,
    upper: 7,
    lower: 7,
    isFront: true,
    isNear: true,
  },
]

export interface LegPose {
  hip: Point
  knee: Point
  foot: Point
  isFront: boolean
  isNear: boolean
  opacity: number
}

// Two-bone IK: places the knee for a given hip and foot. The perpendicular
// offset is taken toward -x (the tail side, as drawn facing right) — a
// cat's visible joints, the front elbow and the hind hock, both point
// backward.
export function solveKnee(hip: Point, foot: Point, upper: number, lower: number): Point {
  const dx = foot.x - hip.x
  const dy = foot.y - hip.y
  let d = Math.hypot(dx, dy)
  d = Math.max(Math.abs(upper - lower) + 0.1, Math.min(d, upper + lower - 0.05))
  const a = (upper * upper - lower * lower + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, upper * upper - a * a))
  const midX = hip.x + (a * dx) / d
  const midY = hip.y + (a * dy) / d
  return { x: midX - (h * dy) / d, y: midY + (h * dx) / d }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export interface PoseInput {
  stridePhase: number
  // Which gait's footfall timing (leg phase offsets + duty factor) to use
  // — see gaits.ts. Determines *when* each foot lifts and plants; speed01
  // below scales *how far and how high*.
  gait: GaitDef
  // Actual speed normalized against the top (run) speed, 0..1 — scales
  // stride length and foot lift so a run reaches further than an amble.
  speed01: number
  // How much the walk cycle applies at all vs. standing feet, 0..1 —
  // separates "barely moving" (feet mostly planted) from gait intensity.
  moving01: number
  sit: number // 0..1 seated
  lie: number // 0..1 lying asleep
  hop: number // 0..1 airborne arc of a jump
  // Vertical body bounce from the gait, applied to hips so planted feet
  // absorb it through the knees rather than sliding.
  bob: number
  // Held/scruff-dangle blend, 0..1 — see the block below. Overrides the
  // gait cycle entirely rather than blending with it, since a cat isn't
  // simultaneously walking and being carried.
  hold: number
  // Time-based pendulum phase for the dangle's idle swing (cosmetic,
  // computed in PetSprite so it can desync per cat — see petHash there).
  holdSwingPhase: number
  // 0..1(+) eased magnitude of the dangle swing, driven by how fast the
  // cat is currently being carried (PetSprite tracks drag velocity; this
  // module stays pure and just receives the already-eased result).
  holdSwingAmount: number
  // Idle animations (see behaviorFSM.ts's 'grooming'/'stretching'/
  // 'kneading'). Only the leg-relevant parts live here — head tilt and
  // the stretch body silhouette are PetSprite's job, same split as the
  // rest of this pose layer.
  groom: number // 0..1
  // 'pawWash' lifts the near-front paw to the face; 'lick' leaves every
  // leg alone (just standing/seated) since the cat's reaching down at its
  // own side, not up at its head.
  groomVariant: 'lick' | 'pawWash'
  groomPhase: number // radians, time-based
  stretch: number // 0..1 — front-down, rump-back brace
  knead: number // 0..1
  kneadPhase: number // radians, time-based
}

export function computeLegPoses(input: PoseInput): LegPose[] {
  const strideAmp = (3 + 5 * input.speed01) * input.gait.strideAmpMul
  const liftAmp = (2.5 + 3.5 * input.speed01) * input.gait.liftAmpMul

  return LEGS.map((leg, i) => {
    const hip = { x: leg.hip.x, y: leg.hip.y + input.bob }
    const restX = hip.x + leg.restOffset

    const { dx, dy } = footOffset(
      input.stridePhase,
      input.gait.legPhase[i],
      input.gait.dutyFactor,
      strideAmp,
      liftAmp,
    )
    let foot = {
      x: lerp(restX, restX + dx, input.moving01),
      y: lerp(GROUND_Y, GROUND_Y + dy, input.moving01),
    }

    // Mid-hop: legs leave the cycle and stretch into the leap — front
    // paws reaching, hind legs trailing.
    if (input.hop > 0) {
      const reach = leg.isFront
        ? { x: hip.x + 6, y: GROUND_Y - 5 }
        : { x: hip.x - 6, y: GROUND_Y - 2 }
      foot = { x: lerp(foot.x, reach.x, input.hop), y: lerp(foot.y, reach.y, input.hop) }
    }

    // Sitting tucks the hind feet forward under the haunch (and the legs
    // themselves fade behind the haunch shape); front legs stay planted,
    // straight under the raised chest.
    let opacity = 1 - input.lie
    if (!leg.isFront && input.sit > 0) {
      foot = { x: lerp(foot.x, hip.x + 4, input.sit), y: lerp(foot.y, GROUND_Y, input.sit) }
      opacity *= 1 - input.sit * 0.85
    }

    // Held by the scruff: legs go loose and hang from the hip instead of
    // cycling — shorter than a standing leg's full reach to the ground
    // (leg.upper + leg.lower would overshoot it), reading as relaxed and
    // unweighted rather than tiptoeing on the floor — swinging gently on a
    // lag behind however fast the cat is being carried right now. Hind
    // legs swing a touch looser than front, and each leg's phaseOffset
    // gives a slight stagger so all four don't swing in lockstep like a
    // single rigid rod.
    if (input.hold > 0) {
      const legLooseness = leg.isFront ? 0.85 : 1.15
      const swing =
        Math.sin(input.holdSwingPhase + leg.phaseOffset * 0.2) *
        (2.5 + 5 * input.holdSwingAmount) *
        legLooseness
      const dangle = { x: hip.x + swing, y: hip.y + (leg.isFront ? 8 : 10) }
      foot = { x: lerp(foot.x, dangle.x, input.hold), y: lerp(foot.y, dangle.y, input.hold) }
    }

    // Grooming: a paw-wash lifts just the near-front paw in slow passes
    // up toward the face (Math.max(0, sin(...)) holds it at rest for half
    // the cycle, then arcs it up and back down for the other half — one
    // wipe per cycle, not a symmetric back-and-forth). A flank-lick
    // doesn't move any leg — the cat's reaching down at its own side, not
    // up at its head — so it's handled entirely in PetSprite's head tilt.
    if (input.groom > 0 && input.groomVariant === 'pawWash' && leg.isFront && leg.isNear) {
      const wash = Math.max(0, Math.sin(input.groomPhase))
      const target = { x: hip.x + 9 - wash * 4, y: hip.y - 6 - wash * 16 }
      foot = { x: lerp(foot.x, target.x, input.groom), y: lerp(foot.y, target.y, input.groom) }
    }

    // Stretching: front paws reach far forward and low, hind legs brace
    // back — together with the purpose-built stretch silhouette in
    // PetSprite, reads as the classic front-down, rump-up stretch.
    if (input.stretch > 0) {
      const target = leg.isFront ? { x: hip.x + 15, y: GROUND_Y } : { x: hip.x - 5, y: GROUND_Y }
      foot = { x: lerp(foot.x, target.x, input.stretch), y: lerp(foot.y, target.y, input.stretch) }
    }

    // Kneading: front paws alternate pressing forward-and-down then
    // pulling back-and-up, the classic slow dough-kneading rhythm — the
    // near and far paw run half a cycle apart. Hind legs stay put (seated
    // — PetSprite eases `sit` in alongside this).
    if (input.knead > 0 && leg.isFront) {
      const phase = input.kneadPhase + (leg.isNear ? Math.PI : 0)
      const push = Math.sin(phase)
      const target = { x: hip.x + 3 + push * 3, y: GROUND_Y - Math.max(0, -push) * 3 }
      foot = { x: lerp(foot.x, target.x, input.knead), y: lerp(foot.y, target.y, input.knead) }
    }

    return {
      hip,
      knee: solveKnee(hip, foot, leg.upper, leg.lower),
      foot,
      isFront: leg.isFront,
      isNear: leg.isNear,
      opacity,
    }
  })
}
