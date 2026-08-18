// Fraction of room height occupied by the "wall" band in the background art
// (see App.css's .scene gradient) — floor-bound entities (wandering pets,
// grounded items) stay below this line instead of visually standing "in"
// the wall behind them.
export const WALL_BAND_FRACTION = 0.18

// The mouse hole is a fixed feature of the room, not a placeable item — it
// always exists, always right on the wall/floor line, and stays correctly
// positioned even if the window resizes (a stored PlacedItem position,
// computed once, wouldn't). Both petStore.ts (a fleeing mouse's goal) and
// MouseHoleSprite.tsx (rendering it) call this rather than duplicating the
// position math.
export function getMouseHolePosition(bounds: { width: number; height: number }): {
  x: number
  y: number
} {
  return { x: 70, y: bounds.height * WALL_BAND_FRACTION }
}
