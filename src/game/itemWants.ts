import type { Pet } from '../types/pet'
import type { ItemDefinition } from '../types/item'

// How far a pet can notice a dropped item it wants. Generous, since rooms
// are full-screen and can be large. A real attention-span stat (M14)
// replaces this fixed constant with something per-pet and tunable.
export const ITEM_PERCEPTION_RADIUS = 400

const WANT_THRESHOLD = 60

export function wantsItem(pet: Pet, definition: ItemDefinition): boolean {
  if (definition.category === 'food') return pet.needs.hunger < WANT_THRESHOLD
  if (definition.category === 'toy') return pet.needs.happiness < WANT_THRESHOLD
  if (definition.category === 'grooming') return pet.needs.hygiene < WANT_THRESHOLD
  return false
}
