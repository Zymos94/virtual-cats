import type { Pet } from '../types/pet'
import { selectGait } from './gaits'
import { SVG_WIDTH } from './spriteConstants'
import { RUN_SPEED } from './movement'

// A simple first pass at mood-driven tail carriage, using only the stats
// we have today (needs + current action). 'agitated' -> a sharp flick;
// 'social' -> a friendly swish while playing with another cat; 'content'
// -> tail carried up with a slow, lazy sway; 'neutral' -> still, just
// trailing the body via the chain physics with no deliberate motion.
export type TailMood = 'content' | 'neutral' | 'agitated' | 'social'

export function getTailMood(pet: Pet): TailMood {
  // Held by the scruff: no deliberate swing, just gravity and drag lag —
  // takes priority over the needs-based checks below so a hungry cat
  // being carried doesn't flick its tail mid-air.
  if (pet.action === 'held') return 'neutral'
  if (pet.action === 'petting') return 'content'
  // A proud catch — held high, like a happy cat showing off.
  if (pet.action === 'holdingMouse') return 'content'
  if (pet.action === 'playing' && pet.targetPetId) return 'social'
  if (pet.action === 'playing') return 'agitated'
  // Zoomies and pouncing are pure play — the same lively swish as playing
  // with a friend, not the annoyed flick 'agitated' drives.
  if (pet.action === 'zoomies' || pet.action === 'pouncing') return 'social'
  if (pet.needs.hunger < 30 || pet.needs.happiness < 30) return 'agitated'
  // A seated cat holds its tail calm and curled, wherever its happiness
  // sits — the sway of 'content' would fight the wrapped-around pose.
  if (pet.action === 'sitting') return 'neutral'
  if (pet.needs.happiness > 70 && pet.action !== 'walking') return 'content'
  return 'neutral'
}

// Attach point, in the SVG's own local coordinates, where the tail meets
// the body — as drawn facing right. The body/head/legs are fixed shapes,
// so the SVG's CSS mirror (facing left) repositions them correctly on its
// own. The tail isn't a fixed shape, though — its position comes from
// physics simulated in world space (see petStore.tick / tailPhysics.ts),
// so nothing automatically re-mirrors it. Left uncorrected, the anchor
// this chain follows would sit at a fixed world offset from the cat
// regardless of which way it's facing — i.e. near the *head* for a
// left-facing cat instead of the back, since the CSS mirror never touches
// it. getTailAnchorLocal below is what actually corrects for this.
export const TAIL_ANCHOR_LOCAL = { x: 14, y: 28 }
export const TAIL_RAISE_PX = 6

// Mood-driven motion is applied here, at the anchor the tail chain follows
// (see tailPhysics.ts's stepChain), rather than as a separate CSS rotation
// layered on top of the already-simulated chain shape. A rigid rotation
// wrapped around a shape that's already trailing the body from its own
// momentum could swing segments straight through the body at the wrong
// angles; nudging the anchor instead lets the same chain-follow physics
// that draws the resting tail also draw the flick/swish, so it can never
// contradict the shape it's built from.
function getTailSwingLocal(mood: TailMood, now: number): { x: number; y: number } {
  switch (mood) {
    case 'content':
      // Slow, small, lazy drift — a relaxed cat's tail idly swaying.
      return { x: Math.sin(now / 1400) * 3, y: 0 }
    case 'social':
      // A bit livelier — a friendly swish while playing with another cat.
      return { x: Math.sin(now / 650) * 5, y: 0 }
    case 'agitated': {
      // A real flick, not a symmetric wag: a fast snap out followed by a
      // slower relaxed return, repeating — not a smooth back-and-forth.
      // The snap needs real *time*, not just a short period — this only
      // moves the anchor; stepChain's per-segment easing (tailPhysics.ts,
      // EASE=0.35, applied once per real frame) takes on the order of
      // 250-350ms to carry a sudden anchor movement all the way down 6
      // segments to the tip. An earlier version's snap lasted ~125ms
      // (18% of a 700ms period) — far too brief for the motion to ever
      // reach past the first segment or two before reversing, so the
      // flick only ever visibly moved the base, never the tip.
      const FLICK_PERIOD_MS = 1000
      const SNAP_FRACTION = 0.4
      const t = (now % FLICK_PERIOD_MS) / FLICK_PERIOD_MS
      const eased =
        t < SNAP_FRACTION ? t / SNAP_FRACTION : 1 - (t - SNAP_FRACTION) / (1 - SNAP_FRACTION)
      return { x: eased * 10, y: 0 }
    }
    default:
      return { x: 0, y: 0 }
  }
}

// Every posture below (seated/sleeping/held/stretching) ramps in over this
// long rather than snapping the instant the action changes — matched to
// roughly how fast PetSprite.tsx's own eased.sit/lie/hold/stretch refs
// converge (exponential easing at rate 5-7, ballpark 65-85% there by
// ~300ms). Not an exact curve match (that would need the store to
// replicate render-local per-frame dt easing, which it has no access to —
// see the M21 tail postmortem in DEVLOG.md for why that was rejected), but
// close enough that the tail is never caught visibly snapped to a pose the
// body hasn't finished fading into yet, which is what actually read as
// "disconnected."
const POSE_TRANSITION_MS = 350
// Sleeping is a bigger pose change (the whole body settles down, not just
// a crossfade) — a slightly longer ramp reads as settling in, not lagging.
const SLEEP_TRANSITION_MS = 450

function rampIn(active: boolean, elapsedMs: number, durationMs: number): number {
  return active ? Math.min(1, elapsedMs / durationMs) : 0
}

export function getTailAnchorLocal(
  pet: Pet,
  now: number,
  chasingFleeingMouse = false,
): { x: number; y: number } {
  const mood = getTailMood(pet)
  const swing = getTailSwingLocal(mood, now)
  // Must resolve to the exact same gait PetSprite.tsx's own selectGait call
  // does (same chasingFleeingMouse flag) — GALLOP's bounceMul (1.7) is
  // meaningfully different from TROT's (1.0), and that difference feeds
  // straight into the bob formula below.
  const gait = selectGait(pet, chasingFleeingMouse)
  // Gait-driven carriage — strut flags the tail up, slink drops it — is a
  // small additional offset layered on top of the mood/posture system
  // above rather than replacing it. Every other gait (walk/trot/gallop)
  // carries 'level', so this is a no-op for them. Unlike the postures
  // below, this doesn't need its own ramp: it rides on `pet.currentSpeed`
  // (via moving01, itself already eased by movement.ts's own accel/decel),
  // the same as the body's own gait posture in PetSprite.tsx — both derive
  // it fresh from the same Pet fields every frame, so there's no separate
  // lagged copy for this to fall out of sync with.
  const carriageAdjust = gait.tailCarriage === 'high' ? -7 : gait.tailCarriage === 'low' ? 9 : 0
  // Mirror the attach point itself around the sprite's own center when
  // facing left, so it stays at the cat's back — the one thing about the
  // tail that actually does need to know about facing, since (unlike the
  // fixed-shape body/head/legs) it isn't inside the SVG's own CSS mirror
  // for free. This is a POSITION correction (put the anchor at the same
  // final screen spot regardless of facing) — a DIRECTIONAL push added
  // after this point (like wrapCurl below) needs the opposite treatment:
  // adding it unflipped in local space already points the right way in
  // final screen terms once this position correction has already run,
  // precisely because the two corrections are inverses of each other.
  // Re-derive this from scratch rather than assuming it if tail direction
  // ever looks wrong — see the post-M18 tail postmortem in DEVLOG.md.
  const x = pet.facing === 'left' ? SVG_WIDTH - TAIL_ANCHOR_LOCAL.x : TAIL_ANCHOR_LOCAL.x
  const elapsedMs = now - pet.actionStartedAt
  // Grooming and kneading are both done seated too (see PetSprite's `sit`
  // blend), so the tail should drop the same way it does for 'sitting'.
  const seated = pet.action === 'sitting' || pet.action === 'grooming' || pet.action === 'kneading'
  // The rear end drops when seated (haunches on the ground) and further
  // when lying asleep — the tail attach point follows it down so the chain
  // rests on the floor beside the cat instead of floating mid-air. Held is
  // the same idea for a different reason: gravity, not a resting haunch,
  // pulls the tail down and loose while the cat dangles. Stretching raises
  // the rear instead (the purpose-built stretch silhouette arches the rump
  // up well above where the standing body sits) — the tail needs to follow
  // it up or it visibly hangs off the back of a body that's no longer
  // there. Each ramps in with the action's own elapsed time (`rampIn`)
  // instead of snapping instantly — see POSE_TRANSITION_MS above.
  const postureDrop =
    // 30, not the more modest 20 this used before — the seated silhouette's
    // haunch circle (PetSprite.tsx, cx=27 cy=44 r=10) is drawn *after* (on
    // top of) the tail, so anything landing inside it is completely hidden.
    // 20 (paired with the old wrapCurl of 7) landed dead center in that
    // circle — the tail wasn't misplaced so much as invisible. 30 clears
    // the haunch entirely, resting just below/behind it like a tail
    // actually settled on the floor beside a seated cat.
    rampIn(seated, elapsedMs, POSE_TRANSITION_MS) * 30 +
    rampIn(pet.action === 'sleeping', elapsedMs, SLEEP_TRANSITION_MS) * 24 +
    rampIn(pet.action === 'held', elapsedMs, POSE_TRANSITION_MS) * 22 +
    rampIn(pet.action === 'stretching', elapsedMs, POSE_TRANSITION_MS) * -6
  // The body's actual rendered height — its per-stride bounce (bob) plus
  // the current gait's crouch/rise (bodyHeight) — is a render-only
  // cosmetic value PetSprite.tsx computes, not something the store
  // otherwise tracks. But every input to it (stridePhase, currentSpeed,
  // gait) already lives on the Pet object, so it can be replicated here
  // exactly rather than approximated — this MUST stay byte-for-byte in
  // sync with PetSprite.tsx's own `bob`/`bodyBob` formula, or the tail
  // anchor drifts out of phase with the body's actual bounce on screen
  // (the dominant, ever-present cause of the tail reading as
  // "disconnected" during any movement — see the M21 tail postmortem).
  const moving01 = Math.min(1, pet.currentSpeed / 30)
  const speed01 = Math.min(1, pet.currentSpeed / RUN_SPEED)
  const bob =
    -Math.abs(Math.sin(pet.stridePhase)) * (0.5 + 1.3 * speed01) * moving01 * gait.bounceMul
  const bodyBob = bob + gait.bodyHeight * moving01
  // Tail-wrap: once seated, the tail curls forward around the front paws
  // rather than hanging straight down — ramps in the same way postureDrop
  // above does. Added directly to the already-facing-corrected `x` above,
  // unflipped — see the comment on `x` for why a directional push needs
  // the opposite treatment from the position correction it's layered on
  // top of. 12, not the old 7 — paired with postureDrop's bigger 30, keeps
  // the resting anchor clear of the haunch circle (see postureDrop above).
  const wrapCurl = rampIn(seated, elapsedMs, POSE_TRANSITION_MS) * 12
  return {
    x: x + swing.x + wrapCurl,
    y:
      (mood === 'content' ? TAIL_ANCHOR_LOCAL.y - TAIL_RAISE_PX : TAIL_ANCHOR_LOCAL.y) +
      postureDrop +
      carriageAdjust +
      bodyBob +
      swing.y,
  }
}
