# Virtual Cats — Dev Log

Handoff document for picking up development cold, whether that's a future
session with me or a different model entirely. Written 2026-08-17.

## What this is

A from-scratch clone of the Catz 5 / Petz virtual pet games, built as a
**non-commercial hobby/learning project** by a complete programming
beginner. Repo: `github.com/Zymos94/virtual-cats` (private), local path
`~/Projects/virtual-cats`. Browser-only for now (desktop-overlay via
Electron was discussed and deliberately deferred, not ruled out).

The explicit design philosophy, stated directly by the user: **cozy, not
hectic**. Needs decay slowly (a cat left alone should take most of an hour
to actually need something), and the whole point is a low-pressure pet you
check in on, not a game you have to actively manage. Keep this in mind for
any future tuning — the instinct to make things "more engaging" by adding
urgency or faster decay runs against the stated goal.

Explicitly **out of scope**, by the user's own direction: death and illness
mechanics ("avoid death and illness for now"). Don't add them without
asking first.

## Stack

Vite + React 19 + TypeScript, Zustand 5 (state), nanoid (IDs), Vitest
(testing), localStorage (persistence, no backend). `npm run dev` /
`npm run build` / `npm run lint` (oxlint) / `npx vitest run` /
`npx tsc --noEmit -p tsconfig.app.json`.

## Architecture — the one thing to understand first

**Everything runs through a single `requestAnimationFrame` loop** —
`src/game/useGameLoop.ts` — which calls `usePetStore.getState().tick(now, deltaMs)`
every frame. `deltaMs` is clamped to 100ms (`MAX_DELTA_MS`) so a
backgrounded/minimized tab resuming doesn't send physics into a huge single
step. This is the one pattern the codebase is most protective of: **never
add a second RAF loop or a second per-entity `useEffect`-driven physics
loop.** A tail-physics bug earlier in the project (segments freezing when a
cat stopped moving) came directly from physics living in a React effect
tied to position changes instead of the central loop — see the comment
block at the top of `src/game/tailPhysics.ts` for the postmortem.

`src/store/petStore.ts` is the single Zustand store and the single source
of truth for everything: pets, scene items, tail segments, the draggable
UI panel's own position, save/load, time-scale. Its `tick()` function is
one large synchronous pass, in order, roughly:

1. Scale `deltaMs` by `timeScale` (see Speed control below).
2. Step the UI panel's own drag-physics (real time, not scaled).
3. Apply needs decay in fixed 1-second accumulator steps (frame-rate
   independent).
4. Step item physics (gravity/height axis + ground-plane friction/bounces)
   for every placed item.
5. For each non-suitcased pet: age it, then either (a) it's mid-`petting`
   → gain happiness and skip AI entirely, or (b) score every item and
   every other cat through one shared `attentionScore()` function
   (`src/game/attention.ts`) to find the single most-wanted thing, feed
   that into the pure FSM (`src/game/behaviorFSM.ts`) to decide the next
   action/destination, then move it (`src/game/movement.ts`).
6. A second pass resolves mutual cat-cat arrival (shared `playing` state)
   and item consumption, since those need the _other_ entity's
   already-updated state from this same tick.
7. Step tail-chain physics for every pet (`src/game/tailPhysics.ts`'s
   `stepChain`), driven by a facing-aware anchor point
   (`src/game/tailMood.ts`'s `getTailAnchorLocal`).

`src/game/behaviorFSM.ts` is a **pure function**: `(pet, context) → pet`,
no side effects, no store access. All mutation, cross-entity effects, and
claim/exclusivity bookkeeping happen centrally in `tick()`. Keep new
behavior logic pure and push side effects to the store.

## Coordinate model

Scene/world coordinates are plain pixels. Pets and items have a floor
position `{x, y}`. The room has a "wall band" along the top
(`WALL_BAND_FRACTION = 0.18` of room height, in `src/game/roomLayout.ts`)
representing the back wall in a pseudo-3D perspective — floor-bound
entities stay below it. Items additionally have a `height` (z-axis,
gravity-affected) so a thrown ball can arc up _into_ the wall band's
visual space while airborne, constrained back onto the floor plane only
once it lands (see `src/game/itemPhysics.ts` — this exact mechanic has
been bug-prone, see "Recent fixes" below before touching it again).

## File map

- `src/store/petStore.ts` — the store, `tick()`, all mutating actions.
- `src/store/persist.ts` — thin localStorage wrapper (save/load/clear).
- `src/game/behaviorFSM.ts` — pure per-pet decision function.
- `src/game/movement.ts` — walking toward a destination; life-stage speed.
- `src/game/attention.ts` — unified item/cat scoring (urgency × proximity).
- `src/game/itemPhysics.ts` — gravity/height axis + ground bounce/friction.
- `src/game/tailPhysics.ts` / `tailMood.ts` — chain-follow tail physics and
  mood-driven anchor motion (see "Recent fixes" — this took two attempts
  to get right).
- `src/game/genetics.ts` / `src/types/genetics.ts` — Mendelian-style allele
  pairs (furColor/pattern/eyeColor/size), dominance order, mutation chance.
- `src/game/breedName.ts` — genetics → pedestrian name ("Little Gray
  Tabby"), deliberately not a formal breed name.
- `src/game/lifeStage.ts` — kitten/adult/senior derived from accumulated
  `ageMs`, no stored discrete state.
- `src/game/personality.ts` — `affection` trait → label ("Very
  affectionate"/"Aloof").
- `src/game/sound.ts` — thin `HTMLAudioElement` wrapper; one-shots +
  named loops (for the petting purr).
- `src/game/useGameLoop.ts` / `useSceneBounds.ts` / `useDraggable.ts` /
  `mousePosition.ts` — the RAF loop, viewport-size sync, generic
  click-vs-drag hook, and a mutable mouse-position singleton (avoids a
  React re-render on every mousemove).
- `src/components/PetSprite.tsx` — cat rendering; has its _own_ bespoke
  pointer handler (not `useDraggable`) because it needs a three-way
  gesture: click to select / hold-in-place to pet / drag to carry.
- `src/components/ItemSprite.tsx` / `ItemAvatar.tsx` / `CatAvatar.tsx` —
  item rendering/dragging, and the two "avatar" drag-out-of-panel widgets.
- `src/components/GamePanel.tsx` — the unified draggable UI panel (see
  below), replacing three formerly-separate fixed boxes.
- `src/components/Scene.tsx` — pure render: items then pets, in that
  z-order, inside `.scene`.
- `src/data/itemDefinitions.ts` — the 7 item types and their
  `PhysicsProfile` (mass/friction/bounciness).
- `src/types/pet.ts` / `item.ts` — core interfaces.

## Milestone history (condensed)

M1–M7: static pet → needs decay → wandering AI + SVG rendering → multiple
pets/inventory → genetics/breeding → localStorage persistence → editable
names/card layout. M8–M18 (all committed, see `git log`):

- **M8** full-screen room, dynamic scene bounds, wall/floor visual.
- **M9** rendering upgrade (legs, tail clip fix, head tilt toward
  attention) + a same-day follow-up fixing tail-sweep-through-body on
  facing flip and adding mood-driven tail carriage. Then a _separate_
  fix moving tail physics into the central loop (the freezing bug
  mentioned above).
- **M10** generic drag-and-drop (`useDraggable`).
- **M11** suitcase (put cats/items away, two tabs) — since merged into
  `GamePanel`, see below.
- **M12** items as physical objects; cats notice/walk to/consume them.
- **M13** ball physics: pick up, throw, roll, bounce.
- Item physics redesign: pseudo-3D height/gravity axis, per-item material
  profiles, all items draggable (not just the ball).
- Horizon/wall-behavior fix: airborne items can fly up past the wall line,
  only constrained once landed. (This exact area needed _two more_ fixes
  after M18 — see below. If you're touching `itemPhysics.ts`'s boundary
  logic, read that section first.)
- **M14** attention-span utility AI: items and cats compete for a pet's
  attention through one scoring function; real cat-cat social play.
- **M15** furniture: cat bed (energy) + litter box (hygiene) — reusable,
  not consumed, via a `consumable` flag on `ItemDefinition`.
- **M16** direct hand interaction: hold-to-pet gesture (distinct from
  click-select and drag-carry) + `affection` personality trait.
- **M17** aging/life stages (kitten→adult→senior, derived from `ageMs`,
  not stored) + pedestrian breed names.
- **M18** sound: meows/purrs/chirps wired to existing actions, a hiss for
  aloof cats being petted, mute toggle.

### Post-M18 fix/polish round (three separate commits, same day)

1. **Tail clipping + "wags like a dog"** — root cause: the tail's world
   anchor point never accounted for `pet.facing`, so on a left-facing cat
   it was physically anchored near the head instead of the back (the
   SVG's CSS mirror correctly flips the _fixed-shape_ body/head/legs, but
   the tail's physics-simulated position was never part of that
   convention). Fixed by making `getTailAnchorLocal` facing-aware and
   having `PetSprite` pre-mirror the rendered segments to cancel out the
   shared CSS flip. Also replaced CSS-rotation-based idle-sway/flick
   (which could swing an already-simulated shape through the body) with
   mood driving the physics anchor directly — verified via exact DOM
   pixel-math, not just eyeballing screenshots. **If tail weirdness
   recurs, re-derive the facing/mirroring math from scratch rather than
   assuming this fix has a subtle miss** — it was genuinely confusing to
   get right the first time (see the fork commit `8e86c23` message for
   the full reasoning).
2. **Thrown items sliding to the far edge of the room** — two stacked
   bugs: ground friction was gated behind "fully at rest," so a bouncing
   item's ground velocity never decayed for as long as it kept bouncing;
   and a throw put 100% of swipe speed into ground velocity on top of a
   _separate_ vertical lift. Fixed: friction now applies every frame
   regardless of bounce state, and only ~12% of a throw's speed
   (`GROUND_RATIO`) becomes ground travel — most becomes vertical bounce.
   A thrown item now settles near where it was thrown by default; only a
   wall bounce sends it further.
3. **Unified draggable UI panel** — merged three separate fixed boxes
   (stats / suitcase-cats-items / breeding) into one `GamePanel` with four
   tabs, itself draggable with very high friction (`PANEL_FRICTION =
0.97`) so it feels grabbable, not throwable. Runs on real time in
   `tick()` regardless of `timeScale`. The old `.suitcase-panel`
   drop-target CSS class (used by `PetSprite`/`CatAvatar`/`ItemAvatar` to
   detect "dropped back in the menu") is now `.game-panel`.

### M19 (same day, two commits): ball throw fixed for real + natural animation

1. **Ball throw** — the M13/post-M18 physics never actually threw right:
   release velocity was sampled from one ~8ms pointer delta (noisy, and
   stale — pause-then-release launched with pre-pause velocity), only 12%
   of the swipe became travel, friction wrongly applied mid-air, and the
   ball's rolling friction (0.15) was so low that everything else had
   been squashed to compensate. Now: swipe measured over a 100ms window
   (`ItemSprite`), `GROUND_RATIO` 0.55, no air friction, each floor
   bounce scrubs ground speed (`BOUNCE_GROUND_KEEP`), rolling friction +
   a constant `ROLL_DECEL` finish the roll decisively. First test suite
   for `itemPhysics`. Also fixed a claim leak: a cat giving up on an item
   (airborne, or a missed pounce) now releases `claimedBy`.
2. **Natural cat animation** — the big one:
   - _Gaits_: pets carry `currentSpeed` (eased, `ACCEL`/`DECEL`) toward
     amble/trot/run targets by intent (wander vs. wanting something vs.
     zoomies), and `stridePhase` advances by distance traveled — legs
     never skate. All in `movement.ts`.
   - _New actions_: `sitting` (idle cats park on their haunches),
     `zoomies` (happy energetic cats sprint between random points,
     kittens most — chances in `behaviorFSM.ts`), `pouncing` (final
     ~90px approach to a grounded toy becomes a leap; store-side trigger
     in `tick()` next to arrival/consumption). Jumps are a generic
     `pet.jump` ballistic ground-track (`JumpState`) — zoomies also hop
     with it; render derives the visible arc, sim never leaves the floor.
   - _Rendering_ (`PetSprite` + new `catPose.ts`): two-bone IK legs
     (hip→knee→foot, hock/elbow bend toward the tail, far pair darkened
     via `darkenHex`), purpose-built seated silhouette cross-faded with
     the standing body (NOTE: rotating the standing ellipse into a sit
     was tried and looked wrong — don't revisit), lying-asleep squash
     with tucked paws, ground shadow that stays down during hops, and
     real eyes: whites + iris + vertical slit pupils that track a gaze
     target (attention target > destination > nearby mouse, resolved in
     `resolveGazeWorld`), eye positions sliding across the face as a
     fake head-turn, per-cat desynced blinking, closed-eye arcs for
     sleep/petting. Cosmetic easing (sit/lie/gaze) lives in refs inside
     `PetSprite`; the sim only knows discrete actions.
   - Tail anchor drops with posture (`tailMood.ts`) so a seated/lying
     cat's tail pools on the ground.
   - Tests for movement gaits/jumps and the new FSM states (31 total).

Also in this window: **needs decay slowed ~10x** for the cozy-pacing goal,
and a **Sims-style speed control** was added (pause/1x/4x/16x buttons,
`src/components/SaveLoadControls.tsx` + `timeScale` in the store) — it
uniformly scales every `deltaMs`-driven effect (decay, aging, movement,
item physics) without touching wall-clock action-animation timers
(`actionStartedAt` comparisons stay real-time). Useful for both normal
play and fast-forwarding through testing.

### M20: the mouse — a new autonomous creature, not just another item

A live mouse a cat can stalk, pounce on, carry, and chuck — the first entity in the
room that isn't a cat or a physics-driven object.

- **Spawn**: dragged out of the panel as a plain `'prey'`-category item (icon 🐭, same
  generic drop-and-fall as any other item). The instant it's fully at rest —
  `height === 0`, `verticalVelocity === 0`, ground speed under 5px/s, and not mid-drag
  (`!held`) — `petStore.tick()` deletes the `PlacedItem` and replaces it with an
  autonomous `Mouse` in a brand new store slice (`state.mice`, `src/types/mouse.ts`).
  Mice are never persisted (excluded from `SavedState` entirely, like `tailSegments`) —
  a reload always starts with none in the room.
- **Mouse AI** (`src/game/mouseBehavior.ts` / `mouseMovement.ts`): three states —
  `sneaking` (slow, cautious, picks wander points biased _away_ from the nearest cat via
  a cheap reflect-through-self trick), `fleeing` (fast, beelines for a mouse hole if one
  exists, otherwise just runs; calms back to sneaking after `MOUSE_CALM_MS` unbothered),
  `held` (fully inert — the store drives its position, not its own AI). No needs, no
  gaits — much simpler than a cat's FSM, same `(entity, context) → entity` pure shape.
- **Detection has real stakes**: a trotting cat spooks it from `MOUSE_DETECT_RADIUS`
  (150px); a _stalking_ cat only from `MOUSE_STALK_DETECT_RADIUS` (65px) — tighter than
  `petStore.ts`'s `STALK_RANGE` (200, shared with toy-stalking), so a cat that starts
  stalking before crossing the loud radius gets a genuine shot at an undetected approach
  all the way into pounce range. **Caught and fixed during testing**: the first version
  had `MOUSE_DETECT_RADIUS` equal to `STALK_RANGE`, so detection and the stalk-transition
  fired in the same instant — never a real sneak, just a coin flip. Verified the fix with
  deterministic `tick()` stepping: logged a full approach where the mouse stayed
  `'sneaking'` right up to the pounce trigger.
- **Stalk → pounce → catch, reusing the toy mechanic**: `STALK_RANGE`/`POUNCE_RANGE`
  apply to `Pet.targetMouseId` exactly like `targetItemId`, no new thresholds needed. A
  landed pounce checks distance to the mouse's _current_ position (it kept fleeing during
  the leap) against a tighter `MOUSE_CATCH_DISTANCE` (34px, vs. a toy's 48) — a mouse is a
  much smaller target. The leap itself is what a still-sneaking mouse finally notices:
  the pounce-trigger flags it `'fleeing'` the instant the jump is thrown, before impact.
- **Held → chuck → usually re-chases**: a catch moves the cat into `'holdingMouse'` —
  store-side only, never touches the FSM, same reasoning as `'held'`/`'petting'` (starting
  and ending it both mutate the _mouse_ too). After `HOLD_MOUSE_MS` it chucks the mouse
  (a ballistic hop away, reusing `JumpState`) and rolls `MOUSE_RECHASE_CHANCE` (75%) on
  whether to immediately give chase again. A real test run showed three
  catch→chuck→re-catch cycles before the cat finally lost interest.
- **The mouse hole**: also just a normal placeable item (`'hole'` category, non-
  consumable, zero attention-urgency), but `resetGame()` pre-places one against the wall
  by default so there's always somewhere to escape to. A `'fleeing'` mouse within
  `MOUSE_HOLE_DESPAWN_RANGE` (20px) despawns outright — goal met. Rendered as a hand-drawn
  dark arch (`ItemSprite.tsx` special-cases `category === 'hole'`), not the generic emoji
  badge — tuned by eye against the actual wall-gradient CSS stops (`App.css`'s `.scene`
  background) rather than guessed pixel offsets, and needed `display: block` on the
  `<svg>` to kill an inline-element font-baseline gap that was throwing the
  flush-to-the-floor alignment off by a few px.
- **Visuals** (`MouseSprite.tsx`): deliberately minimal per the owner's spec — one grey
  oval body, a thin curved tail, two small circle feet (no joints, no gait — just a
  squash/wiggle scurry), a pink button nose, dot eyes.
- New claim field (`Mouse.claimedBy`, mirroring an item's) prevents two cats beelining
  for the same mouse — caught a real bug in an early draft where it was tracked in a
  tick-local `Set` but never actually written back onto the mouse, so exclusivity quietly
  didn't work across ticks.
- Verified end-to-end with deterministic `tick()` stepping (paused `timeScale`, drove
  `tick()` directly) rather than real-time waits — this session's testing kept racing
  real elapsed time between tool calls otherwise. New tests: `mouseBehavior.test.ts`,
  `mouseMovement.test.ts`.

### M20 addendum (2026-08-18): lives, a double-edged flee, and a hole that isn't an item

Follow-up feedback session, same mouse feature. Three behavioral changes plus one real
bug caught during verification.

- **The mouse hole is now a world feature, not a placeable item.** It was originally a
  `'hole'`-category `PlacedItem` pre-placed by `resetGame()` — meaning a fresh save with
  an empty `sceneItems` had no hole at all. Replaced with `getMouseHolePosition()`
  (`src/game/roomLayout.ts`), a pure function of `sceneBounds` that both `petStore.tick()`
  (a fleeing mouse's goal) and the new `MouseHoleSprite.tsx` call — always exists, always
  exactly on the wall/floor line, survives a window resize. `ItemCategory` lost its
  `'hole'` member entirely.
- **Lives-gated panic**: mice now spawn with `livesRemaining` (2–7, random). Getting
  spotted, pounced at, or chucked all cost a life (via `scareMouse()` in
  `mouseBehavior.ts`) but only send it toward the hole once `livesRemaining <= 0` —
  before that it just flees away from whatever spooked it, in a random direction, same as
  before. Calming back to `'sneaking'` after `MOUSE_CALM_MS` unbothered does **not**
  restore lives — they're a budget for the mouse's whole time in the room, not per
  scare-episode.
- **Fleeing is a double-edged sword**: `mouseUrgency()` (`src/game/attention.ts`) now
  takes the mouse's state — a flat `MOUSE_FLEEING_URGENCY` (45) once `'fleeing'`,
  regardless of any cat's mood, vs. a small mood-scaled fraction while merely `'sneaking'`.
  A fleeing mouse is a magnet for _every_ nearby cat's attention scoring, not just
  whichever one spooked it — verified live: a content cat (happiness 95, otherwise
  totally uninterested in a sneaking mouse even at close range) switched straight to
  pouncing the instant a different cat's chuck sent the mouse fleeing past it.
- **Bug found and fixed during this verification**: chucking a caught mouse threw it via
  a `JumpState` hop, but the catch-on-arrival check (the same block that lands a fresh
  pounce) didn't exclude a mouse still mid-hop. Because the FSM re-targets a mouse's
  _live_ position every tick, and the hop's easing barely moves it in the first ~16ms,
  the cat's own destination would collapse to "basically where I already am" and register
  an instant re-catch one tick after every chuck — the mouse never got real separation.
  Caught via deterministic stepping: `livesRemaining` was spiraling arbitrarily negative
  (a mouse observed at −25) while `state` never left `'fleeing'`/`'held'`, and the "usually
  keeps pursuing" mechanic was actually "always instantly re-grabs." Fixed by treating a
  mouse with a non-null `jump` as an automatic miss in the catch check — forces the chuck's
  `MOUSE_CHUCK_DURATION_MS` hop to actually land, and real AI-driven fleeing to start,
  before it can be caught again. Re-verified with the same deterministic scenario: lives
  now decrement realistically (seconds apart, not one tick apart), and a mouse that
  reaches zero lives successfully flees to the hole and despawns.
- **Tail flick fix**: the `'agitated'` mood's flick (`tailMood.ts`) only ever visibly
  moved the base of the tail, never the tip. Root cause was signal timing, not geometry —
  `stepChain`'s per-segment easing (`tailPhysics.ts`, `EASE = 0.35`, applied once per real
  frame) takes ~250–350ms to carry a sudden anchor movement all the way down 6 segments,
  and the original flick's outward snap lasted only ~125ms — reversing direction before it
  could ever propagate past the first segment or two. Fixed by lengthening the snap phase
  (`SNAP_FRACTION` 0.18 → 0.4 of a longer 1000ms period, was 700ms). Verified: sampling
  segment position relative to the body over ~1s of walking showed the tip swinging ~18px
  vs. the base's ~8px — the reverse of the original bug.
- **Tail body-attachment fix**: `getTailAnchorLocal` computed its anchor from the pet's
  _simulated_ position only, but `PetSprite.tsx` layers render-only cosmetic offsets on
  top (gait-driven crouch/rise for slink/strut/gallop, and the stretching pose's raised
  rump) that the store never otherwise sees — so the tail's simulated attachment point
  could visually diverge from where the body was actually drawn, reading as the tail
  disconnecting mid-gait or mid-stretch. Fixed by folding a matching
  `gait.bodyHeight * moving01` term (mirroring `PetSprite`'s own body-bob formula) and a
  `stretching`-specific offset into the anchor's Y. New `tailMood.test.ts` coverage;
  verified visually across idle, walking, and stretching.
- **Found but not fixed — noted for later**: while forcing an unnatural pet-action swap
  directly through `setState` (bypassing the FSM entirely, not something normal gameplay
  ever does) to stage a tail screenshot, `stepChain` diverged into `NaN`/astronomical
  values and never recovered. Root cause is the `dist || 0.0001` fallback in
  `tailPhysics.ts` — when a segment lands almost exactly on its anchor, the
  `dx/dist`/`dy/dist` normalization becomes numerically unstable, and a bad value then
  feeds forward into every later segment and every future tick with no damping to pull it
  back. Not reachable through any normal FSM-driven action transition (confirmed idle →
  stretching → walking stayed numerically stable over 200 ticks), so left alone for now —
  but a save/load or future feature that ever teleports a pet or swaps its action outside
  the FSM should watch for this.
- Verified all of the above with the same deterministic `tick()`-stepping approach as
  M20, plus live visual checks in the browser for the two tail fixes. New/updated tests:
  `attention.test.ts` (new), `mouseBehavior.test.ts` and `mouseMovement.test.ts` (rewritten
  for the lives mechanic), `tailMood.test.ts` (new describe block).

### Two more bugs, reported after a real play session (2026-08-18)

The user loaded the game after the M20 addendum shipped and reported two very concrete
symptoms: "the yellow cat runs around and does what he's meant to, the other two just
stand there," and "the mouse only spawns from the mouseball at 1x speed." Both were
pre-existing bugs, unrelated to the round-2 mouse changes themselves — the mouse feature
just happened to be what surfaced the second one.

- **Two cats permanently frozen — a stale `socialClaimedBy` claim.** `behaviorFSM.ts`'s
  `'idle'` (and `'sitting'`) case returns early, doing nothing at all, whenever
  `pet.socialClaimedBy` is set (correct — it's meant to make a claimed cat wait in place
  for a partner on the way over). The bug: nothing ever released a claim once the claiming
  cat gave up on it without arriving. Reproduced deterministically with the three starter
  pets (identical needs, so all three want company at once): Tom set out toward Whiskers
  and Mittens set out toward Tom; before Tom arrived, Mittens reached Tom first and their
  mutual-arrival code (`petStore.ts`) forcibly overwrote Tom's `targetPetId` to point at
  Mittens instead so they could start `'playing'` together — silently discarding Tom's own
  claim on Whiskers. Whiskers sat there `socialClaimedBy: 'pet-3'` forever, permanently
  excluded from ever reconsidering anything, even though Tom had completely forgotten
  about it. Fixed two related gaps: (1) whenever a pet's own decided `targetPetId` changes
  away from its previous one (redirecting, or simply giving up), the old target's claim is
  now released via a `socialClaimsToRelease` map applied before that tick's fresh claims,
  checked against the releasing pet's own id so an unrelated fresh claim on the same target
  is never wiped; (2) in the mutual-arrival block itself, when the arriving cat's claim on
  the passive partner forcibly overwrites that partner's `targetPetId`, any claim the
  partner was independently holding elsewhere is released too, for the same reason. Also
  covered the "arrived but partner became unavailable" miss branch, which had the same
  gap. Verified by re-running the same three-pet scenario for a full simulated 95 seconds:
  all three now cycle continuously through sitting/grooming/kneading/zoomies/wandering
  with no permanently-`null`-yet-stuck cat.
- **Mouse only converts to a creature at 1x speed — a discretized-bounce fixed point.**
  `petStore.tick` scales `deltaMs` by `timeScale` (4x/16x can mean up to 1600ms in a single
  physics step, since `useGameLoop`'s `MAX_DELTA_MS` clamp runs _before_ that
  multiplication, not after). `itemPhysics.ts`'s height/gravity integration is a plain
  Euler step, which only approximates continuous bounce physics well for small steps — at
  a large enough step, gravity accelerates a falling item so much within that one step that
  its bounce-off velocity (`-verticalVelocity * bounciness`) can land on an exact repeating
  value tick after tick, an artifact of the coarse discretization rather than real physics
  (which loses energy every bounce and eventually settles). Confirmed directly: at a
  16x-equivalent step size the mouse item's `verticalVelocity` locked onto a constant
  ~77px/s forever, so it never registered as settled and never converted into a `Mouse`.
  Fixed two ways: (1) `stepItemPhysics` now substeps internally at a small fixed size
  (`PHYSICS_SUBSTEP_MS = 20`) regardless of the caller's `deltaMs`, restoring the
  small-step stability `MAX_DELTA_MS` was originally meant to guarantee; (2) belt-and-
  suspenders, the landing check now also snaps to a full stop if the _resulting_ bounce
  would be smaller than `Z_STOP_THRESHOLD` (not just the incoming impact speed), since
  substepping alone only shrinks a fixed-point artifact's amplitude, it doesn't guarantee
  eliminating it at every possible step size. Verified the mouse item now converts
  consistently in ~300–500ms of simulated time at 1x, 4x, and 16x alike.

### M21: a hole that comes alive on its own, cheese, and more sound (2026-08-18)

Follow-up feature request on top of the mouse work, four small asks bundled together plus
a mouth-position fix caught along the way:

- **The mouse hole occasionally acts on its own.** On a random interval
  (`MOUSEHOLE_PEEK_MIN/MAX_INTERVAL_MS`, 20–50s) two eyes peek out of the hole for
  `MOUSEHOLE_PEEK_DURATION_MS` (1.4s); `MOUSEHOLE_SPAWN_CHANCE` (40%) of those peeks spawn
  a fresh mouse right there. Timer state (`mouseHolePeeking`, `mouseHolePeekStartedAt`,
  `nextMouseHolePeekAt`) lives in the store but isn't persisted — same reasoning as mice
  themselves, a reload just starts with nothing scheduled yet (0 is a sentinel meaning
  "schedule from this tick's own `now`" rather than firing instantly on load). Verified
  deterministically over ~960 simulated seconds: 26 peeks, 14 spawns — close to the 40%
  target given n=26. `MouseHoleSprite.tsx` draws the peek as two pale eye-shine ellipses
  with dark pupils, low in the arch.
- **Some mice are brown.** `Mouse.color` (`'grey' | 'brown'`, `MouseColor` in
  `src/types/mouse.ts`) rolled once at spawn (`MOUSE_BROWN_CHANCE = 0.3`) — purely
  cosmetic, `MouseSprite.tsx`'s `COAT_COLORS` map picks the palette.
- **Cheese**: a new food item (cats eat it same as kibble/cake) that a calmly sneaking
  mouse is also drawn to within `MOUSE_CHEESE_DETECT_RADIUS` (250px) — claims it via the
  item's own `claimedBy` (shared with cats' own claim mechanism, so whichever gets there
  first blocks the other), picks it up on arrival, and hauls it back to the mouse hole at
  a dedicated `MOUSE_CHEESE_SPEED` (55px/s — a determined trot, between the cautious
  16px/s sneak and the terrified 145px/s flee) to despawn once delivered. Getting scared
  mid-run drops the cheese outright — `scareMouse()` clears `targetCheeseId`/
  `carryingCheese`, and each of its three call sites separately releases the abandoned
  item's claim (that pure function has no `sceneItems` to touch itself). A carried cheese
  renders as a tiny wedge at the mouse's nose. Verified end-to-end (seek → claim → pickup
  → carry → deliver → despawn) and the abandon-mid-run path (claim genuinely released, not
  left dangling) both via deterministic stepping.
- **A cat gallops chasing a fleeing mouse.** `selectGait()` (`gaits.ts`) and
  `targetSpeedFor()` (`movement.ts`) both gained an optional `chasingFleeingMouse`
  parameter — neither pure function has a `Mouse` to check itself, so each caller (
  `petStore.tick()`, which has the live mice map; `PetSprite.tsx`, which now reads the
  targeted mouse's state via its own `usePetStore` selector) resolves the flag from
  `mice[pet.targetMouseId]?.state === 'fleeing'`. Previously a mouse chase always used the
  same trot as approaching a toy — a fleeing mouse is genuinely trying to escape, so a real
  chase now looks (and moves) like the same flat-out gallop zoomies uses.
- **Sound**: one new asset (`mouse-squeak.mp3`, CC0, sourced via a research subagent
  following the existing `CREDITS.md` convention) plus three previously-downloaded-but-
  unused cat assets finally wired up. Squeak plays on every _fresh_ scare (spotted while
  sneaking, pounced at, chucked, or freshly spawned from a hole peek) — gated the same way
  `scareMouse()` itself gates a fresh scare, so an ongoing chase doesn't squeak every tick.
  `cat-growl.mp3` plays on an actual missed pounce (toy or mouse, gated on
  `pet.action === 'pouncing'` so a plain "walked up and it had already rolled off" doesn't
  growl). `cat-meow-hungry.mp3` plays the moment a cat freshly targets food while under
  `gaits.ts`'s own `URGENT_HUNGER` threshold (now exported and reused rather than
  duplicated). `cat_purrsleepy_loop.wav` starts as a soft loop the instant a cat's action
  becomes `'sleeping'` (covers both ways it gets there — arriving at a bed, or collapsing
  from sheer exhaustion) and stops the instant it isn't anymore — including
  `putPetInSuitcase`, which didn't previously call `stopLoop` at all (a pre-existing gap
  that would have left a suitcased sleeping cat purring forever; fixed as part of this
  same pass since it's the same bug class as everything else here).
- **Found and fixed along the way**: the held-mouse-in-jaws position was never actually at
  the head. `MOUSE_MOUTH_OFFSET_X/Y` (24, 6) put it near the middle of the body, and — a
  second, independent bug — even that used a plain `dirX` sign flip for facing, the wrong
  correction for a CSS-mirrored sprite (same class of bug the tail anchor already has a
  documented fix for). Derived the right local coordinates from `PetSprite.tsx`'s actual
  head polygon (`42,34 50,12 66,12 74,34`) and eye geometry (`EYE_XS`/`EYE_Y`), landing on
  `MOUSE_MOUTH_LOCAL_X/Y = 70, 27`, and mirrored it the same way the gaze-target code
  already does (`SVG_WIDTH - x` for facing left, not `-x`). Also fixed the chuck hop
  starting from `pet.position` instead of the mouse's actual last-tracked mouth position,
  which would visibly snap it there for one frame before the throw. Verified visually at
  both facings.
- Verified the whole bundle together, not just individually: a combined scenario (three
  cats, cheese in the room, mousehole spawning organically) ran ~640 simulated seconds
  with no errors, no `NaN` positions, and a plausible natural mix of every new and
  existing sound firing. New/updated tests: `gaits.test.ts` (3 new), `movement.test.ts` (1
  new), `mouseMovement.test.ts` (1 new).

## Deferred / future ideas (already noted, not built)

Two items are tracked in Claude's memory system (readable in future
Claude sessions at
`~/.claude/projects/-Users-williamdawson/memory/`) — repeated here so
they're visible without that system:

- **Floor materials**: item physics currently gets friction/bounciness
  only from the item's own `PhysicsProfile` — there's no notion of what
  the _floor_ is made of. Deferred until a maps/rooms feature exists;
  there's a `TODO(maps)`-style comment in `itemPhysics.ts` marking where
  it'd plug in (a floor-contributed friction/bounciness that combines
  with the item's own).
- **Tail genetics**: tail mood/motion is currently identical across every
  cat. The user floated (framed explicitly as "eventually," not a
  request) giving cats a genetic default tail-carriage height and a
  per-cat agitation/flick threshold — would follow the same lightweight
  pattern as `attentionSpan`/`affection` (plain numeric `Pet` field,
  starter cats get hand-picked values, kittens inherit parent-average ±
  variance), not the formal allele-pair genetics system.

Neither has an issue tracker or roadmap doc beyond this file and the
memory notes — just flag it here if you start one.

## Working conventions worth knowing

- **Real browser verification is expected**, not just static code
  review, especially for anything visual (physics feel, rendering,
  gestures). Use the actual running dev server.
- **Debug-hook pattern** used repeatedly for verifying time-based or
  hard-to-reach state: temporarily append
  `;(window as unknown as { __petStore: typeof usePetStore }).__petStore = usePetStore`
  to the bottom of `petStore.ts`, letting you call
  `window.__petStore.getState().tick(now, deltaMs)` directly (in a loop,
  with large deltas) from a browser console to fast-forward simulation
  deterministically, bypassing real-time waits and `requestAnimationFrame`
  tab-visibility throttling entirely. **Always grep for `__petStore` /
  `TEMP DEBUG` before committing** — it must never ship.
- Chrome throttles `requestAnimationFrame` in backgrounded/hidden tabs,
  which looks exactly like a stuck game during testing. The `timeScale`
  speed control mostly obviates needing to fight this now; before it
  existed, forcing a screenshot capture was the reliable way to regain a
  visible/ticking tab.
- Before ending a session, reset the game (Reset Game button, or
  `resetGame()`) so `localStorage` isn't left holding mid-test junk state
  for whoever opens the app next.
- Type-check (`npx tsc --noEmit -p tsconfig.app.json`) and
  `npx vitest run` before every commit; both are fast (~100ms) and have
  caught real regressions.
- Sound files in `src/assets/sounds/` are pre-downloaded and licensed —
  see `CREDITS.md` there. All CC0 except `cat-hiss.mp3`, which is CC BY
  4.0 and needs attribution (credit "AUDACITIER", link in the credits
  file) if this project is ever shared publicly.

## Known rough edges / not yet done

- Single room only — no maps/rooms system, so floor materials (above)
  have nothing to attach to yet.
- `GamePanel` only guarantees its own top-left corner (the drag handle)
  stays on-screen when dragged near an edge (`PANEL_EDGE_MARGIN`); it
  doesn't know its own rendered height/width when clamping, so content
  can partially overflow the viewport if dragged to a bottom/right
  corner. Low priority — the user can just drag it back.
- Breed names only cover the 5×2 furColor/pattern combinations that exist
  today; will need extending if new genetics traits are added.
- No CI — verification is manual (`tsc` + `vitest` + real browser check)
  each session.
- Not tested on touch/mobile specifically; pointer events are used
  throughout so it likely mostly works, just unverified.

## Where to pick up

There's no queued "next milestone" right now — M8 through M18 plus a
polish round are all shipped and pushed to `main`. This is a natural
pause point. Likely next directions, roughly in order of how directly
they were signaled by the user: whatever new design problems get raised
next, then the two deferred ideas above (floor materials tends to imply
a maps/rooms feature first), then general polish. Check `git log` for
anything committed after this file's date before assuming this summary
is still current.
