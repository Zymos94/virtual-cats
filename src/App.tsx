import type { Pet } from './types/pet'
import { Scene } from './components/Scene'
import { StatBar } from './components/StatBar'
import './App.css'

// M1: one hardcoded pet, no store or game loop yet — just proving the
// pieces render together. Real state management arrives in M2.
const starterPet: Pet = {
  id: 'pet-1',
  name: 'Whiskers',
  needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
  position: { x: 150, y: 100 },
  action: 'idle',
}

function App() {
  return (
    <div className="app">
      <h1>Virtual Cats</h1>
      <Scene pets={[starterPet]} />
      <div className="stats-panel">
        <h2>{starterPet.name}</h2>
        <StatBar label="Hunger" value={starterPet.needs.hunger} color="#e07a3f" />
        <StatBar label="Energy" value={starterPet.needs.energy} color="#3f8ee0" />
        <StatBar label="Hygiene" value={starterPet.needs.hygiene} color="#3fe0a0" />
        <StatBar label="Happiness" value={starterPet.needs.happiness} color="#e0d63f" />
      </div>
    </div>
  )
}

export default App
