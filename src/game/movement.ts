import type { Pet } from '../types/pet'
import { getLifeStage, getLifeStageSpeedMultiplier } from './lifeStage'

const SPEED_PX_PER_SEC = 40

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

// Advances a walking pet toward its destination by one frame's worth of
// distance. Does nothing for pets that aren't currently walking.
export function movePet(pet: Pet, deltaMs: number): Pet {
  if (pet.action !== 'walking' || !pet.destination) return pet

  const dx = pet.destination.x - pet.position.x
  const dy = pet.destination.y - pet.position.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return pet

  const speed = SPEED_PX_PER_SEC * getLifeStageSpeedMultiplier(getLifeStage(pet.ageMs))
  const step = Math.min(dist, (speed * deltaMs) / 1000)
  const facing: Pet['facing'] = dx < 0 ? 'left' : dx > 0 ? 'right' : pet.facing

  return {
    ...pet,
    position: {
      x: pet.position.x + (dx / dist) * step,
      y: pet.position.y + (dy / dist) * step,
    },
    facing,
  }
}
