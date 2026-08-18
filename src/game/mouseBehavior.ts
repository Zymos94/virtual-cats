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
// Rolled once at spawn — how many scares a mouse shrugs off (just running
// away from whatever spooked it) before it gives up and makes a break for
// the mouse hole instead.
export const MOUSE_MIN_LIVES = 2
export const MOUSE_MAX_LIVES = 7

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
  // detection range — used to pick a flee direction away from it.
  // Null only when the room has no cats in it at all.
  nearestThreatPosition: { x: number; y: number } | null
  // The mouse hole is a fixed room feature (see roomLayout.ts) — always
  // exists, unlike the old placeable-item version.
  holePosition: { x: number; y: number }
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

// Turns a mouse scared (by being spotted while sneaking, pounced at, or
// just chucked out of a cat's mouth) into a fleeing one. Shared by
// updateMouseBehavior below (the "spotted while sneaking" path) and
// petStore.tick()'s pounce-trigger and chuck logic — those are
// cross-entity (they mutate a cat too) so they can't go through this pure
// function directly, but the fear/lives/destination logic is identical
// either way, so it lives in one place. A scare mid-flee (already
// 'fleeing') doesn't cost another life or change where it's headed — it's
// the same scare episode, not a new one.
export function scareMouse(
  mouse: Mouse,
  now: number,
  sceneBounds: { width: number; height: number },
  topMargin: number,
  threatPosition: { x: number; y: number } | null,
  holePosition: { x: number; y: number },
): Mouse {
  const freshScare = mouse.state !== 'fleeing'
  if (!freshScare) {
    return { ...mouse, lastThreatenedAt: now }
  }
  const livesRemaining = mouse.livesRemaining - 1
  const panicked = livesRemaining <= 0
  return {
    ...mouse,
    state: 'fleeing',
    livesRemaining,
    lastThreatenedAt: now,
    destination: panicked
      ? holePosition
      : pickSneakPoint(sceneBounds, topMargin, mouse.position, threatPosition),
  }
}

// Decides what a mouse should be doing next. Pure function, same shape as
// updatePetBehavior: Mouse -> Mouse, no side effects. Catching, holding,
// and chucking are cross-entity (they mutate a cat too) so those live in
// petStore.tick() instead (via scareMouse above), same reasoning as a
// cat's own pounce/consume.
export function updateMouseBehavior(mouse: Mouse, ctx: MouseTickContext): Mouse {
  if (mouse.state === 'held') return mouse
  if (mouse.jump) return mouse // mid-chuck-hop — let it land before deciding anything

  if (ctx.spotted) {
    return scareMouse(
      mouse,
      ctx.now,
      ctx.sceneBounds,
      ctx.topMargin,
      ctx.nearestThreatPosition,
      ctx.holePosition,
    )
  }

  if (mouse.state === 'fleeing') {
    if (ctx.now - mouse.lastThreatenedAt > MOUSE_CALM_MS) {
      return { ...mouse, state: 'sneaking', destination: null, actionStartedAt: ctx.now }
    }
    // Not currently spotted but still within the calm window — keep going
    // wherever it was already headed. The hole never moves (it's a fixed
    // room feature), so a panicked mouse's destination never needs
    // re-aiming the way a cat re-aims at a rolling ball.
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
