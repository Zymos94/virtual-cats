import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { usePetStore } from '../store/petStore'

interface InventoryProps {
  selectedPetId: string | null
}

export function Inventory({ selectedPetId }: InventoryProps) {
  return (
    <div className="inventory">
      <h3>{selectedPetId ? 'Use an item' : 'Select a cat to use items on it'}</h3>
      <div className="item-grid">
        {ITEM_DEFINITIONS.map((item) => (
          <button
            key={item.id}
            className="item-button"
            disabled={!selectedPetId}
            onClick={() => selectedPetId && usePetStore.getState().useItem(selectedPetId, item.id)}
            title={item.name}
          >
            <span className="item-icon">{item.icon}</span>
            <span className="item-name">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
