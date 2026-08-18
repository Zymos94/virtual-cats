import type { Mouse } from '../types/mouse'
import { randomPointInBounds } from './movement'

// A trotting/walking cat spooks it from well across the room; a stalking
// cat (slow, crouched) can get much closer before being noticed. For a
// stalk to ever actually succeed, this needs real headroom below
// petStore.ts's STALK_RANGE (200) — a cat that hasn't been loud-detected
// yet by the time it closes to STALK_RANGE switches into the quiet
// MOUSE_STALK_DETECT_RADIUS check *before* the loud radius ever gets a
// chance to apply, giving it a genuine shot at an undetected approach
// (and even a pounce, since POUNCE_RANGE at 90 is bigger than this stalk
// radius). Equal to STALK_RANGE (an earlier version of this) made
// detection and the stalk-transition fire in the same instant — never a
// real sneak, just a coin flip.
export const MOUSE_DETECT_RADIUS = 150
export const MOUSE_STALK_DETECT_RADIUS = 65
// How long a fleeing mouse can go without anything threatening it before
// it calms back down to cautious sneaking.
export const MOUSE_CALM_MS = 9000

const SNEAK_PAUSE_MS = 1200
const SNEAK_MARGIN = 40

export interface MouseTickContext {
  now: number
  sceneBounds: { width: number; height: number }
  topMargin: number
  // Whether *any* cat is within its own detection radius right now — a
  // stalking cat's radius is much smaller than a trotting/walking one's
  // (see MOUSE_STALK_DETECT_RADIUS/MOUSE_DETECT_RADIUS), so this already
  // accounts for that per-cat, not just distance to the closest one.
  spotted: boolean
  // The nearest cat's position regardless of whether it's within
  // detection range — used to pick a flee direction away from it when
  // there's no mouse hole to run to instead. Null only when the room has
  // no cats in it at all.
  nearestThreatPosition: { x: number; y: number } | null
  // Live position of a mouse hole in the room, if one exists.
  holePosition: { x: number; y: number } | null
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// A random wander point, nudged away from a nearby threat if the naive
// roll would land closer to it than the mouse already is — "not be seen"
// means actively avoiding a cat it's aware of, not just picking randomly.
function pickSneakPoint(
  bounds: { width: number; height: number },
  topMargin: number,
  from: { x: number; y: number },
  threatPos: { x: number; y: number } | null,
): { x: number; y: number } {
  const candidate = randomPointInBounds(bounds, SNEAK_MARGIN, topMargin)
  if (!threatPos || dist(candidate, threatPos) >= dist(from, threatPos)) return candidate
  // Reflect the candidate through the mouse's current position — a cheap
  // way to bias it to the opposite side from the threat without a search.
  return {
    x: Math.min(Math.max(2 * from.x - candidate.x, SNEAK_MARGIN), bounds.width - SNEAK_MARGIN),
    y: Math.min(Math.max(2 * from.y - candidate.y, topMargin), bounds.height - SNEAK_MARGIN),
  }
}

// Decides what a mouse should be doing next. Pure function, same shape as
// updatePetBehavior: Mouse -> Mouse, no side effects. Catching, holding,
// and chucking are cross-entity (they mutate a cat too) so those live in
// petStore.tick() instead, same reasoning as a cat's own pounce/consume.
export function updateMouseBehavior(mouse: Mouse, ctx: MouseTickContext): Mouse {
  if (mouse.state === 'held') return mouse
  if (mouse.jump) return mouse // mid-chuck-hop — let it land before deciding anything

  if (ctx.spotted) {
    return {
      ...mouse,
      state: 'fleeing',
      lastThreatenedAt: ctx.now,
      destination:
        ctx.holePosition ??
        pickSneakPoint(ctx.sceneBounds, ctx.topMargin, mouse.position, ctx.nearestThreatPosition),
    }
  }

  if (mouse.state === 'fleeing') {
    if (ctx.now - mouse.lastThreatenedAt > MOUSE_CALM_MS) {
      return { ...mouse, state: 'sneaking', destination: null, actionStartedAt: ctx.now }
    }
    // Keep re-aiming at the hole every tick in case it gets dragged
    // elsewhere mid-chase, same as a cat re-aiming at a rolling ball.
    if (ctx.holePosition) return { ...mouse, destination: ctx.holePosition }
    return mouse
  }

  // Sneaking: pause between cautious moves, then pick a new point away
  // from whatever's nearby.
  const arrived = !mouse.destination || dist(mouse.position, mouse.destination) < 6
  if (arrived && ctx.now - mouse.actionStartedAt > SNEAK_PAUSE_MS) {
    return {
      ...mouse,
      destination: pickSneakPoint(
        ctx.sceneBounds,
        ctx.topMargin,
        mouse.position,
        ctx.nearestThreatPosition,
      ),
      actionStartedAt: ctx.now,
    }
  }
  return mouse
}
