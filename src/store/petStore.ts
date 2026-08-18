import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ActionState, Needs, Pet } from '../types/pet'
import type { Genetics } from '../types/genetics'
import type { PlacedItem } from '../types/item'
import type { Mouse } from '../types/mouse'
import { updatePetBehavior } from '../game/behaviorFSM'
import { movePet } from '../game/movement'
import { breedGenetics } from '../game/genetics'
import { ITEM_DEFINITIONS } from '../data/itemDefinitions'
import {
  attentionScore,
  itemUrgency,
  mouseUrgency,
  socialUrgency,
  type AttentionTarget,
} from '../game/attention'
import { clampToRoom, stepItemPhysics } from '../game/itemPhysics'
import { clearSavedGame, loadFromLocalStorage, saveToLocalStorage } from './persist'
import { getTailAnchorLocal } from '../game/tailMood'
import { initialSegments, stepChain, type Point } from '../game/tailPhysics'
import { SVG_WIDTH, TAIL_LINK_LENGTH, TAIL_SEGMENTS } from '../game/spriteConstants'
import { STARTER_AGE_MS } from '../game/lifeStage'
import { playSound, startLoop, stopAllLoops, stopLoop } from '../game/sound'
import {
  MOUSE_DETECT_RADIUS,
  MOUSE_MAX_LIVES,
  MOUSE_MIN_LIVES,
  MOUSE_STALK_DETECT_RADIUS,
  scareMouse,
  updateMouseBehavior,
} from '../game/mouseBehavior'
import { moveMouse } from '../game/mouseMovement'
import { getMouseHolePosition, WALL_BAND_FRACTION } from '../game/roomLayout'
import { URGENT_HUNGER } from '../game/gaits'

interface PetStore {
  pets: Record<string, Pet>
  sceneItems: Record<string, PlacedItem>
  // Autonomous mice — a separate slice from sceneItems since they have
  // their own AI/movement (see mouseBehavior.ts/mouseMovement.ts) rather
  // than being physics-driven objects a cat "uses." Never persisted (see
  // persist.ts) — a reload just starts with none, same as tailSegments.
  mice: Record<string, Mouse>
  // Tail chain positions in scene coordinates, one array per pet — kept
  // here (not component state) so they keep relaxing every real frame even
  // for pets that aren't currently moving. See tailPhysics.ts for why.
  tailSegments: Record<string, Point[]>
  sceneBounds: { width: number; height: number }
  decayAccumulatorMs: number
  selectedPetId: string | null
  // The mouse hole occasionally shows a peek (two little eyes) before
  // sometimes spawning a mouse of its own — see the MOUSEHOLE_* constants
  // and tick()'s peek step. Not persisted (like mice/tailSegments): a
  // reload just starts with nothing scheduled yet, same reasoning as the
  // stale-session-timestamp bug this sidesteps on purpose (see DEVLOG).
  mouseHolePeeking: boolean
  mouseHolePeekStartedAt: number
  // 0 is a sentinel meaning "not yet scheduled" — the first tick schedules
  // a real one from that tick's own `now` rather than firing immediately.
  nextMouseHolePeekAt: number
  // Multiplies every deltaMs-driven effect (needs decay, aging, movement,
  // item physics) — 1 is normal cozy pace, higher fast-forwards the whole
  // simulation uniformly. Doesn't affect wall-clock action timers (how
  // long an eating/sleeping animation lasts), just how fast time itself
  // passes for the room.
  timeScale: number
  // The stats/cats/items/breeding panel behaves like a physical object the
  // player can shove around — very high friction (see PANEL_FRICTION), so
  // it's really just "move with the mouse" with a token bit of slide on
  // release rather than a real throw. Runs on real time regardless of
  // timeScale, same reasoning as action-animation timers: it's a UI
  // interaction, not part of the room simulation being fast-forwarded.
  panelPosition: { x: number; y: number }
  panelVelocity: { x: number; y: number }
  panelHeld: boolean
  tick: (now: number, deltaMs: number) => void
  setTimeScale: (value: number) => void
  startDragPanel: () => void
  dragPanelTo: (x: number, y: number) => void
  endDragPanel: (velocity: { x: number; y: number }) => void
  setSceneBounds: (bounds: { width: number; height: number }) => void
  selectPet: (petId: string | null) => void
  startDragPet: (petId: string) => void
  startPetting: (petId: string) => void
  endPetting: (petId: string) => void
  dragPetTo: (petId: string, x: number, y: number) => void
  endDragPet: (petId: string) => void
  putPetInSuitcase: (petId: string) => void
  takePetFromSuitcase: (petId: string, position: { x: number; y: number }) => void
  placeItem: (itemTypeId: string, position: { x: number; y: number }) => void
  startDragItem: (itemId: string) => void
  dragItemTo: (itemId: string, x: number, y: number) => void
  endDragItem: (itemId: string, velocity: { x: number; y: number }) => void
  breedPets: (parentAId: string, parentBId: string) => void
  renamePet: (petId: string, name: string) => void
  resetGame: () => void
}

const DECAY_INTERVAL_MS = 1000
// Cozy, not hectic — a cat left alone should take the better part of an
// hour to actually need something, not a couple of minutes.
const DECAY_PER_SECOND: Needs = { hunger: -0.05, energy: -0.03, hygiene: -0.02, happiness: -0.02 }

const PLACE_DROP_HEIGHT = 24
const LIFT_RATIO = 0.35 // fraction of throw speed converted into upward lift
const MAX_LIFT = 600 // px/s cap, so a very fast swipe doesn't launch it absurdly high
// Fraction of throw speed that becomes ground travel. High enough that a
// swipe visibly carries the item in the swipe's direction — a hard throw
// should genuinely cross a good part of the room, a gentle flick should
// roll a short way. Runaway sliding is prevented in itemPhysics.ts (each
// floor bounce scrubs ground speed, then rolling friction), not by
// choking the throw itself at the source — that made every throw pop
// straight up and land at your feet.
const GROUND_RATIO = 0.55
const SOCIAL_HAPPINESS_BOOST = 15 // per cat, modest — playing together is free, shouldn't outshine toys
// Happiness gained per second while being petted, scaled by the cat's own
// affection trait — a very affectionate cat (affection 100) gains roughly
// 5x faster than an aloof one (affection 0).
const PETTING_BASE_RATE = 2
const PETTING_AFFECTION_BONUS = 8

// Pounce: within this range of a grounded toy, the final approach becomes
// a leap (see tick's pounce step). The minimum keeps a cat already
// basically on top of the toy from doing a zero-length hop.
const POUNCE_RANGE = 90
const POUNCE_MIN_RANGE = 24
const POUNCE_BASE_MS = 260
const POUNCE_MS_PER_PX = 2.2
// A pounce landing further than this from where the toy actually is now
// (it rolled on, or got re-thrown mid-leap) is a miss — no consumption,
// the cat just reconsiders from where it landed.
const POUNCE_MISS_DISTANCE = 48

// Stalking: closer than this to a grounded toy (but still outside pounce
// range), a trotting approach drops into a crouched slink instead — reads
// as one continuous stalk-then-pounce motion rather than a trot that
// abruptly leaps. Reused as-is for mice — same shape of chase.
const STALK_RANGE = 200

// A mouse-pounce landing further than this from the mouse's actual
// position by the time the leap completes is a miss — the mouse noticed
// the leap and darted clear. Tighter than POUNCE_MISS_DISTANCE since a
// mouse is a much smaller target than a rolling ball.
const MOUSE_CATCH_DISTANCE = 34
// Purely cosmetic coat-color roll at spawn — no behavioral difference.
const MOUSE_BROWN_CHANCE = 0.3
// A calmly sneaking mouse only notices cheese within this range — not
// omniscient about the whole room, same spirit as a cat's own attentionSpan.
const MOUSE_CHEESE_DETECT_RADIUS = 250
// Close enough to a claimed cheese item to actually grab it.
const MOUSE_CHEESE_PICKUP_RANGE = 12
// How long a cat holds a caught mouse in its jaws before chucking it.
const HOLD_MOUSE_MS = 2200
// How far the chuck hop throws the mouse.
const MOUSE_CHUCK_DISTANCE = 110
const MOUSE_CHUCK_DURATION_MS = 300
// "usually" keeps pursuing, per the design brief — not always, so a chase
// occasionally just ends instead of looping forever.
const MOUSE_RECHASE_CHANCE = 0.75
// Close enough to the mouse hole that a fleeing mouse escapes — despawns
// outright, its goal met.
const MOUSE_HOLE_DESPAWN_RANGE = 20
// Where a held mouse renders, in the holder's own *local* (facing-right)
// coordinates — derived from PetSprite.tsx's head geometry: the head
// polygon's front edge reaches x=74, its eyes sit at EYE_XS [55,63] /
// EYE_Y=23, so a point just in front of and slightly below the eyes lands
// on the snout/mouth rather than (the old constants' 24,6) the middle of
// the body. Mirrored to world space the same way PetSprite.tsx's own
// gaze-target code does (`SVG_WIDTH - x` for a left-facing cat) — a plain
// sign flip is the wrong correction here, same reasoning as the tail
// anchor's facing correction (see tailMood.ts).
const MOUSE_MOUTH_LOCAL_X = 70
const MOUSE_MOUTH_LOCAL_Y = 27

// The mouse hole occasionally shows a peek on its own, independent of
// anything a cat or mouse is doing — a bit of ambient room life. Wide
// interval range so it never feels metronomic.
const MOUSEHOLE_PEEK_MIN_INTERVAL_MS = 20000
const MOUSEHOLE_PEEK_MAX_INTERVAL_MS = 50000
const MOUSEHOLE_PEEK_DURATION_MS = 1400
// Most peeks are just a look-around — only some of them commit to actually
// coming out.
const MOUSEHOLE_SPAWN_CHANCE = 0.4

// Very high on purpose — the panel should feel grabby, not slippery. A
// released panel travels only a token distance before stopping, unlike a
// thrown item.
const PANEL_FRICTION = 0.97
const PANEL_STOP_THRESHOLD_PX_PER_SEC = 20
// Keeps at least the panel's own top-left corner (where its drag handle
// lives) reachable on screen, without needing to know the panel's actual
// rendered size (which varies by which tab is open).
const PANEL_EDGE_MARGIN = 40

function clampPanelPosition(
  position: { x: number; y: number },
  bounds: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(position.x, PANEL_EDGE_MARGIN), bounds.width - PANEL_EDGE_MARGIN),
    y: Math.min(Math.max(position.y, PANEL_EDGE_MARGIN), bounds.height - PANEL_EDGE_MARGIN),
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function clampAttentionSpan(value: number): number {
  return Math.max(150, Math.min(450, value))
}

function releaseClaim(
  sceneItems: Record<string, PlacedItem>,
  itemId: string | null,
): Record<string, PlacedItem> {
  if (!itemId || !sceneItems[itemId]) return sceneItems
  return { ...sceneItems, [itemId]: { ...sceneItems[itemId], claimedBy: null } }
}

// Called when `petId` gets interrupted (picked up, put away). Releases the
// social claim it was holding on someone else (if it was mid-approach),
// and — the other direction — clears any OTHER cat's targetPetId that was
// pointed at petId, so that cat doesn't keep chasing a partner who just
// vanished from the room.
function releaseSocialClaims(pets: Record<string, Pet>, petId: string): Record<string, Pet> {
  let result = pets
  const pet = result[petId]
  if (pet?.targetPetId && result[pet.targetPetId]) {
    result = { ...result, [pet.targetPetId]: { ...result[pet.targetPetId], socialClaimedBy: null } }
  }
  for (const otherId in result) {
    if (otherId !== petId && result[otherId].targetPetId === petId) {
      result = { ...result, [otherId]: { ...result[otherId], targetPetId: null } }
    }
  }
  return result
}

function makeMouse(id: string, position: { x: number; y: number }, now: number): Mouse {
  return {
    id,
    position,
    destination: null,
    state: 'sneaking',
    facing: Math.random() < 0.5 ? 'left' : 'right',
    color: Math.random() < MOUSE_BROWN_CHANCE ? 'brown' : 'grey',
    livesRemaining:
      MOUSE_MIN_LIVES + Math.floor(Math.random() * (MOUSE_MAX_LIVES - MOUSE_MIN_LIVES + 1)),
    actionStartedAt: now,
    lastThreatenedAt: 0,
    claimedBy: null,
    heldBy: null,
    currentSpeed: 0,
    stridePhase: 0,
    jump: null,
    targetCheeseId: null,
    carryingCheese: false,
  }
}

function applyDecay(pet: Pet): Pet {
  return {
    ...pet,
    needs: {
      hunger: clamp(pet.needs.hunger + DECAY_PER_SECOND.hunger),
      energy: clamp(pet.needs.energy + DECAY_PER_SECOND.energy),
      hygiene: clamp(pet.needs.hygiene + DECAY_PER_SECOND.hygiene),
      happiness: clamp(pet.needs.happiness + DECAY_PER_SECOND.happiness),
    },
  }
}

// Both alleles the same value, so the phenotype is guaranteed regardless of
// dominance order — used only for the hand-picked starter pets below.
function homozygous<T extends string>(value: T): { allele1: T; allele2: T } {
  return { allele1: value, allele2: value }
}

function makeStarterPet(
  overrides: Pick<Pet, 'id' | 'name' | 'position' | 'genetics'> & Partial<Pet>,
): Pet {
  return {
    needs: { hunger: 70, energy: 85, hygiene: 90, happiness: 60 },
    destination: null,
    action: 'idle',
    facing: 'right',
    actionStartedAt: 0,
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

const starterPets: Pet[] = [
  makeStarterPet({
    id: 'pet-1',
    name: 'Whiskers',
    position: { x: 120, y: 90 },
    attentionSpan: 320,
    affection: 65,
    genetics: {
      furColor: homozygous('orange'),
      pattern: homozygous('solid'),
      eyeColor: homozygous('green'),
      size: homozygous('medium'),
    },
  }),
  makeStarterPet({
    id: 'pet-2',
    name: 'Mittens',
    position: { x: 320, y: 140 },
    attentionSpan: 260,
    affection: 40,
    genetics: {
      furColor: homozygous('gray'),
      pattern: homozygous('spotted'),
      eyeColor: homozygous('blue'),
      size: homozygous('small'),
    },
  }),
  makeStarterPet({
    id: 'pet-3',
    name: 'Tom',
    position: { x: 460, y: 60 },
    attentionSpan: 380,
    affection: 80,
    genetics: {
      furColor: homozygous('cream'),
      pattern: homozygous('solid'),
      eyeColor: homozygous('amber'),
      size: homozygous('large'),
    },
  }),
]

function freshStarterPets(): Record<string, Pet> {
  return Object.fromEntries(starterPets.map((pet) => [pet.id, pet]))
}

// Timestamp fields like actionStartedAt are meaningless across a page
// reload (performance.now() resets to ~0 for the new session), so loaded
// pets are reset to a clean idle state rather than resuming mid-animation
// with a stale, session-relative timestamp.
function sanitizeLoadedPet(pet: Pet): Pet {
  return {
    ...pet,
    action: 'idle',
    destination: null,
    actionStartedAt: 0,
    inSuitcase: pet.inSuitcase ?? false,
    targetItemId: null,
    attentionSpan: pet.attentionSpan ?? 300,
    targetPetId: null,
    targetMouseId: null,
    socialClaimedBy: null,
    affection: pet.affection ?? 60,
    ageMs: pet.ageMs ?? STARTER_AGE_MS,
    currentSpeed: 0,
    stridePhase: 0,
    jump: null,
    actionDurationMs: 0,
  }
}

function loadInitialState(): { pets: Record<string, Pet>; sceneItems: Record<string, PlacedItem> } {
  const saved = loadFromLocalStorage()
  if (!saved || Object.keys(saved.pets).length === 0) {
    return { pets: freshStarterPets(), sceneItems: {} }
  }

  const pets: Record<string, Pet> = {}
  for (const id in saved.pets) pets[id] = sanitizeLoadedPet(saved.pets[id])

  const sceneItems: Record<string, PlacedItem> = {}
  for (const id in saved.sceneItems ?? {}) {
    sceneItems[id] = {
      ...saved.sceneItems[id],
      claimedBy: null,
      held: false,
      velocity: { x: 0, y: 0 },
      height: 0,
      verticalVelocity: 0,
    }
  }

  return { pets, sceneItems }
}

const initialState = loadInitialState()

export const usePetStore = create<PetStore>((set) => ({
  pets: initialState.pets,
  sceneItems: initialState.sceneItems,
  mice: {},
  tailSegments: {},
  sceneBounds: { width: window.innerWidth, height: window.innerHeight },
  decayAccumulatorMs: 0,
  mouseHolePeeking: false,
  mouseHolePeekStartedAt: 0,
  nextMouseHolePeekAt: 0,
  selectedPetId: null,
  timeScale: 1,
  // Same bottom-left corner the old fixed dock used to sit in, but now
  // just a starting point — the player can drag it anywhere from here.
  panelPosition: { x: 24, y: Math.max(80, window.innerHeight - 380) },
  panelVelocity: { x: 0, y: 0 },
  panelHeld: false,

  setTimeScale: (value) => set({ timeScale: value }),
  setSceneBounds: (bounds) => set({ sceneBounds: bounds }),

  startDragPanel: () => set({ panelHeld: true, panelVelocity: { x: 0, y: 0 } }),

  dragPanelTo: (x, y) =>
    set((state) => ({ panelPosition: clampPanelPosition({ x, y }, state.sceneBounds) })),

  endDragPanel: (velocity) => set({ panelHeld: false, panelVelocity: velocity }),

  // Called every animation frame by the game loop. Needs decay happens in
  // fixed 1-second steps so its rate stays consistent regardless of frame
  // rate; behavior (FSM) and movement run every frame using the real delta,
  // independently for every pet in the record.
  tick: (now, rawDeltaMs) =>
    set((state) => {
      // Every deltaMs-driven effect below (decay, aging, movement, item
      // physics) runs on this scaled value, not the real frame delta —
      // that's the whole simulation speeding up or slowing down uniformly
      // under setTimeScale, while wall-clock action timers (actionStartedAt
      // comparisons against `now`) stay real-time and unaffected.
      const deltaMs = rawDeltaMs * state.timeScale

      // Panel momentum — real time, not scaled by timeScale, and
      // independent of everything else below. Only decelerates a released
      // panel; while held, dragPanelTo drives its position directly.
      let panelPosition = state.panelPosition
      let panelVelocity = state.panelVelocity
      if (!state.panelHeld && (panelVelocity.x !== 0 || panelVelocity.y !== 0)) {
        const rdt = rawDeltaMs / 1000
        const decay = Math.pow(1 - PANEL_FRICTION, rdt)
        const vx = panelVelocity.x * decay
        const vy = panelVelocity.y * decay
        panelVelocity =
          Math.hypot(vx, vy) < PANEL_STOP_THRESHOLD_PX_PER_SEC ? { x: 0, y: 0 } : { x: vx, y: vy }
        panelPosition = clampPanelPosition(
          {
            x: panelPosition.x + panelVelocity.x * rdt,
            y: panelPosition.y + panelVelocity.y * rdt,
          },
          state.sceneBounds,
        )
      }

      let accumulator = state.decayAccumulatorMs + deltaMs
      let pets = state.pets

      while (accumulator >= DECAY_INTERVAL_MS) {
        const next: Record<string, Pet> = {}
        for (const id in pets) next[id] = pets[id].inSuitcase ? pets[id] : applyDecay(pets[id])
        pets = next
        accumulator -= DECAY_INTERVAL_MS
      }

      // Working copy of items, mutated as pets claim/consume them this
      // tick. Processing pets in order (not in parallel) means two pets
      // can't both claim the same item in the same frame.
      const sceneItems: Record<string, PlacedItem> = {}
      for (const itemId in state.sceneItems) {
        const item = state.sceneItems[itemId]
        const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
        sceneItems[itemId] = definition
          ? stepItemPhysics(item, definition.physics, deltaMs, state.sceneBounds)
          : item
      }
      // A dropped mouse item falls like anything else (see stepItemPhysics
      // above); the instant it's fully at rest it "wakes up" — deleted
      // from sceneItems, replaced by an autonomous Mouse at the same spot.
      let mice = state.mice
      for (const itemId in sceneItems) {
        const item = sceneItems[itemId]
        const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
        if (
          definition?.category === 'prey' &&
          !item.held &&
          item.height === 0 &&
          item.verticalVelocity === 0 &&
          Math.hypot(item.velocity.x, item.velocity.y) < 5
        ) {
          delete sceneItems[itemId]
          mice = { ...mice, [itemId]: makeMouse(itemId, item.position, now) }
        }
      }

      // A fixed room feature (see roomLayout.ts), not something the player
      // places — always exists, so a fleeing mouse always has a goal and
      // an escape/despawn condition (below) to aim for.
      const holePosition = getMouseHolePosition(state.sceneBounds)

      // Ambient mousehole life, independent of any cat/mouse currently in
      // the room: on no particular schedule (a random interval within a
      // wide range), two eyes peek out for a moment; only some of those
      // peeks commit to an actual mouse coming out. 0 is a sentinel for
      // "never scheduled" (a fresh load/reset) — the first tick just
      // schedules a real one from its own `now` rather than firing
      // instantly on load.
      let mouseHolePeeking = state.mouseHolePeeking
      let mouseHolePeekStartedAt = state.mouseHolePeekStartedAt
      let nextMouseHolePeekAt = state.nextMouseHolePeekAt
      if (mouseHolePeeking && now - mouseHolePeekStartedAt >= MOUSEHOLE_PEEK_DURATION_MS) {
        mouseHolePeeking = false
      }
      if (nextMouseHolePeekAt === 0) {
        nextMouseHolePeekAt =
          now +
          MOUSEHOLE_PEEK_MIN_INTERVAL_MS +
          Math.random() * (MOUSEHOLE_PEEK_MAX_INTERVAL_MS - MOUSEHOLE_PEEK_MIN_INTERVAL_MS)
      } else if (!mouseHolePeeking && now >= nextMouseHolePeekAt) {
        mouseHolePeeking = true
        mouseHolePeekStartedAt = now
        nextMouseHolePeekAt =
          now +
          MOUSEHOLE_PEEK_MIN_INTERVAL_MS +
          Math.random() * (MOUSEHOLE_PEEK_MAX_INTERVAL_MS - MOUSEHOLE_PEEK_MIN_INTERVAL_MS)
        if (Math.random() < MOUSEHOLE_SPAWN_CHANCE) {
          const spawnId = nanoid()
          mice = { ...mice, [spawnId]: makeMouse(spawnId, holePosition, now) }
          playSound('squeak')
        }
      }

      // Mice are fully autonomous — their own AI runs independently of any
      // cat, using last tick's cat positions (one tick of lag, imperceptible)
      // to decide whether they've been spotted. Held mice skip this
      // entirely; the pet loop below repositions them to their holder's
      // mouth once cat positions are final for this tick.
      const mouseTopMargin = state.sceneBounds.height * WALL_BAND_FRACTION + 20
      const nextMice: Record<string, Mouse> = {}
      for (const mouseId in mice) {
        let mouse = mice[mouseId]
        if (mouse.state !== 'held') {
          // Cheese: only while calmly sneaking — scareMouse (called from
          // updateMouseBehavior below if spotted this tick) drops all of
          // this outright, a cheese run isn't worth its life. Store-side
          // (not in updateMouseBehavior's pure function) since picking up
          // and delivering cheese both mutate sceneItems, same reasoning as
          // a cat's own item consumption.
          if (mouse.state === 'sneaking' && !mouse.jump) {
            if (mouse.carryingCheese) {
              if (
                Math.hypot(mouse.position.x - holePosition.x, mouse.position.y - holePosition.y) <
                MOUSE_HOLE_DESPAWN_RANGE
              ) {
                continue // delivered — despawns, goal met, same as an escaped fleeing mouse
              }
            } else if (mouse.targetCheeseId) {
              const cheese = sceneItems[mouse.targetCheeseId]
              if (!cheese || cheese.claimedBy !== mouseId) {
                mouse = { ...mouse, targetCheeseId: null, destination: null }
              } else if (
                Math.hypot(
                  mouse.position.x - cheese.position.x,
                  mouse.position.y - cheese.position.y,
                ) < MOUSE_CHEESE_PICKUP_RANGE
              ) {
                delete sceneItems[mouse.targetCheeseId]
                mouse = {
                  ...mouse,
                  targetCheeseId: null,
                  carryingCheese: true,
                  destination: holePosition,
                  actionStartedAt: now,
                }
              }
              // else: still on its way — destination was already aimed at
              // the cheese when claimed below, and a settled item never
              // moves on its own, so there's nothing to re-aim at.
            } else {
              let nearestCheeseId: string | null = null
              let nearestCheeseDist = MOUSE_CHEESE_DETECT_RADIUS
              for (const itemId in sceneItems) {
                const item = sceneItems[itemId]
                if (item.claimedBy || item.held || item.itemTypeId !== 'cheese') continue
                if (item.height > 0.5) continue // still airborne/settling
                const d = Math.hypot(
                  mouse.position.x - item.position.x,
                  mouse.position.y - item.position.y,
                )
                if (d < nearestCheeseDist) {
                  nearestCheeseDist = d
                  nearestCheeseId = itemId
                }
              }
              if (nearestCheeseId) {
                sceneItems[nearestCheeseId] = { ...sceneItems[nearestCheeseId], claimedBy: mouseId }
                mouse = {
                  ...mouse,
                  targetCheeseId: nearestCheeseId,
                  destination: sceneItems[nearestCheeseId].position,
                  actionStartedAt: now,
                }
              }
            }
          }

          let spotted = false
          let nearestThreatPosition: { x: number; y: number } | null = null
          let nearestDist = Infinity
          for (const petId in state.pets) {
            const cat = state.pets[petId]
            if (cat.inSuitcase) continue
            const distance = Math.hypot(
              cat.position.x - mouse.position.x,
              cat.position.y - mouse.position.y,
            )
            const detectRadius =
              cat.action === 'stalking' ? MOUSE_STALK_DETECT_RADIUS : MOUSE_DETECT_RADIUS
            if (distance < detectRadius) spotted = true
            if (distance < nearestDist) {
              nearestDist = distance
              nearestThreatPosition = cat.position
            }
          }
          const targetCheeseBeforeScareCheck = mouse.targetCheeseId
          const stateBeforeScareCheck = mouse.state
          mouse = updateMouseBehavior(mouse, {
            now,
            sceneBounds: state.sceneBounds,
            topMargin: mouseTopMargin,
            spotted,
            nearestThreatPosition,
            holePosition,
          })
          // A fresh scare only — matches scareMouse's own freshScare check,
          // so a mouse already fleeing and re-spotted doesn't squeak every
          // single tick of an ongoing chase.
          if (stateBeforeScareCheck !== 'fleeing' && mouse.state === 'fleeing') {
            playSound('squeak')
          }
          if (
            targetCheeseBeforeScareCheck &&
            mouse.targetCheeseId !== targetCheeseBeforeScareCheck &&
            sceneItems[targetCheeseBeforeScareCheck]?.claimedBy === mouseId
          ) {
            sceneItems[targetCheeseBeforeScareCheck] = {
              ...sceneItems[targetCheeseBeforeScareCheck],
              claimedBy: null,
            }
          }
          mouse = moveMouse(mouse, deltaMs)
        }
        nextMice[mouseId] = mouse
      }
      mice = nextMice

      const claimed = new Set<string>()
      for (const itemId in sceneItems) {
        if (sceneItems[itemId].claimedBy) claimed.add(itemId)
      }
      const mouseClaimed = new Set<string>()
      for (const mouseId in mice) {
        if (mice[mouseId].claimedBy) mouseClaimed.add(mouseId)
      }

      // Cats already being approached by someone (from a previous tick, or
      // newly claimed below) are excluded as candidates for anyone else.
      const socialClaimed = new Set<string>()
      for (const petId in pets) {
        if (pets[petId].socialClaimedBy) socialClaimed.add(petId)
      }
      const newSocialClaims: Record<string, string> = {} // targetPetId -> claimerId
      // targetPetId -> claimerId, for a claim whose claimer is giving up on it this tick (redirecting
      // to something else, or just giving up entirely) — checked against claimerId before clearing so
      // a fresh claim someone else made on the same target this same tick is never wiped out.
      const socialClaimsToRelease: Record<string, string> = {}

      const moved: Record<string, Pet> = {}
      for (const id in pets) {
        const storedPet = pets[id]
        if (storedPet.inSuitcase) {
          moved[id] = storedPet
          continue
        }
        // Ages only while out of the suitcase, same as needs decay — a
        // cat put away doesn't grow up while it's not being played with.
        const pet = { ...storedPet, ageMs: storedPet.ageMs + deltaMs }

        // Player is holding a pointer down on this cat right now — AI is
        // fully suspended (see behaviorFSM's 'petting' case), and instead
        // it just gains happiness continuously for as long as it's held,
        // at a rate personal to how affectionate this particular cat is.
        if (pet.action === 'petting') {
          const rate = PETTING_BASE_RATE + (pet.affection / 100) * PETTING_AFFECTION_BONUS
          const gained = rate * (deltaMs / 1000)
          moved[id] = {
            ...pet,
            needs: { ...pet.needs, happiness: clamp(pet.needs.happiness + gained) },
          }
          continue
        }

        // Holding a caught mouse in its jaws — like 'petting', fully
        // store-side rather than run through the FSM, since both starting
        // and ending this needs to mutate the mouse too. Waits out
        // HOLD_MOUSE_MS, then chucks it: the mouse gets a hop away and
        // starts fleeing again, and this cat usually (not always, see
        // MOUSE_RECHASE_CHANCE) goes right back to chasing it.
        if (pet.action === 'holdingMouse') {
          if (now - pet.actionStartedAt < HOLD_MOUSE_MS) {
            moved[id] = pet
            continue
          }
          const heldMouseId = pet.targetMouseId
          const heldMouse = heldMouseId ? mice[heldMouseId] : undefined
          if (!heldMouse) {
            // Defensive: the mouse vanished somehow — just let go.
            moved[id] = { ...pet, action: 'idle', targetMouseId: null, actionStartedAt: now }
            continue
          }
          const dirX = pet.facing === 'left' ? -1 : 1
          const chuckTo = clampToRoom(
            {
              x: pet.position.x + dirX * MOUSE_CHUCK_DISTANCE + (Math.random() - 0.5) * 40,
              y: pet.position.y + (Math.random() - 0.5) * 40,
            },
            state.sceneBounds,
          )
          // scareMouse decides the same fresh-scare/lives/away-vs-hole
          // logic being caught-and-chucked would from any other scare —
          // its destination takes over once this hop lands (moveMouse
          // ignores `destination` while a jump is in flight).
          const scared = scareMouse(
            heldMouse,
            now,
            state.sceneBounds,
            mouseTopMargin,
            pet.position,
            holePosition,
          )
          // Coming out of 'held', this is always a fresh scare — no need to
          // check, unlike the other two scareMouse call sites.
          playSound('squeak')
          // "usually" keeps pursuing, per the design brief — not always.
          // If not, release the claim too, or nobody could ever target
          // this mouse again once it's off chasing freely.
          const keepChasing = Math.random() < MOUSE_RECHASE_CHANCE
          mice = {
            ...mice,
            [heldMouseId!]: {
              ...scared,
              heldBy: null,
              claimedBy: keepChasing ? id : null,
              // Hops from wherever it actually is (the mouth position tracked
              // each tick above), not the cat's own base position — those
              // differ enough that starting from pet.position would visibly
              // snap the mouse there for one frame before the hop even starts.
              jump: {
                from: heldMouse.position,
                to: chuckTo,
                progressMs: 0,
                durationMs: MOUSE_CHUCK_DURATION_MS,
              },
            },
          }
          moved[id] = {
            ...pet,
            action: keepChasing ? 'walking' : 'idle',
            destination: keepChasing ? chuckTo : null,
            targetMouseId: keepChasing ? heldMouseId! : null,
            actionStartedAt: now,
          }
          continue
        }

        // Find the single best thing this pet wants right now — an item,
        // another cat, or a mouse — scoring all three through the same
        // urgency*proximity function so they compete on equal footing.
        // See attention.ts.
        let bestTarget: AttentionTarget | null = null
        let bestScore = 0

        for (const item of Object.values(sceneItems)) {
          if (claimed.has(item.id)) continue
          const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
          if (!definition) continue
          const urgency = itemUrgency(pet, definition)
          const distance = Math.hypot(
            item.position.x - pet.position.x,
            item.position.y - pet.position.y,
          )
          const score = attentionScore(urgency, distance, pet.attentionSpan)
          if (score > bestScore) {
            bestScore = score
            bestTarget = { kind: 'item', id: item.id, position: item.position }
          }
        }

        // Urgency depends on the mouse's own state, not just this cat's
        // mood — a fleeing mouse is a flat, hard-to-ignore draw regardless
        // of happiness (see attention.ts's mouseUrgency), so this can't be
        // hoisted out of the loop as a single per-pet value the way item/
        // social urgency are.
        for (const mouseId in mice) {
          if (mouseClaimed.has(mouseId)) continue
          const mouse = mice[mouseId]
          if (mouse.state === 'held') continue
          const urgency = mouseUrgency(pet, mouse.state)
          if (urgency <= 0) continue
          const distance = Math.hypot(
            mouse.position.x - pet.position.x,
            mouse.position.y - pet.position.y,
          )
          const score = attentionScore(urgency, distance, pet.attentionSpan)
          if (score > bestScore) {
            bestScore = score
            bestTarget = { kind: 'mouse', id: mouseId, position: mouse.position }
          }
        }

        const ownSocialUrgency = socialUrgency(pet)
        if (ownSocialUrgency > 0) {
          for (const otherId in pets) {
            if (otherId === id || socialClaimed.has(otherId)) continue
            const other = pets[otherId]
            if (
              other.inSuitcase ||
              other.action === 'held' ||
              other.action === 'playing' ||
              other.action === 'petting'
            )
              continue
            const distance = Math.hypot(
              other.position.x - pet.position.x,
              other.position.y - pet.position.y,
            )
            const score = attentionScore(ownSocialUrgency, distance, pet.attentionSpan)
            if (score > bestScore) {
              bestScore = score
              bestTarget = { kind: 'cat', id: otherId, position: other.position }
            }
          }
        }

        let decided = updatePetBehavior(pet, { now, sceneBounds: state.sceneBounds, bestTarget })

        if (decided.targetItemId && decided.targetItemId !== pet.targetItemId) {
          claimed.add(decided.targetItemId)
          const claimedItem = sceneItems[decided.targetItemId]
          if (claimedItem) sceneItems[decided.targetItemId] = { ...claimedItem, claimedBy: id }
          // A hungry-meow payoff for the same urgency threshold that
          // already breaks a cat into a gallop toward food (gaits.ts) —
          // only on freshly deciding to go for it, not every tick still
          // walking there.
          const claimedDefinition =
            claimedItem && ITEM_DEFINITIONS.find((d) => d.id === claimedItem.itemTypeId)
          if (claimedDefinition?.category === 'food' && pet.needs.hunger < URGENT_HUNGER) {
            playSound('hungry')
          }
        }
        // Redirecting to someone else (or giving up entirely) without ever arriving must release
        // the old claim, or the abandoned partner waits forever for a cat that's already moved on
        // (behaviorFSM's 'idle'/'sitting' cases return early whenever `socialClaimedBy` is set).
        if (pet.targetPetId && pet.targetPetId !== decided.targetPetId) {
          socialClaimsToRelease[pet.targetPetId] = id
        }
        if (decided.targetPetId && decided.targetPetId !== pet.targetPetId) {
          socialClaimed.add(decided.targetPetId)
          newSocialClaims[decided.targetPetId] = id
        }
        if (decided.targetMouseId && decided.targetMouseId !== pet.targetMouseId) {
          mouseClaimed.add(decided.targetMouseId)
          const claimedMouse = mice[decided.targetMouseId]
          if (claimedMouse) {
            mice = { ...mice, [decided.targetMouseId]: { ...claimedMouse, claimedBy: id } }
          }
        }

        // Keep chasing a moving target (e.g. a rolling ball, or a cat that
        // hasn't noticed it's being approached yet) by re-aiming at its
        // current position every frame, rather than the stale spot it was
        // at the moment it got claimed.
        if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetItemId
        ) {
          const target = sceneItems[decided.targetItemId]
          if (target) decided = { ...decided, destination: target.position }
        } else if (decided.action === 'walking' && decided.targetPetId) {
          const target = pets[decided.targetPetId]
          if (target && !target.inSuitcase) {
            decided = {
              ...decided,
              destination: { x: target.position.x + 50, y: target.position.y },
            }
          } else {
            // Target vanished (picked up, put away) — give up and reconsider.
            decided = { ...decided, action: 'idle', destination: null, targetPetId: null }
          }
        } else if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetMouseId
        ) {
          const target = mice[decided.targetMouseId]
          if (target && target.state !== 'held') {
            decided = { ...decided, destination: target.position }
          } else {
            // Caught by someone else, or otherwise vanished — give up.
            decided = { ...decided, action: 'idle', destination: null, targetMouseId: null }
          }
        }

        // Sneaking up on a grounded toy: within stalking range but not yet
        // close enough to pounce, drop the trot into a crouched slink
        // instead — see STALK_RANGE. If the toy rolls back out of range
        // mid-stalk, resume a normal trot rather than staying crouched.
        if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetItemId &&
          !decided.jump
        ) {
          const target = sceneItems[decided.targetItemId]
          const definition = target && ITEM_DEFINITIONS.find((d) => d.id === target.itemTypeId)
          if (target && definition?.category === 'toy' && target.height <= 0.5) {
            const dist = Math.hypot(
              target.position.x - decided.position.x,
              target.position.y - decided.position.y,
            )
            if (dist < STALK_RANGE && dist > POUNCE_RANGE && decided.action === 'walking') {
              decided = { ...decided, action: 'stalking' }
            } else if (dist >= STALK_RANGE && decided.action === 'stalking') {
              decided = { ...decided, action: 'walking' }
            }
          }
        }

        // Close enough to a grounded toy — leap the last stretch instead
        // of walking right up to it. Lives here (not the FSM) because it
        // needs the item's definition and live position; the same reason
        // arrival/consumption is handled centrally below.
        if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetItemId &&
          !decided.jump
        ) {
          const target = sceneItems[decided.targetItemId]
          const definition = target && ITEM_DEFINITIONS.find((d) => d.id === target.itemTypeId)
          if (target && definition?.category === 'toy' && target.height <= 0.5) {
            const pounceDist = Math.hypot(
              target.position.x - decided.position.x,
              target.position.y - decided.position.y,
            )
            if (pounceDist < POUNCE_RANGE && pounceDist > POUNCE_MIN_RANGE) {
              decided = {
                ...decided,
                action: 'pouncing',
                jump: {
                  from: decided.position,
                  to: target.position,
                  progressMs: 0,
                  durationMs: POUNCE_BASE_MS + pounceDist * POUNCE_MS_PER_PX,
                },
              }
            }
          }
        }

        // Sneaking up on a mouse — identical shape to the toy stalk above,
        // just no category/height gate since every mouse qualifies.
        if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetMouseId &&
          !decided.jump
        ) {
          const target = mice[decided.targetMouseId]
          if (target && target.state !== 'held') {
            const dist = Math.hypot(
              target.position.x - decided.position.x,
              target.position.y - decided.position.y,
            )
            if (dist < STALK_RANGE && dist > POUNCE_RANGE && decided.action === 'walking') {
              decided = { ...decided, action: 'stalking' }
            } else if (dist >= STALK_RANGE && decided.action === 'stalking') {
              decided = { ...decided, action: 'walking' }
            }
          }
        }

        // Close enough to a mouse — leap the last stretch, same as a toy
        // pounce. The leap itself is what a sneaking mouse finally
        // notices — even a successful stalk ends here, not before, so it
        // gets flagged 'fleeing' the instant the jump is thrown, before
        // this tick's mouse-AI pass next tick has a chance to react.
        if (
          (decided.action === 'walking' || decided.action === 'stalking') &&
          decided.targetMouseId &&
          !decided.jump
        ) {
          const targetMouseId = decided.targetMouseId
          const target = mice[targetMouseId]
          if (target && target.state !== 'held') {
            const pounceDist = Math.hypot(
              target.position.x - decided.position.x,
              target.position.y - decided.position.y,
            )
            if (pounceDist < POUNCE_RANGE && pounceDist > POUNCE_MIN_RANGE) {
              decided = {
                ...decided,
                action: 'pouncing',
                jump: {
                  from: decided.position,
                  to: target.position,
                  progressMs: 0,
                  durationMs: POUNCE_BASE_MS + pounceDist * POUNCE_MS_PER_PX,
                },
              }
              mice = {
                ...mice,
                [targetMouseId]: scareMouse(
                  target,
                  now,
                  state.sceneBounds,
                  mouseTopMargin,
                  decided.position,
                  holePosition,
                ),
              }
              // A pounce can catch a mouse mid-cheese-run — scareMouse just
              // cleared its own targetCheeseId, but the cheese item's claim
              // needs releasing too, same discipline as every other
              // abandoned-target claim this tick.
              if (
                target.targetCheeseId &&
                sceneItems[target.targetCheeseId]?.claimedBy === targetMouseId
              ) {
                sceneItems[target.targetCheeseId] = {
                  ...sceneItems[target.targetCheeseId],
                  claimedBy: null,
                }
              }
              if (target.state !== 'fleeing') playSound('squeak')
            }
          }
        }

        const chasingFleeingMouse = !!(
          decided.targetMouseId && mice[decided.targetMouseId]?.state === 'fleeing'
        )
        let finalPet = movePet(decided, deltaMs, chasingFleeingMouse)

        // Arrived at a targeted item this tick — use it: apply its effect
        // and switch to an eating/sleeping/playing animation. Consumables
        // (food, toys, grooming) then vanish from the room; furniture
        // (bed, litter box) stays put and just releases its claim so it's
        // free for any cat — including this one — to use again later. If
        // it's still airborne (mid-bounce, or the player just re-threw
        // it), don't "use" something floating above the floor — just give
        // up this attempt and reconsider next cycle.
        const wasApproaching =
          pet.action === 'walking' ||
          pet.action === 'stalking' ||
          pet.action === 'pouncing' ||
          decided.action === 'pouncing'
        if (wasApproaching && finalPet.action === 'idle' && finalPet.targetItemId) {
          const placedItem = sceneItems[finalPet.targetItemId]
          const definition =
            placedItem && ITEM_DEFINITIONS.find((d) => d.id === placedItem.itemTypeId)
          const missedIt =
            placedItem &&
            Math.hypot(
              placedItem.position.x - finalPet.position.x,
              placedItem.position.y - finalPet.position.y,
            ) > POUNCE_MISS_DISTANCE
          if (placedItem && definition && placedItem.height <= 0.5 && !missedIt) {
            let needs = finalPet.needs
            for (const key in definition.effect) {
              const need = key as keyof Needs
              const amount = definition.effect[need] ?? 0
              needs = { ...needs, [need]: clamp(needs[need] + amount) }
            }
            const action: ActionState =
              definition.category === 'food'
                ? 'eating'
                : definition.category === 'bed'
                  ? 'sleeping'
                  : 'playing'
            finalPet = { ...finalPet, needs, action, targetItemId: null, actionStartedAt: now }
            if (action === 'eating' || action === 'playing') playSound(action)
            if (definition.consumable) {
              delete sceneItems[placedItem.id]
            } else {
              sceneItems[placedItem.id] = { ...placedItem, claimedBy: null }
            }
          } else {
            // Giving up (item airborne, or a pounce that missed) — release
            // the claim too, or nobody could ever target this item again.
            if (placedItem) sceneItems[placedItem.id] = { ...placedItem, claimedBy: null }
            finalPet = { ...finalPet, targetItemId: null }
            // A growl only for an actual missed leap, not just "walked up
            // and the item had already rolled off" — pet.action captures
            // what this cat was doing *before* this tick's landing.
            if (pet.action === 'pouncing') playSound('growl')
          }
        }

        // Landed a mouse pounce — same shape as the toy arrival above, but
        // catching doesn't delete anything: the mouse goes into the cat's
        // jaws (action 'holdingMouse'; see its store-side chuck timeout
        // near the top of this loop) rather than being consumed outright.
        if (wasApproaching && finalPet.action === 'idle' && finalPet.targetMouseId) {
          const targetMouse = mice[finalPet.targetMouseId]
          const missedIt =
            !targetMouse ||
            targetMouse.state === 'held' ||
            // Mid-chuck-hop: its eased jump barely moves it the instant it's
            // thrown, so the FSM re-targeting its live (near-stationary)
            // position would otherwise let the cat "arrive" and re-catch it
            // on the very next tick — never actually chasing it. Treating an
            // airborne mouse as an automatic miss forces the hop to land
            // (MOUSE_CHUCK_DURATION_MS) and real fleeing to start before it
            // can be caught again.
            targetMouse.jump !== null ||
            Math.hypot(
              targetMouse.position.x - finalPet.position.x,
              targetMouse.position.y - finalPet.position.y,
            ) > MOUSE_CATCH_DISTANCE
          if (targetMouse && !missedIt) {
            mice = {
              ...mice,
              [finalPet.targetMouseId]: {
                ...targetMouse,
                state: 'held',
                heldBy: id,
                destination: null,
                jump: null,
              },
            }
            finalPet = {
              ...finalPet,
              action: 'holdingMouse',
              actionStartedAt: now,
              needs: { ...finalPet.needs, happiness: clamp(finalPet.needs.happiness + 20) },
            }
            playSound('playing')
          } else {
            // Missed — it noticed and darted clear (already flagged
            // 'fleeing' the instant the pounce was thrown, above). Release
            // the claim too, or nobody could ever target this mouse again.
            if (targetMouse) {
              mice = { ...mice, [finalPet.targetMouseId]: { ...targetMouse, claimedBy: null } }
            }
            finalPet = { ...finalPet, targetMouseId: null }
            if (pet.action === 'pouncing') playSound('growl')
          }
        }

        // A soft ambient loop while actually asleep — covers both ways a
        // cat gets there this tick (arriving at a bed, or collapsing right
        // here from sheer exhaustion; see behaviorFSM.ts's 'idle' case),
        // since both already show up as this single before/after
        // comparison by the time we get here.
        if (pet.action !== 'sleeping' && finalPet.action === 'sleeping') {
          startLoop(id, 'sleepyPurrLoop', 0.3)
        } else if (pet.action === 'sleeping' && finalPet.action !== 'sleeping') {
          stopLoop(id)
        }

        moved[id] = finalPet
      }

      // Release claims abandoned this tick before applying fresh ones below — checked against the
      // releasing pet's own id so a fresh claim someone else made on the same target this same tick
      // is never wiped out.
      for (const targetId in socialClaimsToRelease) {
        if (
          moved[targetId] &&
          moved[targetId].socialClaimedBy === socialClaimsToRelease[targetId]
        ) {
          moved[targetId] = { ...moved[targetId], socialClaimedBy: null }
        }
      }

      // Apply newly-made social claims so the claimed cat waits in place
      // starting next tick, and shows up excluded for anyone else.
      for (const targetId in newSocialClaims) {
        if (moved[targetId])
          moved[targetId] = { ...moved[targetId], socialClaimedBy: newSocialClaims[targetId] }
      }

      // Mutual arrival: a pet that just finished walking toward another cat
      // (rather than an item) triggers shared 'playing' for both of them —
      // this needs the full `moved` record for the OTHER pet, which may not
      // have been processed yet during the loop above, so it's a separate
      // pass over the now-complete result.
      for (const id in moved) {
        const before = pets[id]
        const after = moved[id]
        if (before?.action === 'walking' && after.action === 'idle' && after.targetPetId) {
          const partner = moved[after.targetPetId]
          if (
            partner &&
            !partner.inSuitcase &&
            partner.action !== 'held' &&
            partner.action !== 'playing'
          ) {
            playSound('playing')
            // `partner` is being pulled into playing with the arriving `id` regardless of what it
            // was independently doing — if it was itself mid-pursuit of some OTHER cat, that pursuit
            // is about to be discarded (targetPetId overwritten below), so release the claim it was
            // holding there too, or that third cat waits forever for a partner who's moved on.
            if (
              partner.targetPetId &&
              partner.targetPetId !== id &&
              moved[partner.targetPetId]?.socialClaimedBy === partner.id
            ) {
              moved[partner.targetPetId] = {
                ...moved[partner.targetPetId],
                socialClaimedBy: null,
              }
            }
            moved[id] = {
              ...after,
              action: 'playing',
              actionStartedAt: now,
              needs: {
                ...after.needs,
                happiness: clamp(after.needs.happiness + SOCIAL_HAPPINESS_BOOST),
              },
            }
            moved[after.targetPetId] = {
              ...partner,
              action: 'playing',
              actionStartedAt: now,
              targetPetId: id,
              socialClaimedBy: null,
              needs: {
                ...partner.needs,
                happiness: clamp(partner.needs.happiness + SOCIAL_HAPPINESS_BOOST),
              },
            }
          } else {
            // Arrived, but the partner became unavailable in the meantime (picked up, put away,
            // already playing with someone else) — release the claim `id` was holding on them, or
            // they'd wait forever for a partner who already gave up.
            if (moved[after.targetPetId]?.socialClaimedBy === id) {
              moved[after.targetPetId] = { ...moved[after.targetPetId], socialClaimedBy: null }
            }
            moved[id] = { ...after, targetPetId: null }
          }
        }
      }

      // Held mice ride along at their holder's mouth — same idea as a
      // player dragging a pet, just driven by the holder's live position
      // instead of a pointer. A fleeing mouse that's reached the hole
      // escapes outright, its goal met.
      for (const mouseId in mice) {
        const mouse = mice[mouseId]
        if (mouse.state === 'held' && mouse.heldBy) {
          const holder = moved[mouse.heldBy]
          if (holder) {
            const facingLeft = holder.facing === 'left'
            mice = {
              ...mice,
              [mouseId]: {
                ...mouse,
                facing: holder.facing,
                position: {
                  x:
                    holder.position.x +
                    (facingLeft ? SVG_WIDTH - MOUSE_MOUTH_LOCAL_X : MOUSE_MOUTH_LOCAL_X),
                  y: holder.position.y + MOUSE_MOUTH_LOCAL_Y,
                },
              },
            }
          }
        } else if (mouse.state === 'fleeing') {
          const distToHole = Math.hypot(
            mouse.position.x - holePosition.x,
            mouse.position.y - holePosition.y,
          )
          if (distToHole < MOUSE_HOLE_DESPAWN_RANGE) {
            const next = { ...mice }
            delete next[mouseId]
            mice = next
          }
        }
      }

      // Tail physics run every frame for every non-suitcased pet, regardless
      // of whether that pet actually moved this tick — see tailPhysics.ts.
      // getTailAnchorLocal is facing-aware (mirrors the attach point itself
      // for a left-facing cat), so the anchor a facing-flipped cat's chain
      // follows jumps straight to the correct side the same tick facing
      // changes — the chain's own easing then carries the segments there
      // smoothly, the same as it handles any other anchor movement, with
      // no separate one-shot correction needed at the flip instant.
      const tailSegments: Record<string, Point[]> = {}
      for (const id in moved) {
        if (moved[id].inSuitcase) continue
        const pet = moved[id]
        const anchorLocal = getTailAnchorLocal(pet, now)
        const anchorWorld = { x: pet.position.x + anchorLocal.x, y: pet.position.y + anchorLocal.y }

        const segments =
          state.tailSegments[id] ?? initialSegments(anchorWorld, TAIL_SEGMENTS, TAIL_LINK_LENGTH)
        tailSegments[id] = stepChain(segments, anchorWorld, TAIL_LINK_LENGTH)
      }

      return {
        pets: moved,
        sceneItems,
        mice,
        decayAccumulatorMs: accumulator,
        tailSegments,
        panelPosition,
        panelVelocity,
        mouseHolePeeking,
        mouseHolePeekStartedAt,
        nextMouseHolePeekAt,
      }
    }),

  selectPet: (petId) => set({ selectedPetId: petId }),

  startDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: {
          ...pets,
          [petId]: {
            ...pets[petId],
            action: 'held',
            destination: null,
            targetItemId: null,
            targetPetId: null,
            jump: null,
            currentSpeed: 0,
          },
        },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
      }
    }),

  startPetting: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet || pet.inSuitcase) return state
      // An aloof cat (low affection) doesn't purr for it — a single hiss
      // instead, a small audio payoff for the personality trait.
      if (pet.affection < 25) {
        playSound('hiss')
      } else {
        startLoop(petId, 'purrLoop', 0.35)
      }
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: {
          ...pets,
          [petId]: {
            ...pets[petId],
            action: 'petting',
            destination: null,
            targetItemId: null,
            targetPetId: null,
            jump: null,
            currentSpeed: 0,
          },
        },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
      }
    }),

  endPetting: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      stopLoop(petId)
      if (!pet || pet.action !== 'petting') return state
      return {
        pets: {
          ...state.pets,
          [petId]: { ...pet, action: 'idle', actionStartedAt: performance.now() },
        },
      }
    }),

  dragPetTo: (petId, x, y) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return { pets: { ...state.pets, [petId]: { ...pet, position: { x, y } } } }
    }),

  endDragPet: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet || pet.action !== 'held') return state
      return {
        pets: {
          ...state.pets,
          [petId]: { ...pet, action: 'idle', actionStartedAt: performance.now() },
        },
      }
    }),

  putPetInSuitcase: (petId) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      // A sleeping (or, in principle, mid-pet) cat put away shouldn't keep
      // purring from inside the suitcase forever — stopLoop is a no-op if
      // this id has no active loop, so this is safe to call unconditionally.
      stopLoop(petId)
      const pets = releaseSocialClaims(state.pets, petId)
      return {
        pets: {
          ...pets,
          [petId]: {
            ...pets[petId],
            inSuitcase: true,
            action: 'idle',
            destination: null,
            targetItemId: null,
            targetPetId: null,
            jump: null,
            currentSpeed: 0,
          },
        },
        sceneItems: releaseClaim(state.sceneItems, pet.targetItemId),
        selectedPetId: state.selectedPetId === petId ? null : state.selectedPetId,
      }
    }),

  takePetFromSuitcase: (petId, position) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return {
        pets: {
          ...state.pets,
          [petId]: {
            ...pet,
            inSuitcase: false,
            position,
            action: 'idle',
            actionStartedAt: performance.now(),
          },
        },
      }
    }),

  placeItem: (itemTypeId, position) =>
    set((state) => {
      const id = nanoid()
      // A small starting height so every placed item visibly drops onto
      // the floor rather than just appearing there — reinforces that it
      // actually exists in the room's space, not just painted on the rug.
      const placedItem: PlacedItem = {
        id,
        itemTypeId,
        position,
        height: PLACE_DROP_HEIGHT,
        velocity: { x: 0, y: 0 },
        verticalVelocity: 0,
        claimedBy: null,
        held: false,
      }
      return { sceneItems: { ...state.sceneItems, [id]: placedItem } }
    }),

  startDragItem: (itemId) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      return {
        sceneItems: {
          ...state.sceneItems,
          [itemId]: {
            ...item,
            held: true,
            velocity: { x: 0, y: 0 },
            height: 0,
            verticalVelocity: 0,
            claimedBy: null,
          },
        },
      }
    }),

  dragItemTo: (itemId, x, y) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      const position = clampToRoom({ x, y }, state.sceneBounds)
      return { sceneItems: { ...state.sceneItems, [itemId]: { ...item, position } } }
    }),

  // `throwVelocity` is the raw swipe velocity computed from the pointer
  // drag. Heavier items get proportionally less speed from the same
  // swipe, and every throw gets some automatic upward lift (like a real
  // toss) so it arcs up and falls back down under gravity instead of
  // sliding flat along the floor. Most of that speed becomes lift/bounce
  // energy rather than ground travel — see GROUND_RATIO.
  endDragItem: (itemId, throwVelocity) =>
    set((state) => {
      const item = state.sceneItems[itemId]
      if (!item) return state
      const definition = ITEM_DEFINITIONS.find((d) => d.id === item.itemTypeId)
      const mass = definition?.physics.mass ?? 1

      const speed = Math.hypot(throwVelocity.x, throwVelocity.y) / mass
      const vx = (throwVelocity.x / mass) * GROUND_RATIO
      const vy = (throwVelocity.y / mass) * GROUND_RATIO
      const verticalVelocity = Math.min(speed * LIFT_RATIO, MAX_LIFT)

      return {
        sceneItems: {
          ...state.sceneItems,
          [itemId]: { ...item, held: false, velocity: { x: vx, y: vy }, verticalVelocity },
        },
      }
    }),

  breedPets: (parentAId, parentBId) =>
    set((state) => {
      const parentA = state.pets[parentAId]
      const parentB = state.pets[parentBId]
      if (!parentA || !parentB || parentA.id === parentB.id) return state

      const genetics: Genetics = breedGenetics(parentA.genetics, parentB.genetics)
      const id = nanoid()
      const kitten: Pet = {
        id,
        name: 'New Kitten',
        needs: { hunger: 80, energy: 80, hygiene: 80, happiness: 80 },
        position: {
          x: (parentA.position.x + parentB.position.x) / 2,
          y: (parentA.position.y + parentB.position.y) / 2,
        },
        destination: null,
        action: 'idle',
        facing: 'right',
        actionStartedAt: performance.now(),
        genetics,
        parentIds: [parentA.id, parentB.id],
        inSuitcase: false,
        targetItemId: null,
        // Not part of the formal genetics system — just a simple average
        // of the parents' attention spans with a little random variation,
        // enough for kittens to feel like they take after their parents.
        attentionSpan: clampAttentionSpan(
          (parentA.attentionSpan + parentB.attentionSpan) / 2 + (Math.random() * 60 - 30),
        ),
        targetPetId: null,
        targetMouseId: null,
        socialClaimedBy: null,
        // Same light inheritance-with-variance pattern as attentionSpan.
        affection: clamp((parentA.affection + parentB.affection) / 2 + (Math.random() * 30 - 15)),
        // A real newborn — starts life as a kitten and grows up in real
        // time, unlike its already-grown parents.
        ageMs: 0,
        currentSpeed: 0,
        stridePhase: 0,
        jump: null,
        actionDurationMs: 0,
      }

      return {
        pets: { ...state.pets, [id]: kitten },
        selectedPetId: id,
      }
    }),

  renamePet: (petId, name) =>
    set((state) => {
      const pet = state.pets[petId]
      if (!pet) return state
      return { pets: { ...state.pets, [petId]: { ...pet, name } } }
    }),

  resetGame: () => {
    clearSavedGame()
    stopAllLoops()
    set({
      pets: freshStarterPets(),
      sceneItems: {},
      mice: {},
      tailSegments: {},
      selectedPetId: null,
      mouseHolePeeking: false,
      mouseHolePeekStartedAt: 0,
      nextMouseHolePeekAt: 0,
    })
  },
}))

// Autosave. tick() calls set() up to 60x/sec, so saving on every single
// state change would hammer localStorage — instead this throttles actual
// writes to at most once every 2 real seconds.
let lastSaveAt = 0
usePetStore.subscribe((state) => {
  const now = Date.now()
  if (now - lastSaveAt < 2000) return
  lastSaveAt = now
  saveToLocalStorage(state.pets, state.sceneItems)
})
