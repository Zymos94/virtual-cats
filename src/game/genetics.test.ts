import { describe, expect, it } from 'vitest'
import { breedGenetics, getPhenotype } from './genetics'
import type { Genetics } from '../types/genetics'

describe('getPhenotype', () => {
  it('black beats orange (dominance order)', () => {
    expect(getPhenotype('furColor', { allele1: 'black', allele2: 'orange' })).toBe('black')
  })

  it('order of the pair does not matter', () => {
    expect(getPhenotype('furColor', { allele1: 'orange', allele2: 'black' })).toBe('black')
  })

  it('matching alleles just express themselves', () => {
    expect(getPhenotype('eyeColor', { allele1: 'blue', allele2: 'blue' })).toBe('blue')
  })
})

function homozygous<T extends string>(value: T) {
  return { allele1: value, allele2: value }
}

const orangeCat: Genetics = {
  furColor: homozygous('orange'),
  pattern: homozygous('solid'),
  eyeColor: homozygous('green'),
  size: homozygous('medium'),
  faceShape: homozygous('wedge'),
}

const graySpottedCat: Genetics = {
  furColor: homozygous('gray'),
  pattern: homozygous('spotted'),
  eyeColor: homozygous('blue'),
  size: homozygous('small'),
  faceShape: homozygous('triangle'),
}

describe('breedGenetics', () => {
  it('with rng that never mutates, offspring alleles only ever come from the two parents', () => {
    // Values just above/below the 0.5 segregation split and the 0.08
    // mutation threshold, cycling so every inheritAllele() call in one
    // breed() gets a distinct, predictable roll without ever mutating.
    const rolls = [0.1, 0.9, 0.9, 0.1, 0.1, 0.9, 0.9, 0.1]
    let i = 0
    const rng = () => rolls[i++ % rolls.length]

    const kitten = breedGenetics(orangeCat, graySpottedCat, rng)

    expect(['orange', 'gray']).toContain(kitten.furColor.allele1)
    expect(['orange', 'gray']).toContain(kitten.furColor.allele2)
    expect(['solid', 'spotted']).toContain(kitten.pattern.allele1)
    expect(['green', 'blue']).toContain(kitten.eyeColor.allele1)
    expect(['medium', 'small']).toContain(kitten.size.allele1)
    expect(['wedge', 'triangle']).toContain(kitten.faceShape.allele1)
  })

  it('is deterministic for a fixed rng sequence', () => {
    const fixed = () => 0.2
    const a = breedGenetics(orangeCat, graySpottedCat, fixed)
    const b = breedGenetics(orangeCat, graySpottedCat, fixed)
    expect(a).toEqual(b)
  })
})
