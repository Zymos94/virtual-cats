import type { Mouse } from '../types/mouse'

// A cautious creep — slower than even a cat's amble.
export const MOUSE_SNEAK_SPEED = 16
// Faster than a cat's trot, so a mid-distance chase has real tension —
// only a cat that's already close (stalk range) or mid-pounce can
// realistically catch up.
export const MOUSE_FLEE_SPEED = 145
// A determined trip, not a cautious creep or a terrified sprint — going for
// (or hauling back) a piece of cheese is purposeful but not panicked.
export const MOUSE_CHEESE_SPEED = 55

const ACCEL = 220
const DECEL = 500
// Tiny legs, tiny steps — shorter than a cat's STRIDE_LENGTH_PX.
const STRIDE_LENGTH_PX = 14
const TWO_PI = Math.PI * 2

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// Mirrors movePet's shape (jump interpolation, then destination-seeking
// with eased accel/decel) at mouse scale — no gaits, no life stages, just
// enough to move a small creature convincingly.
export function moveMouse(mouse: Mouse, deltaMs: number): Mouse {
  const dt = deltaMs / 1000

  if (mouse.jump) {
    const progressMs = mouse.jump.progressMs + deltaMs
    const t = Math.min(1, progressMs / mouse.jump.durationMs)
    const eased = smoothstep(t)
    const position = {
      x: mouse.jump.from.x + (mouse.jump.to.x - mouse.jump.from.x) * eased,
      y: mouse.jump.from.y + (mouse.jump.to.y - mouse.jump.from.y) * eased,
    }
    const dxJump = mouse.jump.to.x - mouse.jump.from.x
    const facing: Mouse['facing'] = dxJump < 0 ? 'left' : dxJump > 0 ? 'right' : mouse.facing
    if (t >= 1) return { ...mouse, position, facing, jump: null }
    return { ...mouse, position, facing, jump: { ...mouse.jump, progressMs } }
  }

  if (mouse.state === 'held' || !mouse.destination) {
    if (mouse.currentSpeed === 0) return mouse
    return { ...mouse, currentSpeed: Math.max(0, mouse.currentSpeed - DECEL * dt) }
  }

  const dx = mouse.destination.x - mouse.position.x
  const dy = mouse.destination.y - mouse.position.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return mouse.currentSpeed === 0 ? mouse : { ...mouse, currentSpeed: 0 }

  const target =
    mouse.state === 'fleeing'
      ? MOUSE_FLEE_SPEED
      : mouse.targetCheeseId || mouse.carryingCheese
        ? MOUSE_CHEESE_SPEED
        : MOUSE_SNEAK_SPEED
  const currentSpeed =
    mouse.currentSpeed < target
      ? Math.min(target, mouse.currentSpeed + ACCEL * dt)
      : Math.max(target, mouse.currentSpeed - DECEL * dt)

  const step = Math.min(dist, currentSpeed * dt)
  const facing: Mouse['facing'] = dx < 0 ? 'left' : dx > 0 ? 'right' : mouse.facing

  return {
    ...mouse,
    position: {
      x: mouse.position.x + (dx / dist) * step,
      y: mouse.position.y + (dy / dist) * step,
    },
    facing,
    currentSpeed,
    stridePhase: (mouse.stridePhase + (step / STRIDE_LENGTH_PX) * TWO_PI) % TWO_PI,
  }
}
