import { useState } from 'react'
import type { Pet } from '../types/pet'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { usePetStore } from '../store/petStore'
import { CatAvatar } from './CatAvatar'

interface SuitcaseProps {
  suitcasedPets: Pet[]
  selectedPetId: string | null
}

type Tab = 'cats' | 'items'

export function Suitcase({ suitcasedPets, selectedPetId }: SuitcaseProps) {
  const [tab, setTab] = useState<Tab>('cats')

  return (
    <div className="suitcase-panel">
      <div className="suitcase-tabs">
        <button className={tab === 'cats' ? 'active' : ''} onClick={() => setTab('cats')}>
          Cats
        </button>
        <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
          Items
        </button>
      </div>

      {tab === 'cats' ? (
        suitcasedPets.length === 0 ? (
          <p className="hint">All cats are out in the room. Drag one back here to put it away.</p>
        ) : (
          <div className="cat-avatar-grid">
            {suitcasedPets.map((pet) => (
              <CatAvatar key={pet.id} pet={pet} />
            ))}
          </div>
        )
      ) : (
        <>
          <p className="hint">{selectedPetId ? 'Use an item on the selected cat' : 'Select a cat first'}</p>
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
        </>
      )}
    </div>
  )
}
