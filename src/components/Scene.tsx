import type { Pet } from '../types/pet'
import { PetSprite } from './PetSprite'

interface SceneProps {
  pets: Pet[]
  selectedPetId: string | null
}

export function Scene({ pets, selectedPetId }: SceneProps) {
  return (
    <div className="scene">
      {pets.map((pet) => (
        <PetSprite key={pet.id} pet={pet} selected={pet.id === selectedPetId} />
      ))}
    </div>
  )
}
