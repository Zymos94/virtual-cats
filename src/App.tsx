import { useGameLoop } from './game/useGameLoop'
import { useSceneBounds } from './game/useSceneBounds'
import { usePetStore } from './store/petStore'
import { Scene } from './components/Scene'
import { GamePanel } from './components/GamePanel'
import { SaveLoadControls } from './components/SaveLoadControls'
import './App.css'

function App() {
  useGameLoop()
  useSceneBounds()

  const pets = usePetStore((state) => state.pets)
  const sceneItems = usePetStore((state) => state.sceneItems)
  const mice = usePetStore((state) => state.mice)
  const sceneBounds = usePetStore((state) => state.sceneBounds)
  const mouseHolePeeking = usePetStore((state) => state.mouseHolePeeking)
  const selectedPetId = usePetStore((state) => state.selectedPetId)
  const selectedPet = selectedPetId ? pets[selectedPetId] : null

  const roomPets = Object.values(pets).filter((pet) => !pet.inSuitcase)
  const suitcasedPets = Object.values(pets).filter((pet) => pet.inSuitcase)

  return (
    <div className="app">
      <Scene
        pets={roomPets}
        placedItems={Object.values(sceneItems)}
        mice={Object.values(mice)}
        sceneBounds={sceneBounds}
        selectedPetId={selectedPetId}
        mouseHolePeeking={mouseHolePeeking}
      />

      <div className="top-bar">
        <h1>Virtual Cats</h1>
        <SaveLoadControls />
      </div>

      <GamePanel selectedPet={selectedPet} suitcasedPets={suitcasedPets} roomPets={roomPets} />
    </div>
  )
}

export default App
