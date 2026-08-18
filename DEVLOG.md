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
   and item consumption, since those need the *other* entity's
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
gravity-affected) so a thrown ball can arc up *into* the wall band's
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
- `src/components/PetSprite.tsx` — cat rendering; has its *own* bespoke
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
  facing flip and adding mood-driven tail carriage. Then a *separate*
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
  only constrained once landed. (This exact area needed *two more* fixes
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
   SVG's CSS mirror correctly flips the *fixed-shape* body/head/legs, but
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
   *separate* vertical lift. Fixed: friction now applies every frame
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
   - *Gaits*: pets carry `currentSpeed` (eased, `ACCEL`/`DECEL`) toward
     amble/trot/run targets by intent (wander vs. wanting something vs.
     zoomies), and `stridePhase` advances by distance traveled — legs
     never skate. All in `movement.ts`.
   - *New actions*: `sitting` (idle cats park on their haunches),
     `zoomies` (happy energetic cats sprint between random points,
     kittens most — chances in `behaviorFSM.ts`), `pouncing` (final
     ~90px approach to a grounded toy becomes a leap; store-side trigger
     in `tick()` next to arrival/consumption). Jumps are a generic
     `pet.jump` ballistic ground-track (`JumpState`) — zoomies also hop
     with it; render derives the visible arc, sim never leaves the floor.
   - *Rendering* (`PetSprite` + new `catPose.ts`): two-bone IK legs
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

## Deferred / future ideas (already noted, not built)

Two items are tracked in Claude's memory system (readable in future
Claude sessions at
`~/.claude/projects/-Users-williamdawson/memory/`) — repeated here so
they're visible without that system:

- **Floor materials**: item physics currently gets friction/bounciness
  only from the item's own `PhysicsProfile` — there's no notion of what
  the *floor* is made of. Deferred until a maps/rooms feature exists;
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
