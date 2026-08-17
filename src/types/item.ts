import type { Needs } from './pet'

export type ItemCategory = 'food' | 'toy' | 'grooming'

export interface ItemDefinition {
  id: string
  name: string
  category: ItemCategory
  icon: string // emoji placeholder — no art assets needed for this
  effect: Partial<Needs>
}
