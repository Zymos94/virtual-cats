import { create } from 'zustand'
import type { Needs, Pet } from '../types/pet'

interface PetStore {
  pets: Record<string, Pet>
  decayAccumulatorMs: number
  tick: (deltaMs: number) => void
  feedPet: (petId: string) => void
  cleanPet: (petId: string) => void
  playWithPet: (petId: string) => void
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

function boostNeed(pet: Pet, need: keyof Needs, amount: number): Pet {
  return {
    ...pet,
    needs: { ...pet.needs, [need]: clamp(pet.needs[need] + amount) },
  }
}

const starterPet: Pet = {
  id: 'pet-1',
  name: 'Whiskers',
  needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
  position: { x: 150, y: 100 },
  action: 'idle',
}

export const usePetStore = create<PetStore>((set) => ({
  pets: { [starterPet.id]: starterPet },
  decayAccumulatorMs: 0,

  // Called every animation frame by the game loop. Needs decay in fixed
  // 1-second steps so the rate stays consistent regardless of frame rate.
  tick: (deltaMs) =>
    set((state) => {
      let accumulator = state.decayAccumulatorMs + deltaMs
      let pets = state.pets

      while (accumulator >= DECAY_INTERVAL_MS) {
        const next: Record<string, Pet> = {}
        for (const id in pets) next[id] = applyDecay(pets[id])
        pets = next
        accumulator -= DECAY_INTERVAL_MS
      }

      return { pets, decayAccumulatorMs: accumulator }
    }),

  feedPet: (petId) =>
    set((state) => ({
      pets: { ...state.pets, [petId]: boostNeed(state.pets[petId], 'hunger', 30) },
    })),

  cleanPet: (petId) =>
    set((state) => ({
      pets: { ...state.pets, [petId]: boostNeed(state.pets[petId], 'hygiene', 40) },
    })),

  playWithPet: (petId) =>
    set((state) => ({
      pets: {
        ...state.pets,
        [petId]: boostNeed(boostNeed(state.pets[petId], 'happiness', 25), 'energy', -10),
      },
    })),
}))
