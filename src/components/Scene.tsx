import type { Pet } from '../types/pet'
import { PetSprite } from './PetSprite'

interface SceneProps {
  pets: Pet[]
}

export function Scene({ pets }: SceneProps) {
  return (
    <div className="scene">
      {pets.map((pet) => (
        <PetSprite key={pet.id} pet={pet} />
      ))}
    </div>
  )
}
