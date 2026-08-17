import type { Pet } from '../types/pet'
import type { AttentionTarget } from './attention'
import { randomPointInBounds } from './movement'
import { WALL_BAND_FRACTION } from './roomLayout'

interface TickContext {
  now: number
  sceneBounds: { width: number; height: number }
  // The single highest-scoring thing this pet currently wants — an item or
  // another cat — already resolved by petStore.tick() since that's where
  // the full picture of all pets and items lives. Null means nothing
  // nearby is worth breaking off a random wander for.
  bestTarget: AttentionTarget | null
}

const SLEEP_DURATION_MS = 6000
const IDLE_PAUSE_MS = 2000
const EATING_DURATION_MS = 2500
const PLAYING_DURATION_MS = 3000
const SOCIAL_PLAYING_DURATION_MS = 4000
// How far beside the other cat to walk to, rather than exactly on top of
// it — sprites shouldn't fully overlap when they "meet up".
const SOCIAL_APPROACH_OFFSET = 50

// Decides what a pet should be doing next. Pure function: Pet -> Pet, no
// side effects. Movement itself happens separately in movement.ts, driven
// by whatever this function decides `action`/`destination` should be.
export function updatePetBehavior(pet: Pet, ctx: TickContext): Pet {
  switch (pet.action) {
    case 'idle': {
      // Truly exhausted — collapse right here rather than trying to make
      // it to a bed. Above this floor, a low-energy cat instead competes
      // for a bed through bestTarget below, same as any other want.
      if (pet.needs.energy < 10) {
        return { ...pet, action: 'sleeping', actionStartedAt: ctx.now }
      }
      // Someone else is on their way over to play — wait here instead of
      // wandering off and making them chase forever.
      if (pet.socialClaimedBy) {
        return pet
      }
      // Pause briefly before wandering again, rather than instantly
      // picking a new destination — gives the idle tail-sway a moment
      // to actually show, and reads as a pet pausing to look around.
      if (ctx.now - pet.actionStartedAt < IDLE_PAUSE_MS) {
        return pet
      }

      if (ctx.bestTarget) {
        const isCat = ctx.bestTarget.kind === 'cat'
        const destination = isCat
          ? { x: ctx.bestTarget.position.x + SOCIAL_APPROACH_OFFSET, y: ctx.bestTarget.position.y }
          : ctx.bestTarget.position
        return {
          ...pet,
          action: 'walking',
          destination,
          targetItemId: isCat ? null : ctx.bestTarget.id,
          targetPetId: isCat ? ctx.bestTarget.id : null,
          actionStartedAt: ctx.now,
        }
      }

      const topMargin = ctx.sceneBounds.height * WALL_BAND_FRACTION + 20
      return {
        ...pet,
        action: 'walking',
        destination: randomPointInBounds(ctx.sceneBounds, 60, topMargin),
        targetItemId: null,
        targetPetId: null,
        actionStartedAt: ctx.now,
      }
    }
    case 'walking': {
      if (!pet.destination) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      const dist = Math.hypot(pet.destination.x - pet.position.x, pet.destination.y - pet.position.y)
      if (dist < 4) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      return pet
    }
    case 'sleeping': {
      if (ctx.now - pet.actionStartedAt > SLEEP_DURATION_MS || pet.needs.energy >= 90) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    // 'eating' is triggered when a pet arrives at its targetItemId (see
    // petStore.tick's arrival/consumption step); 'playing' is triggered
    // either that same way (a toy) or by mutually arriving at another cat
    // (see petStore.tick's social-arrival pass) — here we just time both
    // back out to idle. A social 'playing' (targetPetId still set, pointing
    // at the other cat) runs a bit longer than solo toy play.
    case 'eating': {
      if (ctx.now - pet.actionStartedAt > EATING_DURATION_MS) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    case 'playing': {
      const duration = pet.targetPetId ? SOCIAL_PLAYING_DURATION_MS : PLAYING_DURATION_MS
      if (ctx.now - pet.actionStartedAt > duration) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now, targetPetId: null }
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
