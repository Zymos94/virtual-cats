import type { Pet } from '../types/pet'
import type { AttentionTarget } from './attention'
import { getLifeStage } from './lifeStage'
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

// Odds per idle decision (i.e., every IDLE_PAUSE or so with nothing to
// want) of a zoomies burst, for a cat energetic and happy enough for one.
// Kittens are the ones famous for this; seniors basically never.
const ZOOMIES_CHANCE = { kitten: 0.22, adult: 0.08, senior: 0.02 }
const ZOOMIES_MIN_ENERGY = 55
const ZOOMIES_MIN_HAPPINESS = 50
const ZOOMIES_MIN_MS = 3500
const ZOOMIES_EXTRA_MS = 3500
// Reaching a zoomies waypoint sometimes turns into a flying hop into the
// next sprint rather than just a new heading.
const ZOOMIES_HOP_CHANCE = 0.35
const ZOOMIES_HOP_DISTANCE = 90
const ZOOMIES_HOP_DURATION_MS = 420

// Odds per idle decision of parking on the haunches for a while instead
// of wandering — the cozy default a real cat picks constantly.
const SIT_CHANCE = 0.3
const SIT_MIN_MS = 6000
const SIT_EXTRA_MS = 8000

// Idle animations — self-contained performances rolled alongside
// zoomies/sitting/wandering above, each a flat duration range.
const GROOM_CHANCE = 0.1
// A none-too-clean cat reaches for a groom noticeably more often —
// hygiene-motivated grooming, not just a random idle pick.
const GROOM_CHANCE_DIRTY = 0.22
const GROOM_DIRTY_HYGIENE = 50
const GROOM_MIN_MS = 3000
const GROOM_EXTRA_MS = 2200

const STRETCH_CHANCE = 0.06
const STRETCH_MIN_MS = 1600
const STRETCH_EXTRA_MS = 500

const KNEAD_CHANCE = 0.07
const KNEAD_MIN_MS = 3500
const KNEAD_EXTRA_MS = 3000

// Shared by idle and sitting: stand up / set off toward the single thing
// this pet currently wants most.
function walkToward(pet: Pet, target: AttentionTarget, now: number): Pet {
  const isCat = target.kind === 'cat'
  const destination = isCat
    ? { x: target.position.x + SOCIAL_APPROACH_OFFSET, y: target.position.y }
    : target.position
  return {
    ...pet,
    action: 'walking',
    destination,
    targetItemId: isCat ? null : target.id,
    targetPetId: isCat ? target.id : null,
    actionStartedAt: now,
  }
}

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
        return walkToward(pet, ctx.bestTarget, ctx.now)
      }

      // Nothing in particular to want — pick between a zoomies burst, a
      // long sit, an idle animation, or an ambling wander. One roll
      // decides: each option claims a slice of 0..1 in turn, in the odds
      // given by the constants above, and whichever slice the roll lands
      // in wins; anything left over falls through to a plain wander.
      const roll = Math.random()
      let threshold = 0
      const claims = (chance: number) => {
        threshold += chance
        return roll < threshold
      }

      const zoomiesChance =
        pet.needs.energy > ZOOMIES_MIN_ENERGY && pet.needs.happiness > ZOOMIES_MIN_HAPPINESS
          ? ZOOMIES_CHANCE[getLifeStage(pet.ageMs)]
          : 0
      const groomChance =
        pet.needs.hygiene < GROOM_DIRTY_HYGIENE ? GROOM_CHANCE_DIRTY : GROOM_CHANCE
      const topMargin = ctx.sceneBounds.height * WALL_BAND_FRACTION + 20

      if (claims(zoomiesChance)) {
        return {
          ...pet,
          action: 'zoomies',
          destination: randomPointInBounds(ctx.sceneBounds, 60, topMargin),
          actionDurationMs: ZOOMIES_MIN_MS + Math.random() * ZOOMIES_EXTRA_MS,
          targetItemId: null,
          targetPetId: null,
          actionStartedAt: ctx.now,
        }
      }

      if (claims(SIT_CHANCE)) {
        return {
          ...pet,
          action: 'sitting',
          destination: null,
          actionDurationMs: SIT_MIN_MS + Math.random() * SIT_EXTRA_MS,
          targetItemId: null,
          targetPetId: null,
          actionStartedAt: ctx.now,
        }
      }

      if (claims(groomChance)) {
        return {
          ...pet,
          action: 'grooming',
          destination: null,
          actionDurationMs: GROOM_MIN_MS + Math.random() * GROOM_EXTRA_MS,
          targetItemId: null,
          targetPetId: null,
          actionStartedAt: ctx.now,
        }
      }

      if (claims(STRETCH_CHANCE)) {
        return {
          ...pet,
          action: 'stretching',
          destination: null,
          actionDurationMs: STRETCH_MIN_MS + Math.random() * STRETCH_EXTRA_MS,
          targetItemId: null,
          targetPetId: null,
          actionStartedAt: ctx.now,
        }
      }

      if (claims(KNEAD_CHANCE)) {
        return {
          ...pet,
          action: 'kneading',
          destination: null,
          actionDurationMs: KNEAD_MIN_MS + Math.random() * KNEAD_EXTRA_MS,
          targetItemId: null,
          targetPetId: null,
          actionStartedAt: ctx.now,
        }
      }

      return {
        ...pet,
        action: 'walking',
        destination: randomPointInBounds(ctx.sceneBounds, 60, topMargin),
        targetItemId: null,
        targetPetId: null,
        actionStartedAt: ctx.now,
      }
    }
    case 'sitting': {
      // A good-enough reason stands the cat right up — the same wants
      // that would break an idle pause.
      if (ctx.bestTarget) {
        return walkToward(pet, ctx.bestTarget, ctx.now)
      }
      // Someone's on their way over to play — stay seated and wait.
      if (pet.socialClaimedBy) return pet
      if (ctx.now - pet.actionStartedAt > pet.actionDurationMs) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    // Idle animations run to completion once started — unlike 'sitting',
    // a good enough reason to get up doesn't cut these short, since a
    // groom or stretch interrupted mid-pose reads as broken rather than
    // as a cat changing its mind (same reasoning as 'eating'/'playing').
    case 'grooming':
    case 'stretching':
    case 'kneading': {
      if (ctx.now - pet.actionStartedAt > pet.actionDurationMs) {
        return { ...pet, action: 'idle', actionStartedAt: ctx.now }
      }
      return pet
    }
    case 'zoomies': {
      if (ctx.now - pet.actionStartedAt > pet.actionDurationMs) {
        return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      }
      // Mid-hop: let the jump land before picking anything new.
      if (pet.jump) return pet
      const arrived =
        !pet.destination ||
        Math.hypot(pet.destination.x - pet.position.x, pet.destination.y - pet.position.y) < 12
      if (arrived) {
        const topMargin = ctx.sceneBounds.height * WALL_BAND_FRACTION + 20
        const destination = randomPointInBounds(ctx.sceneBounds, 60, topMargin)
        // Sometimes the turn into the next sprint is a flying hop. The hop
        // lands partway along the new direction, always short of the
        // destination, so it stays inside the room's bounds.
        if (Math.random() < ZOOMIES_HOP_CHANCE) {
          const dx = destination.x - pet.position.x
          const dy = destination.y - pet.position.y
          const dist = Math.hypot(dx, dy)
          if (dist > ZOOMIES_HOP_DISTANCE) {
            const to = {
              x: pet.position.x + (dx / dist) * ZOOMIES_HOP_DISTANCE,
              y: pet.position.y + (dy / dist) * ZOOMIES_HOP_DISTANCE,
            }
            return {
              ...pet,
              destination,
              jump: { from: pet.position, to, progressMs: 0, durationMs: ZOOMIES_HOP_DURATION_MS },
            }
          }
        }
        return { ...pet, destination }
      }
      return pet
    }
    // In-flight at a toy — movement.ts owns this until the jump lands
    // (which resolves back to idle for the arrival/consumption pass in
    // petStore.tick). A missing jump means something interrupted it;
    // recover to idle rather than hanging forever.
    case 'pouncing': {
      if (!pet.jump) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      return pet
    }
    case 'walking': {
      if (!pet.destination)
        return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      const dist = Math.hypot(
        pet.destination.x - pet.position.x,
        pet.destination.y - pet.position.y,
      )
      if (dist < 4) return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      return pet
    }
    // Same destination-seeking shape as 'walking' — the store is what
    // transitions a pet into (and out of) 'stalking' based on live
    // distance to the toy it's approaching (see petStore.tick's
    // STALK_RANGE check), same as it does for 'pouncing'. This case is
    // mostly a fallback: normally the store hands off to 'pouncing' well
    // before a stalking cat would ever walk all the way to the target.
    case 'stalking': {
      if (!pet.destination)
        return { ...pet, action: 'idle', destination: null, actionStartedAt: ctx.now }
      const dist = Math.hypot(
        pet.destination.x - pet.position.x,
        pet.destination.y - pet.position.y,
      )
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
    // Player is holding a pointer down on this pet to pet it — AI is fully
    // suspended (same as 'held'), and petStore.endPetting() is what
    // transitions it back out. The happiness gain itself happens in
    // petStore.tick(), not here, since it's a continuous per-frame effect
    // rather than a state transition.
    case 'petting':
      return pet
    default:
      return pet
  }
}
