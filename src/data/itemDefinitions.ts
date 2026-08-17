import type { ItemDefinition } from '../types/item'

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  { id: 'kibble', name: 'Kibble', category: 'food', icon: '🐟', effect: { hunger: 30 } },
  { id: 'cake', name: 'Cake', category: 'food', icon: '🍰', effect: { hunger: 15, happiness: 10 } },
  { id: 'ball', name: 'Ball', category: 'toy', icon: '🎾', effect: { happiness: 25, energy: -10 }, physics: true },
  { id: 'feather', name: 'Feather Wand', category: 'toy', icon: '🪶', effect: { happiness: 20, energy: -5 } },
  { id: 'brush', name: 'Brush', category: 'grooming', icon: '🧹', effect: { hygiene: 40 } },
]
