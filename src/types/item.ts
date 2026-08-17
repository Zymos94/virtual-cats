import type { Needs } from './pet'

export type ItemCategory = 'food' | 'toy' | 'grooming'

export interface ItemDefinition {
  id: string
  name: string
  category: ItemCategory
  icon: string // emoji placeholder — no art assets needed for this
  effect: Partial<Needs>
  // Rolls with velocity/friction/wall-bounce and can be picked up and
  // thrown once placed, instead of just sitting still until a cat uses it.
  physics?: boolean
}

// An actual instance of an item dropped in the room, as opposed to
// ItemDefinition which is just the static catalog entry it was made from.
export interface PlacedItem {
  id: string
  itemTypeId: string // references ItemDefinition.id
  position: { x: number; y: number }
  // The id of the pet currently walking toward/using this item, if any —
  // a simple exclusivity lock so two cats don't both beeline for the same
  // dropped item.
  claimedBy: string | null
  // Only meaningful for physics-enabled items (e.g. the ball).
  velocity: { x: number; y: number }
  held: boolean
}
