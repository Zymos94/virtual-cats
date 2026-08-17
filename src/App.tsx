import { useGameLoop } from './game/useGameLoop'
import { useSceneBounds } from './game/useSceneBounds'
import { usePetStore } from './store/petStore'
import { Scene } from './components/Scene'
import { StatBar } from './components/StatBar'
import { Suitcase } from './components/Suitcase'
import { BreedingPanel } from './components/BreedingPanel'
import { SaveLoadControls } from './components/SaveLoadControls'
import { getPersonalityLabel } from './game/personality'
import { getBreedName } from './game/breedName'
import { getLifeStage, getLifeStageLabel } from './game/lifeStage'
import './App.css'

function App() {
  useGameLoop()
  useSceneBounds()

  const pets = usePetStore((state) => state.pets)
  const sceneItems = usePetStore((state) => state.sceneItems)
  const selectedPetId = usePetStore((state) => state.selectedPetId)
  const selectedPet = selectedPetId ? pets[selectedPetId] : null

  const roomPets = Object.values(pets).filter((pet) => !pet.inSuitcase)
  const suitcasedPets = Object.values(pets).filter((pet) => pet.inSuitcase)

  return (
    <div className="app">
      <Scene pets={roomPets} placedItems={Object.values(sceneItems)} selectedPetId={selectedPetId} />

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
              <p className="hint breed-hint">
                {getLifeStageLabel(getLifeStage(selectedPet.ageMs))} {getBreedName(selectedPet.genetics)}
              </p>
              <StatBar label="Hunger" value={selectedPet.needs.hunger} color="#e07a3f" />
              <StatBar label="Energy" value={selectedPet.needs.energy} color="#3f8ee0" />
              <StatBar label="Hygiene" value={selectedPet.needs.hygiene} color="#3fe0a0" />
              <StatBar label="Happiness" value={selectedPet.needs.happiness} color="#e0d63f" />
              <p className="hint personality-hint">
                {getPersonalityLabel(selectedPet.affection)} — hold to pet
              </p>
            </>
          ) : (
            <p className="hint">Click a cat in the room to see its stats.</p>
          )}
        </div>
        <Suitcase suitcasedPets={suitcasedPets} />
        <BreedingPanel pets={roomPets} />
      </div>
    </div>
  )
}

export default App
