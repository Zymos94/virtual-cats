import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ActionState, Needs, Pet } from '../types/pet'
import type { Genetics } from '../types/genetics'
import type { PlacedItem } from '../types/item'
import { updatePetBehavior } from '../game/behaviorFSM'
import { movePet } from '../game/movement'
import { breedGenetics } from '../game/genetics'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { ITEM_PERCEPTION_RADIUS, wantsItem } from '../game/itemWants'
import { clampToRoom, stepItemPhysics } from '../game/itemPhysics'
import { clearSavedGame, loadFromLocalStorage, saveToLocalStorage } from './persist'
import { getTailAnchorLocal } from '../game/tailMood'
import { initialSegments, mirrorSegments, stepChain, type Point } from '../game/tailPhysics'
import { SVG_WIDTH, TAIL_LINK_LENGTH, TAIL_SEGMENTS } from '../game/spriteConstants'

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
  tick: (now: number, deltaMs: number) => void
  setSceneBounds: (bounds: { width: number; height: number }) => void
  selectPet: (petId: string | null) => void
  startDragPet: (petId: string) => void
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
const DECAY_PER_SECOND: Needs = { hunger: -0.5, energy: -0.3, hygiene: -0.2, happiness: -0.2 }

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function releaseClaim(
  sceneItems: Record<string, PlacedItem>,
  itemId: string | null,
): Record<string, PlacedItem> {
  if (!itemId || !sceneItems[itemId]) return sceneItems
  return { ...sceneItems, [itemId]: { ...sceneItems[itemId], claimedBy: null } }
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
    ...overrides,
  }
}

const starterPets: Pet[] = [
  makeStarterPet({
    id: 'pet-1',
    name: 'Whiskers',
    position: { x: 120, y: 90 },
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
  }
}

function loadInitialState(): { pets: Record<string, Pet>; sceneItems: Record<string, PlacedItem> } {
  const saved = loadFromLocalStorage()
  if (!saved || Object.keys(saved.pets).length === 0) return { pets: freshStarterPets(), sceneItems: {} }

  const pets: Record<string, Pet> = {}
  for (const id in saved.pets) pets[id] = sanitizeLoadedPet(saved.pets[id])

  const sceneItems: Record<string, PlacedItem> = {}
  for (const id in saved.sceneItems ?? {}) {
    sceneItems[id] = { ...saved.sceneItems[id], claimedBy: null, held: false, velocity: { x: 0, y: 0 } }
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

  setSceneBounds: (bounds) => set({ sceneBounds: bounds }),

  // Called every animation frame by the game loop. Needs decay happens in
  // fixed 1-second steps so its rate stays consistent regardless of frame
  // rate; behavior (FSM) and movement run every frame using the real delta,
  // independently for every pet in the record.
  tick: (now, deltaMs) =>
    set((state) => {
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
        sceneItems[itemId] = definition?.physics ? stepItemPhysics(item, deltaMs, state.sceneBounds) : item
      }
      const claimed = new Set<string>()
      for (const itemId in sceneItems) {
        if (sceneItems[itemId].claimedBy) claimed.add(itemId)
      }

      const moved: Record<string, Pet> = {}
      for (const id in pets) {
        const pet = pets[id]
        if (pet.inSuitcase) {
          moved[id] = pet
          continue
        }

        const nearbyWantedItems = Object.values(sceneItems)
          .filter((item) => !claimed.has(item.id))
          .filter((item) => {
            const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
            if (!definition || !wantsItem(pet, definition)) return false
            return Math.hypot(item.position.x - pet.position.x, item.position.y - pet.position.y) < ITEM_PERCEPTION_RADIUS
          })
          .sort(
            (a, b) =>
              Math.hypot(a.position.x - pet.position.x, a.position.y - pet.position.y) -
              Math.hypot(b.position.x - pet.position.x, b.position.y - pet.position.y),
          )

        let decided = updatePetBehavior(pet, { now, sceneBounds: state.sceneBounds, nearbyWantedItems })

        if (decided.targetItemId && decided.targetItemId !== pet.targetItemId) {
          claimed.add(decided.targetItemId)
          const claimedItem = sceneItems[decided.targetItemId]
          if (claimedItem) sceneItems[decided.targetItemId] = { ...claimedItem, claimedBy: id }
        }

        // Keep chasing a moving target (e.g. a rolling ball) by re-aiming
        // at its current position every frame, rather than the stale spot
        // it was at the moment it got claimed.
        if (decided.action === 'walking' && decided.targetItemId) {
          const target = sceneItems[decided.targetItemId]
          if (target) decided = { ...decided, destination: target.position }
        }

        let finalPet = movePet(decided, deltaMs)

        // Arrived at a targeted item this tick — consume it: apply its
        // effect, switch to an eating/playing animation, and remove it
        // from the room.
        if (pet.action === 'walking' && finalPet.action === 'idle' && finalPet.targetItemId) {
          const placedItem = sceneItems[finalPet.targetItemId]
          const definition = placedItem && ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
          if (placedItem && definition) {
            let needs = finalPet.needs
            for (const key in definition.effect) {
              const need = key as keyof Needs
              const amount = definition.effect[need] ?? 0
              needs = { ...needs, [need]: clamp(needs[need] + amount) }
            }
            const action: ActionState = definition.category === 'food' ? 'eating' : 'playing'
            finalPet = { ...finalPet, needs, action, targetItemId: null, actionStartedAt: now }
            delete sceneItems[placedItem.id]
          } else {
            finalPet = { ...finalPet, targetItemId: null }
          }
        }

        moved[id] = finalPet
      }

      // Tail physics run every frame for every non-suitcased pet, regardless
      // of whether that pet actually moved this tick — see tailPhysics.ts.
      const tailSegments: Record<string, Point[]> = {}
      for (const id in moved) {
        if (moved[id].inSuitcase) continue
        const pet = moved[id]
        const previousPet = state.pets[id]
        const anchorLocal = getTailAnchorLocal(pet)
        const anchorWorld = { x: pet.position.x + anchorLocal.x, y: pet.position.y + anchorLocal.y }

        let segments = state.tailSegments[id] ?? initialSegments(anchorWorld, TAIL_SEGMENTS, TAIL_LINK_LENGTH)
        if (previousPet && previousPet.facing !== pet.facing) {
          segments = mirrorSegments(segments, pet.position.x, SVG_WIDTH)
        }
        tailSegments[id] = stepChain(segments, anchorWorld, TAIL_LINK_LENGTH)
      }

      return { pets: moved, sceneItems, decayAccumulatorMs: accumulator, tailSegments }
    }),

  selectPet: (petId) => set({ selectedPetId: petId }),

  startDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return {
        pets: { ...state.pets, [petId]: { ...pet, action: 'held', destination: null, targetItemId: null } },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
      }
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
      return {
        pets: {
          ...state.pets,
          [petId]: { ...pet, inSuitcase: true, action: 'idle', destination: null, targetItemId: null },
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
      const placedItem: PlacedItem = { id, itemTypeId, position, claimedBy: null, velocity: { x: 0, y: 0 }, held: false }
      return { sceneItems: { ...state.sceneItems, [id]: placedItem } }
    }),

  startDragItem: (itemId) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      return {
        sceneItems: { ...state.sceneItems, [itemId]: { ...item, held: true, velocity: { x: 0, y: 0 }, claimedBy: null } },
      }
    }),

  dragItemTo: (itemId, x, y) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      const position = clampToRoom({ x, y }, state.sceneBounds)
      return { sceneItems: { ...state.sceneItems, [itemId]: { ...item, position } } }
    }),

  endDragItem: (itemId, velocity) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      return { sceneItems: { ...state.sceneItems, [itemId]: { ...item, held: false, velocity } } }
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
