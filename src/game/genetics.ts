import type {
  AllelePair,
  EyeColor,
  FaceShape,
  FurColor,
  Genetics,
  Pattern,
  Size,
} from '../types/genetics'

export const FUR_COLORS: readonly FurColor[] = ['black', 'orange', 'gray', 'cream', 'white']
export const PATTERNS: readonly Pattern[] = ['solid', 'spotted']
export const EYE_COLORS: readonly EyeColor[] = ['green', 'blue', 'amber']
export const SIZES: readonly Size[] = ['small', 'medium', 'large']
export const FACE_SHAPES: readonly FaceShape[] = [
  'wedge',
  'triangle',
  'trapezoid',
  'round',
  'skinny',
]

// Dominance order per trait: when the two alleles differ, the one listed
// first wins and becomes the visible trait (the "phenotype"). 'wedge'
// dominant keeps a freshly-bred kitten's odds of looking like the
// pre-existing default reasonably high.
const DOMINANCE = {
  furColor: ['black', 'orange', 'gray', 'cream', 'white'],
  pattern: ['spotted', 'solid'],
  eyeColor: ['green', 'blue', 'amber'],
  size: ['medium', 'large', 'small'],
  faceShape: ['wedge', 'trapezoid', 'triangle', 'round', 'skinny'],
} satisfies Record<string, readonly string[]>

export function getPhenotype<T extends string>(
  trait: keyof typeof DOMINANCE,
  pair: AllelePair<T>,
): T {
  const order = DOMINANCE[trait] as unknown as readonly T[]
  return order.indexOf(pair.allele1) <= order.indexOf(pair.allele2) ? pair.allele1 : pair.allele2
}

const MUTATION_CHANCE = 0.08

// Picks one of the parent's two alleles at random (Mendelian segregation),
// then has a small chance of mutating to a different random value. `rng` is
// injectable so this is testable with a fixed sequence instead of real
// randomness.
function inheritAllele<T extends string>(
  pair: AllelePair<T>,
  possibleValues: readonly T[],
  rng: () => number,
): T {
  const chosen = rng() < 0.5 ? pair.allele1 : pair.allele2
  if (rng() < MUTATION_CHANCE) {
    const others = possibleValues.filter((v) => v !== chosen)
    return others[Math.floor(rng() * others.length)]
  }
  return chosen
}

function randomPair<T extends string>(values: readonly T[], rng: () => number): AllelePair<T> {
  const pick = () => values[Math.floor(rng() * values.length)]
  return { allele1: pick(), allele2: pick() }
}

export function randomGenetics(rng: () => number = Math.random): Genetics {
  return {
    furColor: randomPair(FUR_COLORS, rng),
    pattern: randomPair(PATTERNS, rng),
    eyeColor: randomPair(EYE_COLORS, rng),
    size: randomPair(SIZES, rng),
    faceShape: randomPair(FACE_SHAPES, rng),
  }
}

export function breedGenetics(a: Genetics, b: Genetics, rng: () => number = Math.random): Genetics {
  return {
    furColor: {
      allele1: inheritAllele(a.furColor, FUR_COLORS, rng),
      allele2: inheritAllele(b.furColor, FUR_COLORS, rng),
    },
    pattern: {
      allele1: inheritAllele(a.pattern, PATTERNS, rng),
      allele2: inheritAllele(b.pattern, PATTERNS, rng),
    },
    eyeColor: {
      allele1: inheritAllele(a.eyeColor, EYE_COLORS, rng),
      allele2: inheritAllele(b.eyeColor, EYE_COLORS, rng),
    },
    size: {
      allele1: inheritAllele(a.size, SIZES, rng),
      allele2: inheritAllele(b.size, SIZES, rng),
    },
    faceShape: {
      allele1: inheritAllele(a.faceShape, FACE_SHAPES, rng),
      allele2: inheritAllele(b.faceShape, FACE_SHAPES, rng),
    },
  }
}
