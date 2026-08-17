import { useGameLoop } from './game/useGameLoop'
import { usePetStore } from './store/petStore'
import { Scene } from './components/Scene'
import { StatBar } from './components/StatBar'
import './App.css'

function App() {
  useGameLoop()

  const pets = usePetStore((state) => state.pets)
  const feedPet = usePetStore((state) => state.feedPet)
  const cleanPet = usePetStore((state) => state.cleanPet)
  const playWithPet = usePetStore((state) => state.playWithPet)

  const pet = pets['pet-1']

  return (
    <div className="app">
      <h1>Virtual Cats</h1>
      <Scene pets={Object.values(pets)} />
      <div className="stats-panel">
        <h2>{pet.name}</h2>
        <StatBar label="Hunger" value={pet.needs.hunger} color="#e07a3f" />
        <StatBar label="Energy" value={pet.needs.energy} color="#3f8ee0" />
        <StatBar label="Hygiene" value={pet.needs.hygiene} color="#3fe0a0" />
        <StatBar label="Happiness" value={pet.needs.happiness} color="#e0d63f" />
        <div className="actions">
          <button onClick={() => feedPet(pet.id)}>Feed</button>
          <button onClick={() => cleanPet(pet.id)}>Clean</button>
          <button onClick={() => playWithPet(pet.id)}>Play</button>
        </div>
      </div>
    </div>
  )
}

export default App
