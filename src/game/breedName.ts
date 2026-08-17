import type { Genetics } from '../types/genetics'
import { getPhenotype } from './genetics'

const COLOR_LABEL: Record<string, string> = {
  black: 'Black',
  orange: 'Orange',
  gray: 'Gray',
  cream: 'Cream',
  white: 'White',
}

const SIZE_PREFIX: Record<string, string> = {
  small: 'Little ',
  medium: '',
  large: 'Big ',
}

// A casual, everyday name for how a cat looks — not a formal pedigree
// breed name, just what anyone would call it at a glance, the way people
// say "orange tabby" rather than a cat-fancier registry name.
export function getBreedName(genetics: Genetics): string {
  const color = getPhenotype('furColor', genetics.furColor)
  const pattern = getPhenotype('pattern', genetics.pattern)
  const size = getPhenotype('size', genetics.size)
  const noun = pattern === 'spotted' ? 'Tabby' : 'Cat'
  return `${SIZE_PREFIX[size]}${COLOR_LABEL[color]} ${noun}`
}
