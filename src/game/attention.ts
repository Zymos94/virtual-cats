import type { Needs, Pet } from '../types/pet'
import type { ItemCategory, ItemDefinition } from '../types/item'

const WANT_THRESHOLD = 60
const SOCIAL_HAPPINESS_THRESHOLD = 70

export interface AttentionTarget {
  kind: 'item' | 'cat'
  id: string
  position: { x: number; y: number }
}

// Which need a given category of item addresses — grooming and the
// litter box both land on hygiene, everything else gets its own.
function needKeyForCategory(category: ItemCategory): keyof Needs {
  switch (category) {
    case 'food':
      return 'hunger'
    case 'toy':
      return 'happiness'
    case 'bed':
      return 'energy'
    case 'grooming':
    case 'litterbox':
    default:
      return 'hygiene'
  }
}

// How much a pet currently wants a given item — 0 if the relevant need is
// already satisfied, otherwise larger the more urgent it is.
export function itemUrgency(pet: Pet, definition: ItemDefinition): number {
  const value = pet.needs[needKeyForCategory(definition.category)]
  return value >= WANT_THRESHOLD ? 0 : WANT_THRESHOLD - value
}

// How much a pet currently wants company. Only the seeking pet's own
// urgency factors in — the other cat just needs to be free to engage
// (checked separately), not also unhappy.
export function socialUrgency(pet: Pet): number {
  return pet.needs.happiness >= SOCIAL_HAPPINESS_THRESHOLD
    ? 0
    : SOCIAL_HAPPINESS_THRESHOLD - pet.needs.happiness
}

// Combines "how much do I want this" with "how close is it" into a single
// comparable score, within this pet's personal attention span. Items and
// cats both get scored through this same function so they compete on
// equal footing for a pet's attention.
export function attentionScore(urgency: number, distance: number, attentionSpan: number): number {
  if (urgency <= 0 || distance >= attentionSpan) return 0
  return urgency * (1 - distance / attentionSpan)
}
