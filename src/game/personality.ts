// Turns the numeric affection trait into a pedestrian, non-technical label
// for the stats panel — the player never needs to see the raw 0-100 number.
export function getPersonalityLabel(affection: number): string {
  if (affection >= 75) return 'Very affectionate'
  if (affection >= 50) return 'Affectionate'
  if (affection >= 25) return 'Independent'
  return 'Aloof'
}
