import type { Pet } from '../types/pet'
import { selectGait } from './gaits'
import { SVG_WIDTH } from './spriteConstants'

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
      const FLICK_PERIOD_MS = 700
      const SNAP_FRACTION = 0.18
      const t = (now % FLICK_PERIOD_MS) / FLICK_PERIOD_MS
      const eased =
        t < SNAP_FRACTION ? t / SNAP_FRACTION : 1 - (t - SNAP_FRACTION) / (1 - SNAP_FRACTION)
      return { x: eased * 10, y: 0 }
    }
    default:
      return { x: 0, y: 0 }
  }
}

export function getTailAnchorLocal(pet: Pet, now: number): { x: number; y: number } {
  const mood = getTailMood(pet)
  const swing = getTailSwingLocal(mood, now)
  // Gait-driven carriage — strut flags the tail up, slink drops it — is a
  // small additional offset layered on top of the mood/posture system
  // above rather than replacing it. Every other gait (walk/trot/gallop)
  // carries 'level', so this is a no-op for them.
  const carriage = selectGait(pet).tailCarriage
  const carriageAdjust = carriage === 'high' ? -7 : carriage === 'low' ? 9 : 0
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
  // Grooming and kneading are both done seated too (see PetSprite's `sit`
  // blend), so the tail should drop the same way it does for 'sitting'.
  const seated = pet.action === 'sitting' || pet.action === 'grooming' || pet.action === 'kneading'
  // The rear end drops when seated (haunches on the ground) and further
  // when lying asleep — the tail attach point follows it down so the chain
  // rests on the floor beside the cat instead of floating mid-air. The
  // chain's own easing carries the segments there smoothly. Held is the
  // same idea for a different reason: gravity, not a resting haunch, pulls
  // the tail down and loose while the cat dangles.
  const postureDrop = seated ? 20 : pet.action === 'sleeping' ? 24 : pet.action === 'held' ? 22 : 0
  // Tail-wrap: once seated, the tail curls forward around the front paws
  // rather than hanging straight down — ramps in over the first ~1.2s of
  // sitting rather than snapping straight to the wrapped position. Added
  // directly to the already-facing-corrected `x` above, unflipped — see
  // the comment on `x` for why a directional push needs the opposite
  // treatment from the position correction it's layered on top of.
  const sitElapsedMs = seated ? now - pet.actionStartedAt : 0
  const wrapCurl = seated ? Math.min(1, sitElapsedMs / 1200) * 7 : 0
  return {
    x: x + swing.x + wrapCurl,
    y:
      (mood === 'content' ? TAIL_ANCHOR_LOCAL.y - TAIL_RAISE_PX : TAIL_ANCHOR_LOCAL.y) +
      postureDrop +
      carriageAdjust +
      swing.y,
  }
}
