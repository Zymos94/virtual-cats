import type { PlacedItem } from '../types/item'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'

interface ItemSpriteProps {
  placedItem: PlacedItem
}

export function ItemSprite({ placedItem }: ItemSpriteProps) {
  const definition = ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
  if (!definition) return null

  return (
    <div
      className="item-sprite"
      style={{ left: placedItem.position.x, top: placedItem.position.y }}
      title={definition.name}
    >
      {definition.icon}
    </div>
  )
}
