import { describe, expect, it } from 'vitest'
import type { Pet } from '../types/pet'
import { mouseUrgency } from './attention'
import { STARTER_AGE_MS } from './lifeStage'

// Only mouseUrgency is covered here — itemUrgency/socialUrgency predate
// this session and aren't re-tested from scratch.
function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'test-pet',
    name: 'Testy',
    needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
    position: { x: 200, y: 300 },
    destination: null,
    action: 'idle',
    facing: 'right',
    actionStartedAt: 0,
    genetics: {
      furColor: { allele1: 'gray', allele2: 'gray' },
      pattern: { allele1: 'solid', allele2: 'solid' },
      eyeColor: { allele1: 'green', allele2: 'green' },
      size: { allele1: 'medium', allele2: 'medium' },
    },
    parentIds: null,
    inSuitcase: false,
    targetItemId: null,
    attentionSpan: 300,
    targetPetId: null,
    targetMouseId: null,
    socialClaimedBy: null,
    affection: 60,
    ageMs: STARTER_AGE_MS,
    currentSpeed: 0,
    stridePhase: 0,
    jump: null,
    actionDurationMs: 0,
    ...overrides,
  }
}

describe('mouseUrgency', () => {
  it('is a flat, mood-independent draw once the mouse is fleeing', () => {
    const content = makePet({ needs: { ...makePet().needs, happiness: 95 } })
    const miserable = makePet({ needs: { ...makePet().needs, happiness: 5 } })
    expect(mouseUrgency(content, 'fleeing')).toBe(mouseUrgency(miserable, 'fleeing'))
    expect(mouseUrgency(content, 'fleeing')).toBeGreaterThan(0)
  })

  it('scales a sneaking mouse down to a fraction of the normal want, not zero', () => {
    const pet = makePet({ needs: { ...makePet().needs, happiness: 0 } })
    const sneaking = mouseUrgency(pet, 'sneaking')
    expect(sneaking).toBeGreaterThan(0)
    expect(sneaking).toBeLessThan(60) // well under the raw happiness-driven want
  })

  it('fleeing is a much bigger draw than sneaking, even for an already-happy cat', () => {
    const pet = makePet({ needs: { ...makePet().needs, happiness: 90 } })
    expect(mouseUrgency(pet, 'fleeing')).toBeGreaterThan(mouseUrgency(pet, 'sneaking'))
  })

  it('a fully content cat has no interest in a merely sneaking mouse', () => {
    const pet = makePet({ needs: { ...makePet().needs, happiness: 100 } })
    expect(mouseUrgency(pet, 'sneaking')).toBe(0)
  })
})
