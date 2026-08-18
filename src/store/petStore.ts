import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ActionState, Needs, Pet } from '../types/pet'
import type { Genetics } from '../types/genetics'
import type { PlacedItem } from '../types/item'
import { updatePetBehavior } from '../game/behaviorFSM'
import { movePet } from '../game/movement'
import { breedGenetics } from '../game/genetics'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { attentionScore, itemUrgency, socialUrgency, type AttentionTarget } from '../game/attention'
import { clampToRoom, stepItemPhysics } from '../game/itemPhysics'
import { clearSavedGame, loadFromLocalStorage, saveToLocalStorage } from './persist'
import { getTailAnchorLocal } from '../game/tailMood'
import { initialSegments, stepChain, type Point } from '../game/tailPhysics'
import { TAIL_LINK_LENGTH, TAIL_SEGMENTS } from '../game/spriteConstants'
import { STARTER_AGE_MS } from '../game/lifeStage'
import { playSound, startLoop, stopAllLoops, stopLoop } from '../game/sound'

interface PetStore {
  pets: Record<string, Pet>
  sceneItems: Record<string, PlacedItem>
  // Tail chain positions in scene coordinates, one array per pet — kept
  // here (not component state) so they keep relaxing every real frame even
  // for pets that aren't currently moving. See tailPhysics.ts for why.
  tailSegments: Record<string, Point[]>
  sceneBounds: { width: number; height: number }
  decayAccumulatorMs: number
  selectedPetId: string | null
  // Multiplies every deltaMs-driven effect (needs decay, aging, movement,
  // item physics) — 1 is normal cozy pace, higher fast-forwards the whole
  // simulation uniformly. Doesn't affect wall-clock action timers (how
  // long an eating/sleeping animation lasts), just how fast time itself
  // passes for the room.
  timeScale: number
  tick: (now: number, deltaMs: number) => void
  setTimeScale: (value: number) => void
  setSceneBounds: (bounds: { width: number; height: number }) => void
  selectPet: (petId: string | null) => void
  startDragPet: (petId: string) => void
  startPetting: (petId: string) => void
  endPetting: (petId: string) => void
  dragPetTo: (petId: string, x: number, y: number) => void
  endDragPet: (petId: string) => void
  putPetInSuitcase: (petId: string) => void
  takePetFromSuitcase: (petId: string, position: { x: number; y: number }) => void
  placeItem: (itemTypeId: string, position: { x: number; y: number }) => void
  startDragItem: (itemId: string) => void
  dragItemTo: (itemId: string, x: number, y: number) => void
  endDragItem: (itemId: string, velocity: { x: number; y: number }) => void
  breedPets: (parentAId: string, parentBId: string) => void
  renamePet: (petId: string, name: string) => void
  resetGame: () => void
}

const DECAY_INTERVAL_MS = 1000
// Cozy, not hectic — a cat left alone should take the better part of an
// hour to actually need something, not a couple of minutes.
const DECAY_PER_SECOND: Needs = { hunger: -0.05, energy: -0.03, hygiene: -0.02, happiness: -0.02 }

const PLACE_DROP_HEIGHT = 24
const LIFT_RATIO = 0.6 // fraction of throw speed converted into upward lift
const MAX_LIFT = 600 // px/s cap, so a very fast swipe doesn't launch it absurdly high
const SOCIAL_HAPPINESS_BOOST = 15 // per cat, modest — playing together is free, shouldn't outshine toys
// Happiness gained per second while being petted, scaled by the cat's own
// affection trait — a very affectionate cat (affection 100) gains roughly
// 5x faster than an aloof one (affection 0).
const PETTING_BASE_RATE = 2
const PETTING_AFFECTION_BONUS = 8

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function clampAttentionSpan(value: number): number {
  return Math.max(150, Math.min(450, value))
}

function releaseClaim(
  sceneItems: Record<string, PlacedItem>,
  itemId: string | null,
): Record<string, PlacedItem> {
  if (!itemId || !sceneItems[itemId]) return sceneItems
  return { ...sceneItems, [itemId]: { ...sceneItems[itemId], claimedBy: null } }
}

// Called when `petId` gets interrupted (picked up, put away). Releases the
// social claim it was holding on someone else (if it was mid-approach),
// and — the other direction — clears any OTHER cat's targetPetId that was
// pointed at petId, so that cat doesn't keep chasing a partner who just
// vanished from the room.
function releaseSocialClaims(pets: Record<string, Pet>, petId: string): Record<string, Pet> {
  let result = pets
  const pet = result[petId]
  if (pet?.targetPetId && result[pet.targetPetId]) {
    result = { ...result, [pet.targetPetId]: { ...result[pet.targetPetId], socialClaimedBy: null } }
  }
  for (const otherId in result) {
    if (otherId !== petId && result[otherId].targetPetId === petId) {
      result = { ...result, [otherId]: { ...result[otherId], targetPetId: null } }
    }
  }
  return result
}

function applyDecay(pet: Pet): Pet {
  return {
    ...pet,
    needs: {
      hunger: clamp(pet.needs.hunger + DECAY_PER_SECOND.hunger),
      energy: clamp(pet.needs.energy + DECAY_PER_SECOND.energy),
      hygiene: clamp(pet.needs.hygiene + DECAY_PER_SECOND.hygiene),
      happiness: clamp(pet.needs.happiness + DECAY_PER_SECOND.happiness),
    },
  }
}

// Both alleles the same value, so the phenotype is guaranteed regardless of
// dominance order — used only for the hand-picked starter pets below.
function homozygous<T extends string>(value: T): { allele1: T; allele2: T } {
  return { allele1: value, allele2: value }
}

function makeStarterPet(overrides: Pick<Pet, 'id' | 'name' | 'position' | 'genetics'> & Partial<Pet>): Pet {
  return {
    needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
    destination: null,
    action: 'idle',
    facing: 'right',
    actionStartedAt: 0,
    parentIds: null,
    inSuitcase: false,
    targetItemId: null,
    attentionSpan: 300,
    targetPetId: null,
    socialClaimedBy: null,
    affection: 60,
    ageMs: STARTER_AGE_MS,
    ...overrides,
  }
}

const starterPets: Pet[] = [
  makeStarterPet({
    id: 'pet-1',
    name: 'Whiskers',
    position: { x: 120, y: 90 },
    attentionSpan: 320,
    affection: 65,
    genetics: {
      furColor: homozygous('orange'),
      pattern: homozygous('solid'),
      eyeColor: homozygous('green'),
      size: homozygous('medium'),
    },
  }),
  makeStarterPet({
    id: 'pet-2',
    name: 'Mittens',
    position: { x: 320, y: 140 },
    attentionSpan: 260,
    affection: 40,
    genetics: {
      furColor: homozygous('gray'),
      pattern: homozygous('spotted'),
      eyeColor: homozygous('blue'),
      size: homozygous('small'),
    },
  }),
  makeStarterPet({
    id: 'pet-3',
    name: 'Tom',
    position: { x: 460, y: 60 },
    attentionSpan: 380,
    affection: 80,
    genetics: {
      furColor: homozygous('cream'),
      pattern: homozygous('solid'),
      eyeColor: homozygous('amber'),
      size: homozygous('large'),
    },
  }),
]

function freshStarterPets(): Record<string, Pet> {
  return Object.fromEntries(starterPets.map((pet) => [pet.id, pet]))
}

// Timestamp fields like actionStartedAt are meaningless across a page
// reload (performance.now() resets to ~0 for the new session), so loaded
// pets are reset to a clean idle state rather than resuming mid-animation
// with a stale, session-relative timestamp.
function sanitizeLoadedPet(pet: Pet): Pet {
  return {
    ...pet,
    action: 'idle',
    destination: null,
    actionStartedAt: 0,
    inSuitcase: pet.inSuitcase ?? false,
    targetItemId: null,
    attentionSpan: pet.attentionSpan ?? 300,
    targetPetId: null,
    socialClaimedBy: null,
    affection: pet.affection ?? 60,
    ageMs: pet.ageMs ?? STARTER_AGE_MS,
  }
}

function loadInitialState(): { pets: Record<string, Pet>; sceneItems: Record<string, PlacedItem> } {
  const saved = loadFromLocalStorage()
  if (!saved || Object.keys(saved.pets).length === 0) return { pets: freshStarterPets(), sceneItems: {} }

  const pets: Record<string, Pet> = {}
  for (const id in saved.pets) pets[id] = sanitizeLoadedPet(saved.pets[id])

  const sceneItems: Record<string, PlacedItem> = {}
  for (const id in saved.sceneItems ?? {}) {
    sceneItems[id] = {
      ...saved.sceneItems[id],
      claimedBy: null,
      held: false,
      velocity: { x: 0, y: 0 },
      height: 0,
      verticalVelocity: 0,
    }
  }

  return { pets, sceneItems }
}

const initialState = loadInitialState()

export const usePetStore = create<PetStore>((set) => ({
  pets: initialState.pets,
  sceneItems: initialState.sceneItems,
  tailSegments: {},
  sceneBounds: { width: window.innerWidth, height: window.innerHeight },
  decayAccumulatorMs: 0,
  selectedPetId: null,
  timeScale: 1,

  setTimeScale: (value) => set({ timeScale: value }),
  setSceneBounds: (bounds) => set({ sceneBounds: bounds }),

  // Called every animation frame by the game loop. Needs decay happens in
  // fixed 1-second steps so its rate stays consistent regardless of frame
  // rate; behavior (FSM) and movement run every frame using the real delta,
  // independently for every pet in the record.
  tick: (now, rawDeltaMs) =>
    set((state) => {
      // Every deltaMs-driven effect below (decay, aging, movement, item
      // physics) runs on this scaled value, not the real frame delta —
      // that's the whole simulation speeding up or slowing down uniformly
      // under setTimeScale, while wall-clock action timers (actionStartedAt
      // comparisons against `now`) stay real-time and unaffected.
      const deltaMs = rawDeltaMs * state.timeScale
      let accumulator = state.decayAccumulatorMs + deltaMs
      let pets = state.pets

      while (accumulator >= DECAY_INTERVAL_MS) {
        const next: Record<string, Pet> = {}
        for (const id in pets) next[id] = pets[id].inSuitcase ? pets[id] : applyDecay(pets[id])
        pets = next
        accumulator -= DECAY_INTERVAL_MS
      }

      // Working copy of items, mutated as pets claim/consume them this
      // tick. Processing pets in order (not in parallel) means two pets
      // can't both claim the same item in the same frame.
      const sceneItems: Record<string, PlacedItem> = {}
      for (const itemId in state.sceneItems) {
        const item = state.sceneItems[itemId]
        const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
        sceneItems[itemId] = definition
          ? stepItemPhysics(item, definition.physics, deltaMs, state.sceneBounds)
          : item
      }
      const claimed = new Set<string>()
      for (const itemId in sceneItems) {
        if (sceneItems[itemId].claimedBy) claimed.add(itemId)
      }

      // Cats already being approached by someone (from a previous tick, or
      // newly claimed below) are excluded as candidates for anyone else.
      const socialClaimed = new Set<string>()
      for (const petId in pets) {
        if (pets[petId].socialClaimedBy) socialClaimed.add(petId)
      }
      const newSocialClaims: Record<string, string> = {} // targetPetId -> claimerId

      const moved: Record<string, Pet> = {}
      for (const id in pets) {
        const storedPet = pets[id]
        if (storedPet.inSuitcase) {
          moved[id] = storedPet
          continue
        }
        // Ages only while out of the suitcase, same as needs decay — a
        // cat put away doesn't grow up while it's not being played with.
        const pet = { ...storedPet, ageMs: storedPet.ageMs + deltaMs }

        // Player is holding a pointer down on this cat right now — AI is
        // fully suspended (see behaviorFSM's 'petting' case), and instead
        // it just gains happiness continuously for as long as it's held,
        // at a rate personal to how affectionate this particular cat is.
        if (pet.action === 'petting') {
          const rate = PETTING_BASE_RATE + (pet.affection / 100) * PETTING_AFFECTION_BONUS
          const gained = rate * (deltaMs / 1000)
          moved[id] = { ...pet, needs: { ...pet.needs, happiness: clamp(pet.needs.happiness + gained) } }
          continue
        }

        // Find the single best thing this pet wants right now — an item or
        // another cat — scoring both through the same urgency*proximity
        // function so they compete on equal footing. See attention.ts.
        let bestTarget: AttentionTarget | null = null
        let bestScore = 0

        for (const item of Object.values(sceneItems)) {
          if (claimed.has(item.id)) continue
          const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
          if (!definition) continue
          const urgency = itemUrgency(pet, definition)
          const distance = Math.hypot(item.position.x - pet.position.x, item.position.y - pet.position.y)
          const score = attentionScore(urgency, distance, pet.attentionSpan)
          if (score > bestScore) {
            bestScore = score
            bestTarget = { kind: 'item', id: item.id, position: item.position }
          }
        }

        const ownSocialUrgency = socialUrgency(pet)
        if (ownSocialUrgency > 0) {
          for (const otherId in pets) {
            if (otherId === id || socialClaimed.has(otherId)) continue
            const other = pets[otherId]
            if (other.inSuitcase || other.action === 'held' || other.action === 'playing' || other.action === 'petting')
              continue
            const distance = Math.hypot(other.position.x - pet.position.x, other.position.y - pet.position.y)
            const score = attentionScore(ownSocialUrgency, distance, pet.attentionSpan)
            if (score > bestScore) {
              bestScore = score
              bestTarget = { kind: 'cat', id: otherId, position: other.position }
            }
          }
        }

        let decided = updatePetBehavior(pet, { now, sceneBounds: state.sceneBounds, bestTarget })

        if (decided.targetItemId && decided.targetItemId !== pet.targetItemId) {
          claimed.add(decided.targetItemId)
          const claimedItem = sceneItems[decided.targetItemId]
          if (claimedItem) sceneItems[decided.targetItemId] = { ...claimedItem, claimedBy: id }
        }
        if (decided.targetPetId && decided.targetPetId !== pet.targetPetId) {
          socialClaimed.add(decided.targetPetId)
          newSocialClaims[decided.targetPetId] = id
        }

        // Keep chasing a moving target (e.g. a rolling ball, or a cat that
        // hasn't noticed it's being approached yet) by re-aiming at its
        // current position every frame, rather than the stale spot it was
        // at the moment it got claimed.
        if (decided.action === 'walking' && decided.targetItemId) {
          const target = sceneItems[decided.targetItemId]
          if (target) decided = { ...decided, destination: target.position }
        } else if (decided.action === 'walking' && decided.targetPetId) {
          const target = pets[decided.targetPetId]
          if (target && !target.inSuitcase) {
            decided = { ...decided, destination: { x: target.position.x + 50, y: target.position.y } }
          } else {
            // Target vanished (picked up, put away) — give up and reconsider.
            decided = { ...decided, action: 'idle', destination: null, targetPetId: null }
          }
        }

        let finalPet = movePet(decided, deltaMs)

        // Arrived at a targeted item this tick — use it: apply its effect
        // and switch to an eating/sleeping/playing animation. Consumables
        // (food, toys, grooming) then vanish from the room; furniture
        // (bed, litter box) stays put and just releases its claim so it's
        // free for any cat — including this one — to use again later. If
        // it's still airborne (mid-bounce, or the player just re-threw
        // it), don't "use" something floating above the floor — just give
        // up this attempt and reconsider next cycle.
        if (pet.action === 'walking' && finalPet.action === 'idle' && finalPet.targetItemId) {
          const placedItem = sceneItems[finalPet.targetItemId]
          const definition = placedItem && ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
          if (placedItem && definition && placedItem.height <= 0.5) {
            let needs = finalPet.needs
            for (const key in definition.effect) {
              const need = key as keyof Needs
              const amount = definition.effect[need] ?? 0
              needs = { ...needs, [need]: clamp(needs[need] + amount) }
            }
            const action: ActionState =
              definition.category === 'food' ? 'eating' : definition.category === 'bed' ? 'sleeping' : 'playing'
            finalPet = { ...finalPet, needs, action, targetItemId: null, actionStartedAt: now }
            if (action === 'eating' || action === 'playing') playSound(action)
            if (definition.consumable) {
              delete sceneItems[placedItem.id]
            } else {
              sceneItems[placedItem.id] = { ...placedItem, claimedBy: null }
            }
          } else {
            finalPet = { ...finalPet, targetItemId: null }
          }
        }

        moved[id] = finalPet
      }

      // Apply newly-made social claims so the claimed cat waits in place
      // starting next tick, and shows up excluded for anyone else.
      for (const targetId in newSocialClaims) {
        if (moved[targetId]) moved[targetId] = { ...moved[targetId], socialClaimedBy: newSocialClaims[targetId] }
      }

      // Mutual arrival: a pet that just finished walking toward another cat
      // (rather than an item) triggers shared 'playing' for both of them —
      // this needs the full `moved` record for the OTHER pet, which may not
      // have been processed yet during the loop above, so it's a separate
      // pass over the now-complete result.
      for (const id in moved) {
        const before = pets[id]
        const after = moved[id]
        if (before?.action === 'walking' && after.action === 'idle' && after.targetPetId) {
          const partner = moved[after.targetPetId]
          if (partner && !partner.inSuitcase && partner.action !== 'held' && partner.action !== 'playing') {
            playSound('playing')
            moved[id] = {
              ...after,
              action: 'playing',
              actionStartedAt: now,
              needs: { ...after.needs, happiness: clamp(after.needs.happiness + SOCIAL_HAPPINESS_BOOST) },
            }
            moved[after.targetPetId] = {
              ...partner,
              action: 'playing',
              actionStartedAt: now,
              targetPetId: id,
              socialClaimedBy: null,
              needs: { ...partner.needs, happiness: clamp(partner.needs.happiness + SOCIAL_HAPPINESS_BOOST) },
            }
          } else {
            moved[id] = { ...after, targetPetId: null }
          }
        }
      }

      // Tail physics run every frame for every non-suitcased pet, regardless
      // of whether that pet actually moved this tick — see tailPhysics.ts.
      // getTailAnchorLocal is facing-aware (mirrors the attach point itself
      // for a left-facing cat), so the anchor a facing-flipped cat's chain
      // follows jumps straight to the correct side the same tick facing
      // changes — the chain's own easing then carries the segments there
      // smoothly, the same as it handles any other anchor movement, with
      // no separate one-shot correction needed at the flip instant.
      const tailSegments: Record<string, Point[]> = {}
      for (const id in moved) {
        if (moved[id].inSuitcase) continue
        const pet = moved[id]
        const anchorLocal = getTailAnchorLocal(pet, now)
        const anchorWorld = { x: pet.position.x + anchorLocal.x, y: pet.position.y + anchorLocal.y }

        const segments = state.tailSegments[id] ?? initialSegments(anchorWorld, TAIL_SEGMENTS, TAIL_LINK_LENGTH)
        tailSegments[id] = stepChain(segments, anchorWorld, TAIL_LINK_LENGTH)
      }

      return { pets: moved, sceneItems, decayAccumulatorMs: accumulator, tailSegments }
    }),

  selectPet: (petId) => set({ selectedPetId: petId }),

  startDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: { ...pets, [petId]: { ...pets[petId], action: 'held', destination: null, targetItemId: null, targetPetId: null } },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
      }
    }),

  startPetting: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet || pet.inSuitcase) return state
      // An aloof cat (low affection) doesn't purr for it — a single hiss
      // instead, a small audio payoff for the personality trait.
      if (pet.affection < 25) {
        playSound('hiss')
      } else {
        startLoop(petId, 'purrLoop', 0.35)
      }
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: { ...pets, [petId]: { ...pets[petId], action: 'petting', destination: null, targetItemId: null, targetPetId: null } },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
      }
    }),

  endPetting: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      stopLoop(petId)
      if (!pet || pet.action !== 'petting') return state
      return { pets: { ...state.pets, [petId]: { ...pet, action: 'idle', actionStartedAt: performance.now() } } }
    }),

  dragPetTo: (petId, x, y) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return { pets: { ...state.pets, [petId]: { ...pet, position: { x, y } } } }
    }),

  endDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet || pet.action !== 'held') return state
      return {
        pets: { ...state.pets, [petId]: { ...pet, action: 'idle', actionStartedAt: performance.now() } },
      }
    }),

  putPetInSuitcase: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: {
          ...pets,
          [petId]: {
            ...pets[petId],
            inSuitcase: true,
            action: 'idle',
            destination: null,
            targetItemId: null,
            targetPetId: null,
          },
        },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
        selectedPetId: state.selectedPetId === petId ? null : state.selectedPetId,
      }
    }),

  takePetFromSuitcase: (petId, position) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return {
        pets: {
          ...state.pets,
          [petId]: { ...pet, inSuitcase: false, position, action: 'idle', actionStartedAt: performance.now() },
        },
      }
    }),

  placeItem: (itemTypeId, position) =>
    set((state) => {
      const id = nanoid()
      // A small starting height so every placed item visibly drops onto
      // the floor rather than just appearing there — reinforces that it
      // actually exists in the room's space, not just painted on the rug.
      const placedItem: PlacedItem = {
        id,
        itemTypeId,
        position,
        height: PLACE_DROP_HEIGHT,
        velocity: { x: 0, y: 0 },
        verticalVelocity: 0,
        claimedBy: null,
        held: false,
      }
      return { sceneItems: { ...state.sceneItems, [id]: placedItem } }
    }),

  startDragItem: (itemId) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      return {
        sceneItems: {
          ...state.sceneItems,
          [itemId]: { ...item, held: true, velocity: { x: 0, y: 0 }, height: 0, verticalVelocity: 0, claimedBy: null },
        },
      }
    }),

  dragItemTo: (itemId, x, y) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      const position = clampToRoom({ x, y }, state.sceneBounds)
      return { sceneItems: { ...state.sceneItems, [itemId]: { ...item, position } } }
    }),

  // `throwVelocity` is the raw swipe velocity computed from the pointer
  // drag. Heavier items get proportionally less speed from the same
  // swipe, and every throw gets some automatic upward lift (like a real
  // toss) so it arcs up and falls back down under gravity instead of
  // sliding flat along the floor.
  endDragItem: (itemId, throwVelocity) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
      const mass = definition?.physics.mass ?? 1

      const vx = throwVelocity.x / mass
      const vy = throwVelocity.y / mass
      const horizontalSpeed = Math.hypot(vx, vy)
      const verticalVelocity = Math.min(horizontalSpeed * LIFT_RATIO, MAX_LIFT)

      return {
        sceneItems: {
          ...state.sceneItems,
          [itemId]: { ...item, held: false, velocity: { x: vx, y: vy }, verticalVelocity },
        },
      }
    }),

  breedPets: (parentAId, parentBId) =>
    set((state) => {
      const parentA = state.pets[parentAId]
      const parentB = state.pets[parentBId]
      if (!parentA || !parentB || parentA.id === parentB.id) return state

      const genetics: Genetics = breedGenetics(parentA.genetics, parentB.genetics)
      const id = nanoid()
      const kitten: Pet = {
        id,
        name: 'New Kitten',
        needs: { hunger: 80, energy: 80, hygiene: 80, happiness: 80 },
        position: {
          x: (parentA.position.x + parentB.position.x) / 2,
          y: (parentA.position.y + parentB.position.y) / 2,
        },
        destination: null,
        action: 'idle',
        facing: 'right',
        actionStartedAt: performance.now(),
        genetics,
        parentIds: [parentA.id, parentB.id],
        inSuitcase: false,
        targetItemId: null,
        // Not part of the formal genetics system — just a simple average
        // of the parents' attention spans with a little random variation,
        // enough for kittens to feel like they take after their parents.
        attentionSpan: clampAttentionSpan((parentA.attentionSpan + parentB.attentionSpan) / 2 + (Math.random() * 60 - 30)),
        targetPetId: null,
        socialClaimedBy: null,
        // Same light inheritance-with-variance pattern as attentionSpan.
        affection: clamp((parentA.affection + parentB.affection) / 2 + (Math.random() * 30 - 15)),
        // A real newborn — starts life as a kitten and grows up in real
        // time, unlike its already-grown parents.
        ageMs: 0,
      }

      return {
        pets: { ...state.pets, [id]: kitten },
        selectedPetId: id,
      }
    }),

  renamePet: (petId, name) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return { pets: { ...state.pets, [petId]: { ...pet, name } } }
    }),

  resetGame: () => {
    clearSavedGame()
    stopAllLoops()
    set({ pets: freshStarterPets(), sceneItems: {}, tailSegments: {}, selectedPetId: null })
  },
}))

// Autosave. tick() calls set() up to 60x/sec, so saving on every single
// state change would hammer localStorage — instead this throttles actual
// writes to at most once every 2 real seconds.
let lastSaveAt = 0
usePetStore.subscribe((state) => {
  const now = Date.now()
  if (now - lastSaveAt < 2000) return
  lastSaveAt = now
  saveToLocalStorage(state.pets, state.sceneItems)
})
