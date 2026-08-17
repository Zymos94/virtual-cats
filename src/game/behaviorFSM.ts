import type { Pet } from '../types/pet'
import { randomPointInBounds } from './movement'

interface TickContext {
  now: number
  sceneBounds: { width: number; height: number }
}

const SLEEP_DURATION_MS = 6000
const IDLE_PAUSE_MS = 2000

// Decides what a pet should be doing next. Pure function: Pet -> Pet, no
// side effects. Movement itself happens separately in movement.ts, driven
// by whatever this function decides `action`/`destination` should be.
export function updatePetBehavior(pet: Pet, ctx: TickContext): Pet {
  switch (pet.action) {
    case 'idle': {
      if (pet.needs.energy < 20) {
        return { ...pet, action: 'sleeping', actionStartedAt: ctx.now }
      }
      // Pause briefly before wandering again, rather than instantly
      // picking a new destination — gives the idle tail-sway a moment
      // to actually show, and reads as a pet pausing to look around.
      if (ctx.now - pet.actionStartedAt < IDLE_PAUSE_MS) {
        return pet
      }
      return {
        ...pet,
        action: 'walking',
        destination: randomPointInBounds(ctx.sceneBounds),
        actionStartedAt: ctx.now,
      }
    }
    case 'walking': {
      if (!pet.destination) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      const dist = Math.hypot(pet.destination.x - pet.position.x, pet.destination.y - pet.position.y)
      if (dist < 2) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      return pet
    }
    case 'sleeping': {
      if (ctx.now - pet.actionStartedAt > SLEEP_DURATION_MS || pet.needs.energy >= 90) {
        return { ...pet, action: 'idle' }
      }
      return pet
    }
    default:
      return pet
  }
}
