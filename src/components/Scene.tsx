import type { Pet } from '../types/pet'
import type { PlacedItem } from '../types/item'
import { PetSprite } from './PetSprite'
import { ItemSprite } from './ItemSprite'

interface SceneProps {
  pets: Pet[]
  placedItems: PlacedItem[]
  selectedPetId: string | null
}

export function Scene({ pets, placedItems, selectedPetId }: SceneProps) {
  return (
    <div className="scene">
      {placedItems.map((item) => (
        <ItemSprite key={item.id} placedItem={item} />
      ))}
      {pets.map((pet) => (
        <PetSprite key={pet.id} pet={pet} selected={pet.id === selectedPetId} />
      ))}
    </div>
  )
}
