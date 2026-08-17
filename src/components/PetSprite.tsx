import type { Pet } from '../types/pet'

interface PetSpriteProps {
  pet: Pet
}

// Placeholder art: a colored square standing in for a real sprite sheet.
// Swapped for actual pixel art once the animation system lands (M3).
export function PetSprite({ pet }: PetSpriteProps) {
  return (
    <div
      className="pet-sprite"
      style={{ left: pet.position.x, top: pet.position.y }}
      title={pet.name}
    />
  )
}
