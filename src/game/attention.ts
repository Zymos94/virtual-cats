import type { Needs, Pet } from '../types/pet'
import type { ItemCategory, ItemDefinition } from '../types/item'
import type { MouseState } from '../types/mouse'

const WANT_THRESHOLD = 60
const SOCIAL_HAPPINESS_THRESHOLD = 70

export interface AttentionTarget {
  kind: 'item' | 'cat' | 'mouse'
  id: string
  position: { x: number; y: number }
}

// Which need a given category of item addresses — grooming and the
// litter box both land on hygiene, everything else gets its own. 'prey'
// and 'hole' never reach here — see itemUrgency below.
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
// already satisfied, otherwise larger the more urgent it is. 'prey' (the
// mouse, mid-drop before it converts to an autonomous Mouse — see
// petStore.tick()) is excluded outright rather than falling into a
// needKeyForCategory default.
export function itemUrgency(pet: Pet, definition: ItemDefinition): number {
  if (definition.category === 'prey') return 0
  const value = pet.needs[needKeyForCategory(definition.category)]
  return value >= WANT_THRESHOLD ? 0 : WANT_THRESHOLD - value
}

// How eager a pet is to chase a particular mouse right now — depends on
// the mouse's own state, not just the cat's mood. A sneaking mouse mostly
// reads as "not worth the effort" (scaled well down, and only through the
// normal happiness-driven want) — the whole point of sneaking is to stay
// beneath notice. The moment it's fleeing, that's flipped: a visibly
// bolting creature is hard for *any* cat to ignore, so this jumps to a
// flat, mood-independent value — the double-edged sword of escaping the
// one cat that spooked it by running, which is exactly what's likely to
// pull in every *other* nearby cat too.
const MOUSE_SNEAKING_URGENCY_SCALE = 0.4
const MOUSE_FLEEING_URGENCY = 45

export function mouseUrgency(pet: Pet, mouseState: MouseState): number {
  if (mouseState === 'fleeing') return MOUSE_FLEEING_URGENCY
  const base = pet.needs.happiness >= WANT_THRESHOLD ? 0 : WANT_THRESHOLD - pet.needs.happiness
  return base * MOUSE_SNEAKING_URGENCY_SCALE
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
