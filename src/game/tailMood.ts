import type { Pet } from '../types/pet'

// A simple first pass at mood-driven tail carriage, using only the stats
// we have today (needs + current action). 'agitated' -> a sharp flick;
// 'content' -> tail carried up; 'neutral' -> the calm resting sway/trail.
// A real attention/mood system (M14+) can replace this with richer inputs
// without changing how callers consume the result.
export type TailMood = 'content' | 'neutral' | 'agitated'

export function getTailMood(pet: Pet): TailMood {
  if (pet.action === 'petting') return 'content'
  if (pet.action === 'playing') return 'agitated'
  if (pet.needs.hunger < 30 || pet.needs.happiness < 30) return 'agitated'
  if (pet.needs.happiness > 70 && pet.action !== 'walking') return 'content'
  return 'neutral'
}

// Fixed attach point (in the SVG's own local coordinates, always drawn as
// if facing right) where the tail meets the body. Facing left/right is
// handled purely by CSS-flipping the whole SVG, so this point never needs
// to change based on facing.
export const TAIL_ANCHOR_LOCAL = { x: 14, y: 28 }
export const TAIL_RAISE_PX = 6

export function getTailAnchorLocal(pet: Pet): { x: number; y: number } {
  const mood = getTailMood(pet)
  return {
    x: TAIL_ANCHOR_LOCAL.x,
    y: mood === 'content' ? TAIL_ANCHOR_LOCAL.y - TAIL_RAISE_PX : TAIL_ANCHOR_LOCAL.y,
  }
}
