import type { Pet } from '../types/pet'
import type { PlacedItem } from '../types/item'
import { randomPointInBounds } from './movement'
import { WALL_BAND_FRACTION } from './roomLayout'

interface TickContext {
  now: number
  sceneBounds: { width: number; height: number }
  // Unclaimed items this pet currently wants, nearest first — already
  // filtered/sorted by petStore.tick() since that's where the full picture
  // of all pets and items lives. This function just picks the nearest one.
  nearbyWantedItems: PlacedItem[]
}

const SLEEP_DURATION_MS = 6000
const IDLE_PAUSE_MS = 2000
const EATING_DURATION_MS = 2500
const PLAYING_DURATION_MS = 3000

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

      const wanted = ctx.nearbyWantedItems[0]
      if (wanted) {
        return {
          ...pet,
          action: 'walking',
          destination: wanted.position,
          targetItemId: wanted.id,
          actionStartedAt: ctx.now,
        }
      }

      const topMargin = ctx.sceneBounds.height * WALL_BAND_FRACTION + 20
      return {
        ...pet,
        action: 'walking',
        destination: randomPointInBounds(ctx.sceneBounds, 60, topMargin),
        targetItemId: null,
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
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    // 'eating' and 'playing' are triggered when a pet arrives at its
    // targetItemId (see petStore.tick's arrival/consumption step) — here we
    // just time them back out to idle.
    case 'eating': {
      if (ctx.now - pet.actionStartedAt > EATING_DURATION_MS) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    case 'playing': {
      if (ctx.now - pet.actionStartedAt > PLAYING_DURATION_MS) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    // Player is actively dragging this pet — AI is fully suspended, and
    // petStore.endDragPet() is what transitions it back out of 'held'.
    case 'held':
      return pet
    default:
      return pet
  }
}
