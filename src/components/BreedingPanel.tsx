import { useState } from 'react'
import type { Pet } from '../types/pet'
import { usePetStore } from '../store/petStore'

interface BreedingPanelProps {
  pets: Pet[]
}

export function BreedingPanel({ pets }: BreedingPanelProps) {
  const [parentAId, setParentAId] = useState('')
  const [parentBId, setParentBId] = useState('')

  const canBreed = parentAId !== '' && parentBId !== '' && parentAId !== parentBId

  return (
    <div className="breeding-panel">
      <h3>Breed cats</h3>
      <div className="breeding-controls">
        <select value={parentAId} onChange={(e) => setParentAId(e.target.value)}>
          <option value="">Parent A</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
        <select value={parentBId} onChange={(e) => setParentBId(e.target.value)}>
          <option value="">Parent B</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
        <button
          disabled={!canBreed}
          onClick={() => {
            usePetStore.getState().breedPets(parentAId, parentBId)
            setParentAId('')
            setParentBId('')
          }}
        >
          Breed
        </button>
      </div>
    </div>
  )
}
