import { create } from 'zustand'
import type { ActionState, Needs, Pet } from '../types/pet'
import { updatePetBehavior } from '../game/behaviorFSM'
import { movePet } from '../game/movement'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'

interface PetStore {
  pets: Record<string, Pet>
  sceneBounds: { width: number; height: number }
  decayAccumulatorMs: number
  selectedPetId: string | null
  tick: (now: number, deltaMs: number) => void
  selectPet: (petId: string | null) => void
  useItem: (petId: string, itemId: string) => void
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

function makeStarterPet(overrides: Pick<Pet, 'id' | 'name' | 'position' | 'color'> & Partial<Pet>): Pet {
  return {
    needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
    destination: null,
    action: 'idle',
    facing: 'right',
    actionStartedAt: 0,
    ...overrides,
  }
}

const starterPets: Pet[] = [
  makeStarterPet({
    id: 'pet-1',
    name: 'Whiskers',
    position: { x: 120, y: 90 },
    color: { body: '#d98a4f', stroke: '#8a5327' },
  }),
  makeStarterPet({
    id: 'pet-2',
    name: 'Mittens',
    position: { x: 320, y: 140 },
    color: { body: '#9a9a9a', stroke: '#4d4d4d' },
  }),
  makeStarterPet({
    id: 'pet-3',
    name: 'Tom',
    position: { x: 460, y: 60 },
    color: { body: '#e8c96b', stroke: '#8f7327' },
  }),
]

export const usePetStore = create<PetStore>((set) => ({
  pets: Object.fromEntries(starterPets.map((pet) => [pet.id, pet])),
  sceneBounds: { width: 600, height: 320 },
  decayAccumulatorMs: 0,
  selectedPetId: null,

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
}))
