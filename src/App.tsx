import { useGameLoop } from './game/useGameLoop'
import { useSceneBounds } from './game/useSceneBounds'
import { usePetStore } from './store/petStore'
import { Scene } from './components/Scene'
import { StatBar } from './components/StatBar'
import { Suitcase } from './components/Suitcase'
import { BreedingPanel } from './components/BreedingPanel'
import { SaveLoadControls } from './components/SaveLoadControls'
import './App.css'

function App() {
  useGameLoop()
  useSceneBounds()

  const pets = usePetStore((state) => state.pets)
  const selectedPetId = usePetStore((state) => state.selectedPetId)
  const selectedPet = selectedPetId ? pets[selectedPetId] : null

  const roomPets = Object.values(pets).filter((pet) => !pet.inSuitcase)
  const suitcasedPets = Object.values(pets).filter((pet) => pet.inSuitcase)

  return (
    <div className="app">
      <Scene pets={roomPets} selectedPetId={selectedPetId} />

      <div className="top-bar">
        <h1>Virtual Cats</h1>
        <SaveLoadControls />
      </div>

      <div className="bottom-dock">
        <div className="stats-panel">
          {selectedPet ? (
            <>
              <input
                className="pet-name-input"
                value={selectedPet.name}
                maxLength={20}
                onChange={(e) => usePetStore.getState().renamePet(selectedPet.id, e.target.value)}
                aria-label="Cat name"
              />
              <StatBar label="Hunger" value={selectedPet.needs.hunger} color="#e07a3f" />
              <StatBar label="Energy" value={selectedPet.needs.energy} color="#3f8ee0" />
              <StatBar label="Hygiene" value={selectedPet.needs.hygiene} color="#3fe0a0" />
              <StatBar label="Happiness" value={selectedPet.needs.happiness} color="#e0d63f" />
            </>
          ) : (
            <p className="hint">Click a cat in the room to see its stats.</p>
          )}
        </div>
        <Suitcase suitcasedPets={suitcasedPets} selectedPetId={selectedPetId} />
        <BreedingPanel pets={roomPets} />
      </div>
    </div>
  )
}

export default App
