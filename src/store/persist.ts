import type { Pet } from '../types/pet'
import type { PlacedItem } from '../types/item'

const STORAGE_KEY = 'virtual-cats-save'

interface SavedState {
  pets: Record<string, Pet>
  sceneItems: Record<string, PlacedItem>
}

export function saveToLocalStorage(
  pets: Record<string, Pet>,
  sceneItems: Record<string, PlacedItem>,
): void {
  const data: SavedState = { pets, sceneItems }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadFromLocalStorage(): SavedState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SavedState
    return data
  } catch {
    return null
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(STORAGE_KEY)
}
