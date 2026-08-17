import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ActionState, Needs, Pet } from '../types/pet'
import type { Genetics } from '../types/genetics'
import { updatePetBehavior } from '../game/behaviorFSM'
import { movePet } from '../game/movement'
import { breedGenetics } from '../game/genetics'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { clearSavedGame, loadFromLocalStorage, saveToLocalStorage } from './persist'

interface PetStore {
  pets: Record<string, Pet>
  sceneBounds: { width: number; height: number }
  decayAccumulatorMs: number
  selectedPetId: string | null
  tick: (now: number, deltaMs: number) => void
  setSceneBounds: (bounds: { width: number; height: number }) => void
  selectPet: (petId: string | null) => void
  startDragPet: (petId: string) => void
  dragPetTo: (petId: string, x: number, y: number) => void
  endDragPet: (petId: string) => void
  useItem: (petId: string, itemId: string) => void
  breedPets: (parentAId: string, parentBId: string) => void
  renamePet: (petId: string, name: string) => void
  resetGame: () => void
}

const DECAY_INTERVAL_MS = 1000
const DECAY_PER_SECOND: Needs = { hunger: -0.5, energy: -0.3, hygiene: -0.2, happiness: -0.2 }

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
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
  return { ...pet, action: 'idle', destination: null, actionStartedAt: 0 }
}

function loadInitialPets(): Record<string, Pet> {
  const saved = loadFromLocalStorage()
  if (!saved || Object.keys(saved).length === 0) return freshStarterPets()

  const sanitized: Record<string, Pet> = {}
  for (const id in saved) sanitized[id] = sanitizeLoadedPet(saved[id])
  return sanitized
}

export const usePetStore = create<PetStore>((set) => ({
  pets: loadInitialPets(),
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
        for (const id in pets) next[id] = applyDecay(pets[id])
        pets = next
        accumulator -= DECAY_INTERVAL_MS
      }

      const moved: Record<string, Pet> = {}
      for (const id in pets) {
        const decided = updatePetBehavior(pets[id], { now, sceneBounds: state.sceneBounds })
        moved[id] = movePet(decided, deltaMs)
      }

      return { pets: moved, decayAccumulatorMs: accumulator }
    }),

  selectPet: (petId) => set({ selectedPetId: petId }),

  startDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return { pets: { ...state.pets, [petId]: { ...pet, action: 'held', destination: null } } }
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

  useItem: (petId, itemId) =>
    set((state) => {
      const item = ITEM_DEFINITIONS.find((definition) => definition.id === itemId)
      const pet = state.pets[petId]
      if (!item || !pet) return state

      let needs = pet.needs
      for (const key in item.effect) {
        const need = key as keyof Needs
        const amount = item.effect[need] ?? 0
        needs = { ...needs, [need]: clamp(needs[need] + amount) }
      }

      const action: ActionState = item.category === 'food' ? 'eating' : 'playing'

      return {
        pets: {
          ...state.pets,
          [petId]: { ...pet, needs, action, actionStartedAt: performance.now() },
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
    set({ pets: freshStarterPets(), selectedPetId: null })
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
  saveToLocalStorage(state.pets)
})
