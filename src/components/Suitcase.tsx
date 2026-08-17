import { useState } from 'react'
import type { Pet } from '../types/pet'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import { CatAvatar } from './CatAvatar'
import { ItemAvatar } from './ItemAvatar'

interface SuitcaseProps {
  suitcasedPets: Pet[]
}

type Tab = 'cats' | 'items'

export function Suitcase({ suitcasedPets }: SuitcaseProps) {
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
          <p className="hint">Drag an item into the room — a cat that wants it will come use it.</p>
          <div className="item-grid">
            {ITEM_DEFINITIONS.map((item) => (
              <ItemAvatar key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
