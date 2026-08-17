export type FurColor = 'black' | 'orange' | 'gray' | 'cream' | 'white'
export type Pattern = 'solid' | 'spotted'
export type EyeColor = 'green' | 'blue' | 'amber'
export type Size = 'small' | 'medium' | 'large'

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
}
