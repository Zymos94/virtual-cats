import type { Genetics } from '../types/genetics'
import { getPhenotype } from './genetics'

const FUR_HEX: Record<string, { body: string; stroke: string }> = {
  black: { body: '#4a4a4a', stroke: '#1f1f1f' },
  orange: { body: '#d98a4f', stroke: '#8a5327' },
  gray: { body: '#9a9a9a', stroke: '#4d4d4d' },
  cream: { body: '#e8c96b', stroke: '#8f7327' },
  white: { body: '#f2f0e8', stroke: '#a8a89c' },
}

const EYE_HEX: Record<string, string> = {
  green: '#3f8f4f',
  blue: '#3f6fbf',
  amber: '#bf8f2f',
}

const SIZE_SCALE: Record<string, number> = {
  small: 0.8,
  medium: 1,
  large: 1.2,
}

export interface Appearance {
  body: string
  stroke: string
  eye: string
  scale: number
  spotted: boolean
}

// Turns a pet's underlying genetics (allele pairs) into the actual values
// PetSprite needs to draw it — resolving each trait's phenotype first.
export function deriveAppearance(genetics: Genetics): Appearance {
  const furColor = getPhenotype('furColor', genetics.furColor)
  const eyeColor = getPhenotype('eyeColor', genetics.eyeColor)
  const size = getPhenotype('size', genetics.size)
  const pattern = getPhenotype('pattern', genetics.pattern)
  const { body, stroke } = FUR_HEX[furColor]

  return { body, stroke, eye: EYE_HEX[eyeColor], scale: SIZE_SCALE[size], spotted: pattern === 'spotted' }
}
