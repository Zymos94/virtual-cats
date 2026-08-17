import { useGameLoop } from './game/useGameLoop'
import { usePetStore } from './store/petStore'
import { Scene } from './components/Scene'
import { StatBar } from './components/StatBar'
import { Inventory } from './components/Inventory'
import { BreedingPanel } from './components/BreedingPanel'
import { SaveLoadControls } from './components/SaveLoadControls'
import './App.css'

function App() {
  useGameLoop()

  const pets = usePetStore((state) => state.pets)
  const selectedPetId = usePetStore((state) => state.selectedPetId)
  const selectedPet = selectedPetId ? pets[selectedPetId] : null

  return (
    <div className="app">
      <div className="header-row">
        <h1>Virtual Cats</h1>
        <SaveLoadControls />
      </div>
      <Scene pets={Object.values(pets)} selectedPetId={selectedPetId} />
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
          <p className="hint">Click a cat in the scene to see its stats.</p>
        )}
      </div>
      <Inventory selectedPetId={selectedPetId} />
      <BreedingPanel pets={Object.values(pets)} />
    </div>
  )
}

export default App
