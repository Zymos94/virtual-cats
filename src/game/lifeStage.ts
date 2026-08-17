export type LifeStage = 'kitten' | 'adult' | 'senior'

// Real milliseconds spent out of the suitcase (see petStore.tick's ageMs
// accumulation) — deliberately short enough to see a bred kitten grow up
// within a normal play session, not a literal cat lifespan.
const KITTEN_DURATION_MS = 3 * 60 * 1000
const ADULT_DURATION_MS = 30 * 60 * 1000

// Comfortably inside the adult range — what starter cats and legacy saves
// (no stored ageMs) are treated as, since they're already grown cats.
export const STARTER_AGE_MS = 8 * 60 * 1000

export function getLifeStage(ageMs: number): LifeStage {
  if (ageMs < KITTEN_DURATION_MS) return 'kitten'
  if (ageMs < ADULT_DURATION_MS) return 'adult'
  return 'senior'
}

// Extra size multiplier layered on top of the genetics-driven size scale —
// kittens are noticeably smaller, seniors just barely.
export function getLifeStageScale(stage: LifeStage): number {
  switch (stage) {
    case 'kitten':
      return 0.7
    case 'senior':
      return 0.95
    default:
      return 1
  }
}

// Kittens dart around, seniors amble — multiplies the base walk speed.
export function getLifeStageSpeedMultiplier(stage: LifeStage): number {
  switch (stage) {
    case 'kitten':
      return 1.3
    case 'senior':
      return 0.7
    default:
      return 1
  }
}

export function getLifeStageLabel(stage: LifeStage): string {
  switch (stage) {
    case 'kitten':
      return 'Kitten'
    case 'senior':
      return 'Senior'
    default:
      return 'Adult'
  }
}
