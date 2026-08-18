import type { Pet } from '../types/pet'
import { getLifeStage, getLifeStageSpeedMultiplier } from './lifeStage'

// Gait targets (px/s, before the life-stage multiplier). Which one applies
// comes from *why* the cat is moving: aimless wandering is a slow amble,
// heading to something it actually wants is a purposeful trot, zoomies is
// a flat-out run.
const AMBLE_SPEED = 40
// Slower than an amble — a deliberate creep, not idle wandering.
const STALK_SPEED = 28
const TROT_SPEED = 85
export const RUN_SPEED = 190

// Cats build speed noticeably slower than they shed it — a stop reads as
// a couple of quick strides, not a long glide.
const ACCEL = 260 // px/s² while speeding up
const DECEL = 480 // px/s² while slowing down

// Inside this distance of the destination the target speed tapers down,
// so arrivals decelerate into a stop instead of halting mid-stride.
const ARRIVE_RADIUS = 48
const MIN_ARRIVE_SPEED = 22

// Ground distance covered by one full leg cycle. Feeds stridePhase, which
// the renderer uses to swing the legs — tying the cycle to distance (not
// time) keeps feet from visibly skating at any speed.
const STRIDE_LENGTH_PX = 30
const TWO_PI = Math.PI * 2

// topMargin lets callers keep wandering cats off the "wall" band at the top
// of the room, without also pushing the bottom margin in — defaults to the
// same value as margin when not given.
export function randomPointInBounds(
  bounds: { width: number; height: number },
  margin = 60,
  topMargin = margin,
): { x: number; y: number } {
  return {
    x: margin + Math.random() * Math.max(1, bounds.width - margin * 2),
    y: topMargin + Math.random() * Math.max(1, bounds.height - topMargin - margin),
  }
}

function targetSpeedFor(pet: Pet, distanceLeft: number, chasingFleeingMouse: boolean): number {
  const base =
    pet.action === 'zoomies'
      ? RUN_SPEED
      : pet.action === 'stalking'
        ? STALK_SPEED
        : // Matches selectGait's own gallop trigger (gaits.ts) — a cat
          // visibly galloping after a fleeing mouse needs to actually move
          // at gallop speed, not just look like it while still only
          // trotting.
          pet.targetMouseId && chasingFleeingMouse
          ? RUN_SPEED
          : pet.targetItemId || pet.targetPetId || pet.targetMouseId
            ? TROT_SPEED
            : AMBLE_SPEED
  const scaled = base * getLifeStageSpeedMultiplier(getLifeStage(pet.ageMs))
  if (distanceLeft >= ARRIVE_RADIUS) return scaled
  return Math.max(MIN_ARRIVE_SPEED, scaled * (distanceLeft / ARRIVE_RADIUS))
}

// Smooth ballistic ground-track for a hop: ease-in-out so the leap leaves
// and lands softly rather than at constant ground speed.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// Advances one frame of a pet's motion: an in-flight jump if one is set
// (pounce, zoomies hop), otherwise normal destination-seeking for the
// moving actions, with eased acceleration between gaits. Still pets just
// bleed off any leftover speed.
export function movePet(pet: Pet, deltaMs: number, chasingFleeingMouse = false): Pet {
  const dt = deltaMs / 1000

  if (pet.jump) {
    const progressMs = pet.jump.progressMs + deltaMs
    const t = Math.min(1, progressMs / pet.jump.durationMs)
    const eased = smoothstep(t)
    const position = {
      x: pet.jump.from.x + (pet.jump.to.x - pet.jump.from.x) * eased,
      y: pet.jump.from.y + (pet.jump.to.y - pet.jump.from.y) * eased,
    }
    const dxJump = pet.jump.to.x - pet.jump.from.x
    const facing: Pet['facing'] = dxJump < 0 ? 'left' : dxJump > 0 ? 'right' : pet.facing
    if (t >= 1) {
      // Landed. A pounce resolves to idle so the store's arrival pass can
      // consume the toy; a zoomies hop just resumes running.
      const landedAction = pet.action === 'pouncing' ? 'idle' : pet.action
      return { ...pet, position, facing, jump: null, action: landedAction }
    }
    return { ...pet, position, facing, jump: { ...pet.jump, progressMs } }
  }

  const destination =
    pet.action === 'walking' || pet.action === 'zoomies' || pet.action === 'stalking'
      ? pet.destination
      : null
  if (!destination) {
    if (pet.currentSpeed === 0) return pet
    return { ...pet, currentSpeed: Math.max(0, pet.currentSpeed - DECEL * dt) }
  }

  const dx = destination.x - pet.position.x
  const dy = destination.y - pet.position.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return pet.currentSpeed === 0 ? pet : { ...pet, currentSpeed: 0 }

  const target = targetSpeedFor(pet, dist, chasingFleeingMouse)
  const currentSpeed =
    pet.currentSpeed < target
      ? Math.min(target, pet.currentSpeed + ACCEL * dt)
      : Math.max(target, pet.currentSpeed - DECEL * dt)

  const step = Math.min(dist, currentSpeed * dt)
  const facing: Pet['facing'] = dx < 0 ? 'left' : dx > 0 ? 'right' : pet.facing

  return {
    ...pet,
    position: {
      x: pet.position.x + (dx / dist) * step,
      y: pet.position.y + (dy / dist) * step,
    },
    facing,
    currentSpeed,
    stridePhase: (pet.stridePhase + (step / STRIDE_LENGTH_PX) * TWO_PI) % TWO_PI,
  }
}
