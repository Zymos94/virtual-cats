import catMeowShort from '../assets/sounds/cat-meow-short.mp3'
import catMewFood from '../assets/sounds/cat_mewfood.wav'
import catChirp from '../assets/sounds/cat-chirp.mp3'
import catPurrLoop from '../assets/sounds/cat_purractive_loop.wav'
import catHiss from '../assets/sounds/cat-hiss.mp3'

const SOUND_URLS = {
  select: catMeowShort,
  eating: catMewFood,
  playing: catChirp,
  purrLoop: catPurrLoop,
  hiss: catHiss,
} as const

export type SoundKey = keyof typeof SOUND_URLS

const ONE_SHOT_VOLUME = 0.5

let muted = false

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  if (muted) {
    for (const audio of activeLoops.values()) audio.pause()
    activeLoops.clear()
  }
}

// Fire-and-forget — a fresh Audio element per call so overlapping cats
// (e.g. two eating at once) don't cut each other off.
export function playSound(key: SoundKey) {
  if (muted) return
  const audio = new Audio(SOUND_URLS[key])
  audio.volume = ONE_SHOT_VOLUME
  // Autoplay-policy rejections (e.g. no user gesture yet) are fine to
  // swallow — worst case a sound is silently skipped, not a crash.
  audio.play().catch(() => {})
}

// Looping sounds (the petting purr) need a persistent handle per pet, keyed
// by pet id, so a later call can stop the specific loop that cat started —
// unlike one-shots, which never need to be stopped early.
const activeLoops = new Map<string, HTMLAudioElement>()

export function startLoop(id: string, key: SoundKey, volume: number) {
  if (muted) return
  stopLoop(id)
  const audio = new Audio(SOUND_URLS[key])
  audio.loop = true
  audio.volume = volume
  audio.play().catch(() => {})
  activeLoops.set(id, audio)
}

export function stopLoop(id: string) {
  const audio = activeLoops.get(id)
  if (!audio) return
  audio.pause()
  activeLoops.delete(id)
}

// Safety net for state resets — e.g. resetGame() while a pet is mid-pet.
export function stopAllLoops() {
  for (const audio of activeLoops.values()) audio.pause()
  activeLoops.clear()
}
