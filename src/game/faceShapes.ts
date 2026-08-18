import type { FaceShape } from '../types/genetics'

// One SVG shape, in the head's own local coordinates (drawn facing right —
// PetSprite.tsx's CSS mirror handles facing left for free, same as the
// original single wedge shape always did).
export type HeadOutline =
  | { kind: 'polygon'; points: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }

export interface EarDef {
  points: string
  pivot: { x: number; y: number }
}

// Everything PetSprite.tsx needs to draw one cat's head — the outline, both
// ears (with their own flick pivot), and where the eyes/nose-mouth-whiskers
// group actually sit *on that particular outline*. Before M24 these were
// hardcoded constants that only ever matched the one wedge shape; go back
// to guessing pixel offsets by hand for a new shape and the face reads as
// pasted on rather than attached — every value below was derived by eye
// against the actual outline it belongs to, then checked live (see the
// M24 entry in DEVLOG.md).
export interface FaceShapeDef {
  head: HeadOutline
  earLeft: EarDef
  earRight: EarDef
  // Two eye x-positions in head-local coordinates — same "draw it twice"
  // stylization as the original wedge, not a literal profile.
  eyeXs: [number, number]
  eyeY: number
  // Where the nose/mouth/whisker group anchors — the shape's own muzzle
  // tip, not a fixed offset borrowed from a different outline.
  noseX: number
  noseY: number
}

export const FACE_SHAPES: Record<FaceShape, FaceShapeDef> = {
  // The original shape, unchanged — kept as the dominant default so
  // existing cats don't visually shift under this feature landing.
  wedge: {
    head: { kind: 'polygon', points: '42,34 50,12 66,12 74,34' },
    earLeft: { points: '47,14 53,2 58,15', pivot: { x: 52.5, y: 14.5 } },
    earRight: { points: '60,15 65,2 70,14', pivot: { x: 65, y: 14.5 } },
    eyeXs: [55, 63],
    eyeY: 23,
    noseX: 66,
    noseY: 29,
  },
  // Wide flat brow, tapering to a single point at the chin — the classic
  // "upside-down triangle" cartoon cat face.
  triangle: {
    head: { kind: 'polygon', points: '62,34 42,12 74,12' },
    earLeft: { points: '46,13 52,2 57,14', pivot: { x: 51.5, y: 13 } },
    earRight: { points: '59,14 64,2 70,13', pivot: { x: 64.5, y: 13 } },
    eyeXs: [52, 66],
    eyeY: 20,
    noseX: 62,
    noseY: 29,
  },
  // The wedge flipped: wide brow, narrower (but still flat, not pointed)
  // jaw — an "upside-down trapezoid" relative to the original.
  trapezoid: {
    head: { kind: 'polygon', points: '50,34 66,34 74,12 42,12' },
    earLeft: { points: '44,13 50,2 55,14', pivot: { x: 49.5, y: 13 } },
    earRight: { points: '61,14 66,2 72,13', pivot: { x: 66.5, y: 13 } },
    eyeXs: [54, 64],
    eyeY: 21,
    noseX: 64,
    noseY: 29,
  },
  // An actual circle rather than a polygon.
  round: {
    head: { kind: 'ellipse', cx: 56, cy: 21, rx: 16, ry: 16 },
    earLeft: { points: '45,12 50,1 55,13', pivot: { x: 50, y: 12 } },
    earRight: { points: '58,13 63,1 68,12', pivot: { x: 63, y: 12 } },
    eyeXs: [51, 61],
    eyeY: 21,
    noseX: 68,
    noseY: 24,
  },
  // Narrower at both the brow and the jaw than any other shape — a
  // Siamese-style slim face.
  skinny: {
    head: { kind: 'polygon', points: '50,34 54,10 66,10 70,34' },
    earLeft: { points: '52,11 56,1 59,12', pivot: { x: 55.5, y: 11 } },
    earRight: { points: '60,12 63,1 67,11', pivot: { x: 63.5, y: 11 } },
    eyeXs: [58, 64],
    eyeY: 20,
    noseX: 68,
    noseY: 27,
  },
}
