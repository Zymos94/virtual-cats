import type { ItemDefinition } from '../types/item'

export const ITEM_DEFINITIONS: ItemDefinition[] = [
  {
    id: 'kibble',
    name: 'Kibble',
    category: 'food',
    icon: '🐟',
    effect: { hunger: 30 },
    physics: { mass: 1, friction: 0.95, bounciness: 0 },
    consumable: true,
  },
  {
    id: 'cake',
    name: 'Cake',
    category: 'food',
    icon: '🍰',
    effect: { hunger: 15, happiness: 10 },
    physics: { mass: 1.1, friction: 0.95, bounciness: 0 },
    consumable: true,
  },
  {
    id: 'ball',
    name: 'Ball',
    category: 'toy',
    icon: '🎾',
    effect: { happiness: 25, energy: -10 },
    // Friction is per-second speed loss while rolling on the floor (air
    // travel is friction-free — see itemPhysics.ts). 0.55 lets the ball
    // roll out visibly further than anything else here without the
    // near-frictionless 0.15 it used to have, where any leftover speed
    // rolled for twenty-plus seconds and the whole width of the room.
    physics: { mass: 0.5, friction: 0.55, bounciness: 0.55 },
    consumable: true,
  },
  {
    id: 'feather',
    name: 'Feather Wand',
    category: 'toy',
    icon: '🪶',
    effect: { happiness: 20, energy: -5 },
    physics: { mass: 0.7, friction: 0.75, bounciness: 0.1 },
    consumable: true,
  },
  {
    id: 'brush',
    name: 'Brush',
    category: 'grooming',
    icon: '🧹',
    effect: { hygiene: 40 },
    physics: { mass: 1.2, friction: 0.8, bounciness: 0 },
    consumable: true,
  },
  {
    id: 'bed',
    name: 'Cat Bed',
    category: 'bed',
    icon: '🛏️',
    effect: { energy: 40 },
    // Heavy and high-friction — barely budges from a throw/drag swipe,
    // the way a piece of furniture should feel next to a rolling ball.
    physics: { mass: 3, friction: 0.9, bounciness: 0 },
    consumable: false,
  },
  {
    id: 'litterbox',
    name: 'Litter Box',
    category: 'litterbox',
    icon: '🚽',
    effect: { hygiene: 50 },
    physics: { mass: 2.5, friction: 0.9, bounciness: 0 },
    consumable: false,
  },
  {
    id: 'mouse',
    name: 'Mouse',
    category: 'prey',
    icon: '🐭',
    // No need-effect at all — a cat never "consumes" this the normal way.
    // Once it lands (see petStore.tick()'s prey-conversion step), the
    // PlacedItem is deleted and replaced by an autonomous Mouse entity;
    // everything past that point is stalk/pounce/catch, not item urgency.
    effect: {},
    physics: { mass: 0.3, friction: 0.85, bounciness: 0.2 },
    consumable: false,
  },
  {
    id: 'mousehole',
    name: 'Mouse Hole',
    category: 'hole',
    icon: '🕳️',
    // Furniture, not something a cat ever walks up to and uses — it's
    // purely a destination a fleeing mouse heads for (see mouseBehavior.ts
    // and petStore.tick()'s despawn check).
    effect: {},
    physics: { mass: 3, friction: 0.9, bounciness: 0 },
    consumable: false,
  },
]
