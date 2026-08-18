export type FurColor = 'black' | 'orange' | 'gray' | 'cream' | 'white'
export type Pattern = 'solid' | 'spotted'
export type EyeColor = 'green' | 'blue' | 'amber'
export type Size = 'small' | 'medium' | 'large'
// 'wedge' is the original head shape (wide jaw, narrower brow) — kept as
// the dominant default so pre-existing cats' look doesn't shift under
// them. The rest are new — see src/game/faceShapes.ts for the actual
// geometry each one resolves to.
export type FaceShape = 'wedge' | 'triangle' | 'trapezoid' | 'round' | 'skinny'

// Every trait is stored as a pair of alleles, one inherited from each
// parent — same idea as real genetics. Which one is actually visible (the
// "phenotype") is decided separately by a dominance order.
export interface AllelePair<T extends string> {
  allele1: T
  allele2: T
}

export interface Genetics {
  furColor: AllelePair<FurColor>
  pattern: AllelePair<Pattern>
  eyeColor: AllelePair<EyeColor>
  size: AllelePair<Size>
  faceShape: AllelePair<FaceShape>
}
