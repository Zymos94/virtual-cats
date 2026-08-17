import type { ItemDefinition } from '../types/item'

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  {
    id: 'kibble',
    name: 'Kibble',
    category: 'food',
    icon: '🐟',
    effect: { hunger: 30 },
    physics: { mass: 1, friction: 0.95, bounciness: 0 },
  },
  {
    id: 'cake',
    name: 'Cake',
    category: 'food',
    icon: '🍰',
    effect: { hunger: 15, happiness: 10 },
    physics: { mass: 1.1, friction: 0.95, bounciness: 0 },
  },
  {
    id: 'ball',
    name: 'Ball',
    category: 'toy',
    icon: '🎾',
    effect: { happiness: 25, energy: -10 },
    physics: { mass: 0.5, friction: 0.15, bounciness: 0.55 },
  },
  {
    id: 'feather',
    name: 'Feather Wand',
    category: 'toy',
    icon: '🪶',
    effect: { happiness: 20, energy: -5 },
    physics: { mass: 0.7, friction: 0.45, bounciness: 0.1 },
  },
  {
    id: 'brush',
    name: 'Brush',
    category: 'grooming',
    icon: '🧹',
    effect: { hygiene: 40 },
    physics: { mass: 1.2, friction: 0.25, bounciness: 0 },
  },
]
