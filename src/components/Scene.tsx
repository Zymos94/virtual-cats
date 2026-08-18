import type { Pet } from '../types/pet'
import type { PlacedItem } from '../types/item'
import type { Mouse } from '../types/mouse'
import { PetSprite } from './PetSprite'
import { ItemSprite } from './ItemSprite'
import { MouseSprite } from './MouseSprite'
import { MouseHoleSprite } from './MouseHoleSprite'

interface SceneProps {
  pets: Pet[]
  placedItems: PlacedItem[]
  mice: Mouse[]
  sceneBounds: { width: number; height: number }
  selectedPetId: string | null
  mouseHolePeeking: boolean
}

export function Scene({
  pets,
  placedItems,
  mice,
  sceneBounds,
  selectedPetId,
  mouseHolePeeking,
}: SceneProps) {
  return (
    <div className="scene">
      <MouseHoleSprite sceneBounds={sceneBounds} peeking={mouseHolePeeking} />
      {placedItems.map((item) => (
        <ItemSprite key={item.id} placedItem={item} />
      ))}
      {pets.map((pet) => (
        <PetSprite key={pet.id} pet={pet} selected={pet.id === selectedPetId} />
      ))}
      {/* Drawn last (on top of cats) so a held mouse stays visible poking
          out of its holder's mouth rather than being covered by it. */}
      {mice.map((mouse) => (
        <MouseSprite key={mouse.id} mouse={mouse} />
      ))}
    </div>
  )
}
