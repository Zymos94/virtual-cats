import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Pet } from '../types/pet'
import { usePetStore } from '../store/petStore'
import { darkenHex, deriveAppearance } from '../game/appearance'
import { mousePosition } from '../game/mousePosition'
import { SVG_HEIGHT, SVG_WIDTH } from '../game/spriteConstants'
import { getLifeStage, getLifeStageScale } from '../game/lifeStage'
import { RUN_SPEED } from '../game/movement'
import { computeLegPoses, type LegPose } from '../game/catPose'
import { bodyPoseFor, selectGait } from '../game/gaits'
import { playSound } from '../game/sound'

interface PetSpriteProps {
  pet: Pet
  selected: boolean
}

const HEAD_PIVOT_LOCAL = { x: 44, y: 32 }

const SPOT_POSITIONS = [
  { x: 24, y: 29, r: 3 },
  { x: 37, y: 38, r: 2.5 },
  { x: 30, y: 25, r: 2 },
]

// Eye geometry, in head-local coordinates (drawn facing right).
const EYE_XS = [55, 63]
const EYE_Y = 23
// Nose/mouth/whiskers all anchor off this one point — just ahead of and
// below the eyes, on the muzzle before the head polygon's front corner
// (74,34).
const NOSE_X = 70
const NOSE_Y = 29
// How long the mouth flashes open in a little "O" after a click-select
// meow — the only vocalization moment PetSprite.tsx has direct visibility
// into (a hungry-meow/hiss/growl are triggered store-side in petStore.ts,
// which has no way to signal a specific render-only mouth shape back).
const MEOW_FLASH_MS = 350

const ATTENTION_RADIUS = 280
const MAX_HEAD_TILT_DEG = 14
// How long a blink holds the eyes shut, out of a per-cat blink period.
const BLINK_MS = 130

// Below this, a still pointer-down-then-up is a click (select); above it,
// movement is a drag. Shared with the hold-to-pet gesture below: staying
// under this threshold for HOLD_TO_PET_MS is what makes it a "hold" rather
// than either a click or a drag.
const CLICK_THRESHOLD_PX = 4
const HOLD_TO_PET_MS = 300

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Cheap stable per-cat number, used to de-synchronize blinking and idle
// gaze drift across cats so they don't all move in lockstep.
function petHash(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff
  return hash
}

// Where this cat's eyes should point, in world coordinates, with how
// strongly they should track it (0..1). Priority: the thing it's actually
// after (toy, other cat, jump landing spot), then where it's headed, then
// the player's nearby cursor. Null means nothing in particular — the
// caller renders a slow idle wander of the gaze instead.
function resolveGazeWorld(pet: Pet): { x: number; y: number; strength: number } | null {
  const state = usePetStore.getState()
  if (pet.jump) return { x: pet.jump.to.x, y: pet.jump.to.y, strength: 1 }
  if (pet.targetItemId) {
    const item = state.sceneItems[pet.targetItemId]
    if (item) return { x: item.position.x, y: item.position.y - item.height, strength: 1 }
  }
  if (pet.targetPetId) {
    const other = state.pets[pet.targetPetId]
    if (other && !other.inSuitcase) {
      return { x: other.position.x + SVG_WIDTH / 2, y: other.position.y + 20, strength: 1 }
    }
  }
  if ((pet.action === 'walking' || pet.action === 'zoomies') && pet.destination) {
    return { x: pet.destination.x, y: pet.destination.y, strength: 0.85 }
  }
  const centerX = pet.position.x + SVG_WIDTH / 2
  const centerY = pet.position.y + SVG_HEIGHT / 2
  const dist = Math.hypot(mousePosition.x - centerX, mousePosition.y - centerY)
  if (dist < ATTENTION_RADIUS) {
    return { x: mousePosition.x, y: mousePosition.y, strength: 1 - dist / ATTENTION_RADIUS }
  }
  return null
}

// One jointed leg: outline under fill (matching how the other outlined
// shapes read), joints shown by the bend at the knee, plus a paw.
function Leg({ pose, fill, stroke }: { pose: LegPose; fill: string; stroke: string }) {
  if (pose.opacity < 0.03) return null
  const d = `M ${pose.hip.x} ${pose.hip.y} L ${pose.knee.x} ${pose.knee.y} L ${pose.foot.x} ${pose.foot.y}`
  return (
    <g opacity={pose.opacity}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={6.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={fill}
        strokeWidth={3.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pose.foot.x}
        cy={pose.foot.y}
        r={2.3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
    </g>
  )
}

export function PetSprite({ pet, selected }: PetSpriteProps) {
  // tailWorld is simulated in plain, facing-agnostic world coordinates
  // (see petStore.tick), so tailLocal (world minus the sprite's own
  // position) is the TRUE offset we want visible on screen. But these
  // circles are drawn inside the same <svg> whose CSS transform mirrors
  // the body/head/legs for facing left — those are fixed shapes authored
  // assuming right-facing, so that mirror is exactly what repositions
  // them correctly. The tail isn't authored that way, so left as-is it
  // would get an unwanted second mirror on top of an already-correct
  // value. Pre-mirroring it here cancels that out, the same trick as
  // getTailAnchorLocal uses for the anchor itself.
  const tailWorld = usePetStore((state) => state.tailSegments[pet.id]) ?? []
  const tailLocal = tailWorld.map((p) => ({
    x: pet.facing === 'left' ? SVG_WIDTH - (p.x - pet.position.x) : p.x - pet.position.x,
    y: p.y - pet.position.y,
  }))

  // Render-side easing state. The component re-renders every frame (the
  // tailSegments subscription updates each tick), so pose and gaze values
  // ease here, purely cosmetically — the simulation itself only knows the
  // discrete action states.
  const easeRef = useRef({
    sit: 0,
    lie: 0,
    shiftX: 0,
    shiftY: 0,
    pupilX: 0,
    pupilY: 0,
    tilt: 0,
    hold: 0,
    holdSwingAmount: 0,
    holdTilt: 0,
    groom: 0,
    stretch: 0,
    knead: 0,
    meowFlashUntil: 0,
    lastNow: performance.now(),
    lastPos: { x: pet.position.x, y: pet.position.y },
  })
  const eased = easeRef.current
  const now = performance.now()
  const dt = clamp((now - eased.lastNow) / 1000, 0, 0.1)
  eased.lastNow = now
  const ease = (current: number, target: number, rate: number) =>
    current + (target - current) * Math.min(1, dt * rate)
  const hash = petHash(pet.id)

  // Grooming and kneading are both done sitting — reuse the seated
  // silhouette as their base pose rather than inventing another one.
  eased.sit = ease(
    eased.sit,
    pet.action === 'sitting' || pet.action === 'grooming' || pet.action === 'kneading' ? 1 : 0,
    6,
  )
  eased.lie = ease(eased.lie, pet.action === 'sleeping' ? 1 : 0, 5)
  const { sit, lie } = eased

  // Idle animations — see catPose.ts for how groom/stretch/knead drive
  // the legs, and below for the head tilt / stretch silhouette. Which
  // groom variant plays is picked once per grooming session (deterministic
  // from id + actionStartedAt, not stored) rather than re-rolled every
  // frame.
  eased.groom = ease(eased.groom, pet.action === 'grooming' ? 1 : 0, 6)
  eased.stretch = ease(eased.stretch, pet.action === 'stretching' ? 1 : 0, 5)
  eased.knead = ease(eased.knead, pet.action === 'kneading' ? 1 : 0, 6)
  // Renamed on destructure — `bodyPose.stretch` (below) is a different,
  // unrelated concept: gallop's per-frame gather/extend, not this action.
  const { groom, stretch: stretchIdle, knead } = eased
  const groomVariant: 'lick' | 'pawWash' =
    Math.floor(pet.actionStartedAt / 137 + hash) % 2 === 0 ? 'lick' : 'pawWash'
  const groomPhase = now / 500 + hash
  const kneadPhase = now / 650 + hash

  // Held by the scruff: track how fast the cat is actually being dragged
  // right now (position delta between renders) and feed it into a swing
  // that lags behind the motion, like a real dangle. Purely cosmetic —
  // the sim only knows the discrete 'held' action, not a velocity.
  const heldNow = pet.action === 'held'
  const vx = dt > 0 ? (pet.position.x - eased.lastPos.x) / dt : 0
  const vy = dt > 0 ? (pet.position.y - eased.lastPos.y) / dt : 0
  eased.lastPos = { x: pet.position.x, y: pet.position.y }
  eased.hold = ease(eased.hold, heldNow ? 1 : 0, 7)
  eased.holdSwingAmount = ease(
    eased.holdSwingAmount,
    heldNow ? clamp(Math.hypot(vx, vy) / 220, 0, 1.4) : 0,
    5,
  )
  eased.holdTilt = ease(eased.holdTilt, heldNow ? clamp(vx / 12, -18, 18) : 0, 6)
  const holdSwingPhase = now / 260 + hash
  // A faint idle sway even when the pointer holds still, so the dangle
  // never looks perfectly frozen — same desync trick as blinking/gaze.
  const holdTiltDeg = eased.hold * (eased.holdTilt + Math.sin(now / 900 + hash) * 2.5)

  const { body, stroke, eye, scale: geneticScale, spotted } = deriveAppearance(pet.genetics)
  const scale = geneticScale * getLifeStageScale(getLifeStage(pet.ageMs))
  const facingLeft = pet.facing === 'left'
  const xScale = facingLeft ? -scale : scale
  const farLegFill = darkenHex(body, 0.82)

  // Gait: stride comes from distance actually traveled (pet.stridePhase),
  // amplitude from real speed — so legs reach further and lift higher at a
  // run, and ease to a stop with the cat instead of cutting off. Which
  // gait (walk/trot/slink/gallop/strut) applies comes from the pet's
  // current action/needs — see selectGait. Chasing a fleeing mouse gets its
  // own gallop trigger, which needs the live Mouse (not just pet.targetMouseId)
  // to know it's actually fleeing, not just sneaking.
  const targetMouseState = usePetStore((state) =>
    pet.targetMouseId ? state.mice[pet.targetMouseId]?.state : undefined,
  )
  const gait = selectGait(pet, targetMouseState === 'fleeing')
  const speed01 = Math.min(1, pet.currentSpeed / RUN_SPEED)
  const moving01 = Math.min(1, pet.currentSpeed / 30)
  const bob =
    -Math.abs(Math.sin(pet.stridePhase)) * (0.5 + 1.3 * speed01) * moving01 * gait.bounceMul
  // Body/head posture the current gait asks for (crouch, proud stance,
  // gallop's stretch-and-gather) — see bodyPoseFor. bodyBob folds the
  // gait's crouch/rise into the same value the legs, body, and head all
  // read, so everything lowers/rises together rather than the legs
  // crouching under a body that stayed put.
  const bodyPose = bodyPoseFor(gait, pet.stridePhase, moving01)
  const bodyBob = bob + bodyPose.heightOffset

  // Airborne arc of a hop/pounce — the ground track is simulated flat (see
  // JumpState), the visible lift happens purely here.
  let hop = 0
  let hopPx = 0
  if (pet.jump) {
    const progress = Math.min(1, pet.jump.progressMs / pet.jump.durationMs)
    hop = Math.sin(Math.PI * progress)
    const jumpDist = Math.hypot(pet.jump.to.x - pet.jump.from.x, pet.jump.to.y - pet.jump.from.y)
    hopPx = hop * Math.min(24, 8 + jumpDist * 0.16)
  }

  const legs = computeLegPoses({
    stridePhase: pet.stridePhase,
    gait,
    speed01,
    moving01,
    sit,
    lie,
    hop,
    bob: bodyBob,
    hold: eased.hold,
    holdSwingPhase,
    holdSwingAmount: eased.holdSwingAmount,
    groom,
    groomVariant,
    groomPhase,
    stretch: stretchIdle,
    knead,
    kneadPhase,
  })

  // Gaze: eyes track a resolved target — pupils inside the eye, the eyes
  // themselves sliding across the face (a fake head-turn that reads as
  // depth), and the head tilting vertically toward it. All in the sprite's
  // right-facing local frame; the svg's CSS mirror maps it for left.
  const gaze = resolveGazeWorld(pet)
  let gazeDx: number
  let gazeDy: number
  let gazeStrength: number
  if (gaze) {
    const headWorldX = pet.position.x + (facingLeft ? SVG_WIDTH - 58 : 58)
    const headWorldY = pet.position.y + EYE_Y
    gazeDx = (gaze.x - headWorldX) * (facingLeft ? -1 : 1)
    gazeDy = gaze.y - headWorldY
    gazeStrength = gaze.strength
  } else {
    // Nothing to look at — the gaze drifts slowly around the room, offset
    // per cat so a group doesn't scan in unison.
    gazeDx = Math.sin(now / 2400 + hash) * 40
    gazeDy = Math.cos(now / 3300 + hash) * 18
    gazeStrength = 0.5
  }
  eased.shiftX = ease(eased.shiftX, clamp(gazeDx / 50, -1, 1) * 3.4 * gazeStrength, 8)
  eased.shiftY = ease(eased.shiftY, clamp(gazeDy / 70, -1, 1) * 1.6 * gazeStrength, 8)
  eased.pupilX = ease(eased.pupilX, clamp(gazeDx / 40, -1, 1) * 1.05 * gazeStrength, 10)
  eased.pupilY = ease(eased.pupilY, clamp(gazeDy / 60, -1, 1) * 0.85 * gazeStrength, 10)
  eased.tilt = ease(
    eased.tilt,
    clamp((gazeDy / 80) * MAX_HEAD_TILT_DEG, -MAX_HEAD_TILT_DEG, MAX_HEAD_TILT_DEG) * gazeStrength,
    8,
  )

  const isHeld = pet.action === 'held'
  const isPetting = pet.action === 'petting'

  // Ear flick: a quick momentary rotation, independently per ear, on a
  // per-cat/per-ear desynced timer — ambient idle detail that plays
  // regardless of the current action (not tied to a discrete pose), same
  // spirit as blinking. Skipped while held (everything's dangling loose
  // already) or deep asleep (ears settle flat, not twitching).
  const EAR_FLICK_MS = 90
  const earFlickActive = !isHeld && lie < 0.5
  function earFlickDeg(earIndex: number): number {
    if (!earFlickActive) return 0
    const period = 5200 + ((hash * (earIndex + 3)) % 2600)
    const t = (now + hash * 71 + earIndex * 3300) % period
    return t < EAR_FLICK_MS ? Math.sin((t / EAR_FLICK_MS) * Math.PI) * 18 : 0
  }

  const blinkPeriod = 3800 + (hash % 1700)
  const blinking = (now + hash * 137) % blinkPeriod < BLINK_MS
  const eyesClosed = isPetting || lie > 0.5 || blinking

  // Mouth: an "O" while eating or mid-meow, a "P" (tongue peeking out,
  // licking) during a flank-lick's own down-stroke, an upside-down-Y the
  // rest of the time. `groomPhase`'s own sine already drives the lick's
  // head-dip (groomHeadPitch below) — reusing it here keeps the tongue
  // flicking out in time with that same dip instead of on its own clock.
  const licking = groom > 0 && groomVariant === 'lick' && Math.sin(groomPhase) > 0.2
  const meowing = now < eased.meowFlashUntil
  const mouthShape: 'Y' | 'O' | 'P' = pet.action === 'eating' || meowing ? 'O' : licking ? 'P' : 'Y'
  // Stable per-cat, not re-rolled every render — same trick as groomVariant.
  const noseColor = hash % 3 === 0 ? '#2b2620' : '#e79aa8'

  // A flank-lick dips the head down toward the cat's own side in a slow
  // rhythmic bob; a paw-wash follows the raised paw with a smaller,
  // quicker dip in time with the wash. catPose.ts doesn't move any leg
  // for 'lick', so this is the entire visible motion for that variant.
  const groomHeadPitch =
    groom > 0
      ? groomVariant === 'lick'
        ? groom * (22 + 6 * Math.sin(groomPhase))
        : groom * (8 + 8 * Math.max(0, Math.sin(groomPhase)))
      : 0

  // The SVG's facing-left flip mirrors rotation sense, so pre-correct the
  // head rotation (gaze tilt + the nose-down droop of falling asleep +
  // the current gait's carriage — forward/low for a slink, chin-up for a
  // strut — plus grooming's dip).
  const headRotateDeg =
    (facingLeft ? -1 : 1) * (eased.tilt + 12 * lie + bodyPose.headPitchDeg + groomHeadPitch)

  // Pets need a three-way gesture (click to select / hold in place to pet /
  // drag to carry) instead of the generic click-or-drag useDraggable gives
  // items and the ball, so this is a bespoke pointer handler rather than a
  // shared hook. Pickup is deferred until real movement is seen — until
  // then a still-held pointer is a candidate for petting, not a drag.
  function onPointerDown(e: ReactPointerEvent) {
    e.preventDefault()
    const startPointer = { x: e.clientX, y: e.clientY }
    const start = pet.position
    const grabOffsetX = e.clientX - start.x
    const grabOffsetY = e.clientY - start.y
    let moved = false
    let petting = false

    const holdTimer = window.setTimeout(() => {
      if (moved) return
      petting = true
      usePetStore.getState().startPetting(pet.id)
    }, HOLD_TO_PET_MS)

    function onMove(ev: PointerEvent) {
      if (petting) return // holding still to pet — not a drag, don't reposition
      const dist = Math.hypot(ev.clientX - startPointer.x, ev.clientY - startPointer.y)
      if (!moved && dist > CLICK_THRESHOLD_PX) {
        moved = true
        window.clearTimeout(holdTimer)
        usePetStore.getState().startDragPet(pet.id)
      }
      if (moved)
        usePetStore.getState().dragPetTo(pet.id, ev.clientX - grabOffsetX, ev.clientY - grabOffsetY)
    }

    function onUp(ev: PointerEvent) {
      window.clearTimeout(holdTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      if (petting) {
        usePetStore.getState().endPetting(pet.id)
      } else if (moved) {
        const droppedOnSuitcase = !!document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest('.game-panel')
        if (droppedOnSuitcase) {
          usePetStore.getState().putPetInSuitcase(pet.id)
        } else {
          usePetStore.getState().endDragPet(pet.id)
        }
      } else {
        usePetStore.getState().selectPet(pet.id)
        playSound('select')
        eased.meowFlashUntil = performance.now() + MEOW_FLASH_MS
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={[
        'pet-sprite',
        selected && 'selected',
        isHeld && 'dragging',
        isPetting && 'petting',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left: pet.position.x, top: pet.position.y }}
      title={pet.name}
      onPointerDown={onPointerDown}
    >
      <svg
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={{
          transform: `scale(${xScale}, ${scale})`,
          transformOrigin: '50% 50%',
          overflow: 'visible',
        }}
      >
        {/* Ground shadow stays on the floor while everything else lifts
            with a hop — the separation is what sells the jump. */}
        <ellipse
          cx={35}
          cy={56}
          rx={16 * (1 - hop * 0.35)}
          ry={2.6}
          fill="#000"
          opacity={0.14 * (1 - hop * 0.5)}
        />

        <g
          style={{
            // Held: the whole cat swings like a pendulum from a pivot near
            // the neck (where a hand would grip the scruff) — everything
            // near that point (the head) barely moves, everything far from
            // it (hips, legs, tail) swings the most, for free, just from
            // where the rotation is anchored.
            transform: `translateY(${-hopPx + eased.hold * 3}px) rotate(${holdTiltDeg}deg)`,
            transformOrigin: '46px 22px',
          }}
        >
          <g>
            {tailLocal.map((seg, i) => (
              <circle
                key={i}
                cx={seg.x}
                cy={seg.y}
                r={4 - i * 0.4}
                fill={body}
                stroke={stroke}
                strokeWidth={1}
              />
            ))}
          </g>

          {legs
            .filter((l) => !l.isNear)
            .map((l, i) => (
              <Leg key={`far-${i}`} pose={l} fill={farLegFill} stroke={stroke} />
            ))}

          {/* Body. Standing (a horizontal ellipse, squashing down onto the
              floor as the cat lies asleep) cross-fades with a purpose-made
              seated silhouette — haunches resting on the ground under an
              upright chest — rather than trying to rotate the standing
              shape into a sit, which never read as more than a tilted
              blob at this size. */}
          <g
            style={{
              // Gallop's stretch-and-gather (bodyPose.stretch, only nonzero
              // for gallop) elongates the body horizontally when extended
              // and compresses it slightly when gathered, on top of the
              // usual bounce/crouch/sleep-squash.
              transform: `translateY(${bodyBob + lie * 6}px) scale(${1 + bodyPose.stretch * 0.06}, ${1 - 0.2 * lie - bodyPose.stretch * 0.03})`,
              transformOrigin: '32px 47px',
            }}
          >
            <g opacity={(1 - sit) * (1 - stretchIdle)}>
              <ellipse
                cx={32}
                cy={34}
                rx={20}
                ry={13}
                fill={body}
                stroke={stroke}
                strokeWidth={2}
              />
              {spotted &&
                SPOT_POSITIONS.map((spot, i) => (
                  <circle key={i} cx={spot.x} cy={spot.y} r={spot.r} fill={stroke} opacity={0.6} />
                ))}
            </g>
            {sit > 0.02 && (
              <g opacity={sit}>
                <circle cx={27} cy={44} r={10} fill={body} stroke={stroke} strokeWidth={2} />
                <ellipse
                  cx={40}
                  cy={33}
                  rx={12}
                  ry={14}
                  transform="rotate(-12 40 33)"
                  fill={body}
                  stroke={stroke}
                  strokeWidth={2}
                />
                {spotted && <circle cx={27} cy={41} r={2.5} fill={stroke} opacity={0.6} />}
              </g>
            )}
            {/* Stretching: a purpose-built silhouette rather than trying
                to pitch the standing ellipse — a lowered chest toward the
                front (larger x) and a raised, arched rump toward the tail
                (smaller x, smaller y), same cross-fade approach as the
                seated silhouette above. */}
            {stretchIdle > 0.02 && (
              <g opacity={stretchIdle}>
                <ellipse
                  cx={42}
                  cy={44}
                  rx={15}
                  ry={8}
                  fill={body}
                  stroke={stroke}
                  strokeWidth={2}
                />
                <ellipse
                  cx={18}
                  cy={27}
                  rx={14}
                  ry={12}
                  fill={body}
                  stroke={stroke}
                  strokeWidth={2}
                />
                {spotted && <circle cx={18} cy={25} r={2.5} fill={stroke} opacity={0.6} />}
              </g>
            )}
          </g>

          {legs
            .filter((l) => l.isNear)
            .map((l, i) => (
              <Leg key={`near-${i}`} pose={l} fill={body} stroke={stroke} />
            ))}

          {/* Front paws tucked visible under the chest when lying. */}
          {lie > 0.05 && (
            <g opacity={lie}>
              <ellipse
                cx={42}
                cy={51.5}
                rx={3.5}
                ry={2}
                fill={body}
                stroke={stroke}
                strokeWidth={1}
              />
              <ellipse
                cx={50}
                cy={51.5}
                rx={3.5}
                ry={2}
                fill={body}
                stroke={stroke}
                strokeWidth={1}
              />
            </g>
          )}

          <g
            style={{
              transform: `translateY(${bodyBob * 0.6 + lie * 5 + bodyPose.headHeightOffset}px) rotate(${headRotateDeg}deg)`,
              transformOrigin: `${HEAD_PIVOT_LOCAL.x}px ${HEAD_PIVOT_LOCAL.y}px`,
            }}
          >
            <polygon points="42,34 50,12 66,12 74,34" fill={body} stroke={stroke} strokeWidth={2} />
            <g
              style={{
                transform: `rotate(${earFlickDeg(0)}deg)`,
                transformOrigin: '52.5px 14.5px',
              }}
            >
              <polygon points="47,14 53,2 58,15" fill={body} stroke={stroke} strokeWidth={1.5} />
            </g>
            <g
              style={{ transform: `rotate(${earFlickDeg(1)}deg)`, transformOrigin: '65px 14.5px' }}
            >
              <polygon points="60,15 65,2 70,14" fill={body} stroke={stroke} strokeWidth={1.5} />
            </g>

            {EYE_XS.map((ex) => {
              const cx = ex + eased.shiftX
              const cy = EYE_Y + eased.shiftY
              if (eyesClosed) {
                // A soft downward arc — the same closed eye works for a
                // blink, deep sleep, and blissed-out petting.
                return (
                  <path
                    key={ex}
                    d={`M ${cx - 2.8} ${cy} Q ${cx} ${cy + 2.2} ${cx + 2.8} ${cy}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.3}
                    strokeLinecap="round"
                  />
                )
              }
              return (
                <g key={ex}>
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={3}
                    ry={2.7}
                    fill="#f8f5ec"
                    stroke={stroke}
                    strokeWidth={0.7}
                  />
                  <circle cx={cx + eased.pupilX} cy={cy + eased.pupilY} r={1.9} fill={eye} />
                  <ellipse
                    cx={cx + eased.pupilX}
                    cy={cy + eased.pupilY}
                    rx={0.65}
                    ry={1.5}
                    fill="#1e1e1e"
                  />
                  <circle
                    cx={cx + eased.pupilX - 0.6}
                    cy={cy + eased.pupilY - 0.7}
                    r={0.45}
                    fill="#fff"
                    opacity={0.85}
                  />
                </g>
              )
            })}

            {/* Whiskers — a simple 3-line fan from the muzzle, same side as
                the visible cheek in this profile view. Purely decorative,
                no per-cat/state variation. */}
            <g stroke={stroke} strokeWidth={0.6} strokeLinecap="round" opacity={0.8}>
              <line x1={NOSE_X - 3} y1={NOSE_Y - 3} x2={NOSE_X + 8} y2={NOSE_Y - 7} />
              <line x1={NOSE_X - 2} y1={NOSE_Y} x2={NOSE_X + 10} y2={NOSE_Y} />
              <line x1={NOSE_X - 3} y1={NOSE_Y + 3} x2={NOSE_X + 8} y2={NOSE_Y + 7} />
            </g>

            <circle
              cx={NOSE_X}
              cy={NOSE_Y}
              r={1.3}
              fill={noseColor}
              stroke={stroke}
              strokeWidth={0.4}
            />

            {mouthShape === 'O' && (
              <ellipse
                cx={NOSE_X - 1}
                cy={NOSE_Y + 3.2}
                rx={1.6}
                ry={2}
                fill="#6b3f3f"
                stroke={stroke}
                strokeWidth={0.6}
              />
            )}
            {mouthShape === 'P' && (
              <g stroke={stroke} strokeWidth={0.8} strokeLinecap="round" fill="none">
                <line x1={NOSE_X - 1} y1={NOSE_Y + 1.5} x2={NOSE_X - 1} y2={NOSE_Y + 6} />
                <circle
                  cx={NOSE_X + 0.6}
                  cy={NOSE_Y + 2.2}
                  r={1.1}
                  fill="#e79aa8"
                  stroke={stroke}
                />
              </g>
            )}
            {mouthShape === 'Y' && (
              <g stroke={stroke} strokeWidth={0.7} strokeLinecap="round" fill="none">
                <path
                  d={`M ${NOSE_X - 1} ${NOSE_Y + 2} Q ${NOSE_X - 4} ${NOSE_Y + 4.5} ${NOSE_X - 6} ${NOSE_Y + 3.5}`}
                />
                <path
                  d={`M ${NOSE_X - 1} ${NOSE_Y + 2} Q ${NOSE_X + 2} ${NOSE_Y + 4.5} ${NOSE_X + 4} ${NOSE_Y + 3.5}`}
                />
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
