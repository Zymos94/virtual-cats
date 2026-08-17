import type { Needs } from './pet'

export type ItemCategory = 'food' | 'toy' | 'grooming'

// Every item has physical characteristics — not just the ball. Future
// items just need a profile, not new code: a cat bed is heavy/high-friction
// so it barely slides and never bounces; a brush is light and slides
// further before friction stops it; the ball is light and bouncy.
export interface PhysicsProfile {
  mass: number // heavier items get less velocity from the same throw swipe
  friction: number // 0-1, fraction of ground speed lost per second while resting on the floor
  bounciness: number // 0-1, fraction of speed kept after a floor/wall bounce — 0 means it just lands and stops
}

export interface ItemDefinition {
  id: string
  name: string
  category: ItemCategory
  icon: string // emoji placeholder — no art assets needed for this
  effect: Partial<Needs>
  physics: PhysicsProfile
}

// An actual instance of an item dropped in the room, as opposed to
// ItemDefinition which is just the static catalog entry it was made from.
export interface PlacedItem {
  id: string
  itemTypeId: string // references ItemDefinition.id
  // Ground position — where the item sits/rolls on the floor. `height` is
  // layered on top of this for the pseudo-3D up-in-the-air effect, so this
  // stays within the floor plane's bounds even mid-throw.
  position: { x: number; y: number }
  height: number // elevation above `position`, 0 = resting on the floor
  velocity: { x: number; y: number } // ground (horizontal) velocity
  verticalVelocity: number // height-axis velocity — negative once gravity takes over
  // The id of the pet currently walking toward/using this item, if any —
  // a simple exclusivity lock so two cats don't both beeline for the same
  // dropped item.
  claimedBy: string | null
  held: boolean
}
