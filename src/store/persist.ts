import type { Pet } from '../types/pet'

const STORAGE_KEY = 'virtual-cats-save'

interface SavedState {
  pets: Record<string, Pet>
}

export function saveToLocalStorage(pets: Record<string, Pet>): void {
  const data: SavedState = { pets }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function loadFromLocalStorage(): Record<string, Pet> | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SavedState
    return data.pets
  } catch {
    return null
  }
}

export function clearSavedGame(): void {
  localStorage.removeItem(STORAGE_KEY)
}
