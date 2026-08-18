# CLAUDE.md — Virtual Cats

Terse, always-current rulebook for picking up this repo cold. `DEVLOG.md` is the narrative
history (milestones, postmortems) — read it for _why_ things are the way they are. This file is
the map and the rules. **Any change touching store structure, a new store field, or the save
schema MUST update this file in the same change.**

## Project snapshot

A from-scratch clone of the Catz 5 / Petz virtual pet games — non-commercial hobby project, no
backend, `localStorage` persistence only. Two cats wander a single room, decide what they want via
a shared attention-scoring AI, and can be petted, dragged, bred, and put away in a suitcase panel.
Rendering is procedural SVG (shape-built cats), not sprite sheets.

## Design philosophy — cozy, not hectic

Needs decay slowly; a cat left alone should take most of an hour to actually need something. This
is a low-pressure pet you check in on, not a game you actively manage. **Don't "improve engagement"
by adding urgency or speeding up decay** — that runs directly against the stated goal. Death and
illness mechanics are explicitly out of scope; don't add them without asking first.

## The one rule the codebase is most protective of

**Everything runs through a single `requestAnimationFrame` loop** (`src/game/useGameLoop.ts`),
which calls `usePetStore.getState().tick(now, deltaMs)` every frame. `deltaMs` is clamped to
100ms (`MAX_DELTA_MS`) so a backgrounded tab resuming doesn't send physics into a huge single step.
**Never add a second RAF loop or an effect-driven physics loop tied to state changes.** A tail
freezing bug earlier in the project came directly from physics living in a React effect instead of
the central loop — see the comment block at the top of `src/game/tailPhysics.ts`.

## Commands

```
npm run dev          # dev server
npm run build         # typecheck + production build
npm run lint          # oxlint
npm run typecheck     # tsc, no emit
npm test              # vitest run
npm run format         # prettier --write
npm run format:check  # prettier --check
```

Pre-commit (Husky + lint-staged) runs prettier + oxlint on staged files, then a full typecheck +
test pass, before every commit.

## Store architecture

**Current: pre-refactor**, single file `src/store/petStore.ts` (Zustand, ~1000+ lines) — pets,
scene items, mice, tail segments, the draggable UI panel's own position, save/load triggering,
time-scale, all in one store. Its `tick()` is one large synchronous pass, in order:

1. Scale `deltaMs` by `timeScale`.
2. Step the UI panel's own drag-physics (real time, not scaled).
3. Apply needs decay in fixed 1-second accumulator steps (frame-rate independent).
4. Step item physics (gravity/height axis + ground-plane friction/bounces). Any landed `'prey'`
   item (the mouse) converts here from a `PlacedItem` into an autonomous `Mouse` (see below).
5. Run each non-held mouse's own AI (`src/game/mouseBehavior.ts`) and movement
   (`src/game/mouseMovement.ts`) — fully independent of any cat, using last tick's cat positions to
   decide whether it's been spotted.
6. For each non-suitcased pet: age it, then either continue petting/holding-a-caught-mouse or score
   every item/other cat/mouse via `attentionScore()` (`src/game/attention.ts`), feed the winner
   into the pure FSM (`src/game/behaviorFSM.ts`), then move it (`src/game/movement.ts`). Stalking,
   pouncing, and mouse-catching are store-side (not in the FSM) since they need live cross-entity
   position/definition data — same reasoning for all three.
7. A second pass resolves mutual cat-cat arrival, item consumption, and repositions any held mouse
   to its holder's mouth / despawns a fleeing mouse that reached the hole (needs the _other_
   entity's already-updated state from this same tick).
8. Step tail-chain physics per pet (`src/game/tailPhysics.ts`, anchor from `tailMood.ts`).

**Mice are a separate `Record<string, Mouse>` slice** (`src/types/mouse.ts`), not folded into
`sceneItems` or `pets` — they have their own tiny AI/movement (sneak/flee/held, no needs, no
gaits/legs) rather than being either a physics-driven object or a full cat. A cat targets one via
`Pet.targetMouseId` (mirrors `targetItemId`/`targetPetId`), transitions to `'holdingMouse'` on a
successful pounce (fully store-side, like `'petting'` — never runs through the FSM), and chucks it
back out after `HOLD_MOUSE_MS` with a `MOUSE_RECHASE_CHANCE` roll on whether it re-chases. A mouse
mid-chuck-hop (`jump !== null`) is treated as an automatic miss by the catch-on-arrival check — it
must not be catchable again until its hop actually lands, or the FSM's live-position re-targeting
lets the cat "arrive" and re-catch it one tick later, before it ever gets real separation. Mice are
**never persisted** (see Save schema) — a reload always starts with none in the room.

Each mouse spawns with `livesRemaining` (2–7, random) — every scare (spotted, pounced at, or
chucked) costs one via `scareMouse()` (`src/game/mouseBehavior.ts`), but it only beelines for the
mouse hole once that hits 0; before then it just flees away from whatever spooked it. Calming back
to `'sneaking'` after `MOUSE_CALM_MS` unbothered does not restore lives. A `'fleeing'` mouse is a
flat, mood-independent attention draw for _every_ nearby cat (`mouseUrgency()` in
`src/game/attention.ts`), not just whichever one spooked it — fleeing to escape one cat's notice
risks pulling in every other cat in range.

A planned slice split (`ARCHITECTURE.md` Phase 8) will divide this into cooperating Zustand slices
— **update this section when that lands.** `src/game/behaviorFSM.ts` stays a pure function
`(pet, context) → pet`; all mutation and cross-entity effects live centrally in `tick()`.

The mouse hole also occasionally acts on its own, independent of any cat/mouse in the room: on a
random interval (`MOUSEHOLE_PEEK_*` constants) two eyes peek out (`mouseHolePeeking` — not
persisted, see Save schema), and a fraction of those peeks (`MOUSEHOLE_SPAWN_CHANCE`) spawn a fresh
`Mouse` right there. Each mouse also gets a cosmetic `color` (`'grey' | 'brown'`, `MouseColor` in
`src/types/mouse.ts`) rolled once at spawn — purely visual, no behavioral difference.

A calmly `'sneaking'` mouse (not fleeing/held) is drawn to any unclaimed `'cheese'` item within
`MOUSE_CHEESE_DETECT_RADIUS`, claims it via the item's own `claimedBy` (the same field a cat's own
food-claim uses — whichever gets there first blocks the other), picks it up on arrival (deletes the
`PlacedItem`, sets `Mouse.carryingCheese`), and hauls it back to the mouse hole to despawn — goal
met, same as an escaped fleeing mouse. `scareMouse()` drops `targetCheeseId`/`carryingCheese`
outright on any scare (a cheese run isn't worth its life); the caller is responsible for releasing
the item's claim, since that pure function has no `sceneItems` to touch. A cat actively chasing a
mouse that's `'fleeing'` (not just sneaking) gallops — `selectGait()` (`src/game/gaits.ts`) and
`targetSpeedFor()` (`src/game/movement.ts`) both take an optional `chasingFleeingMouse` flag the
caller resolves from the live `Mouse`, since neither pure function has mouse data of its own.

## Save schema

**Current: no versioning.** `src/store/persist.ts` is a thin `localStorage` wrapper — a flat JSON
blob (`{ pets, sceneItems }`), raw `JSON.parse` + try/catch-null on load, missing fields patched ad
hoc with `?? default` at scattered call sites as `Pet`'s shape has grown. A real versioned
migration system is planned (`ARCHITECTURE.md` Phase 7) — **update this section when that lands,**
and route any new `Pet`/save field through it rather than adding another ad-hoc default. **Mice are
never persisted at all** — deliberately excluded from `SavedState`, not backfilled on load, same
treatment as `tailSegments`.

## Coordinate model

World coordinates are plain pixels. Pets and items have a floor position `{x, y}`. The room has a
"wall band" along the top (`WALL_BAND_FRACTION`, `src/game/roomLayout.ts`) representing the back
wall in pseudo-3D perspective — floor-bound entities stay below it. Items additionally have a
`height` (z-axis, gravity-affected) so a thrown ball can arc into the wall band's visual space
while airborne, constrained back onto the floor plane once it lands.

The mouse hole is a fixed feature of the room, not a placeable item — `getMouseHolePosition()`
(`src/game/roomLayout.ts`) derives its position from live `sceneBounds` alone, so it always exists,
always sits exactly on the wall/floor line, and stays correct across a window resize. Both
`petStore.ts` (a fleeing mouse's goal) and `MouseHoleSprite.tsx` (rendering it) call this rather
than duplicating the math.

## File map

- `src/store/petStore.ts` — the store, `tick()`, all mutating actions.
- `src/store/persist.ts` — `localStorage` save/load/clear.
- `src/game/behaviorFSM.ts` — pure per-pet decision function.
- `src/game/movement.ts` — destination-seeking movement, gait speed targets, stride phase.
- `src/game/attention.ts` — unified item/cat scoring (urgency × proximity).
- `src/game/itemPhysics.ts` — gravity/height axis + ground bounce/friction for placed items.
- `src/game/tailPhysics.ts` / `tailMood.ts` — chain-follow tail physics, mood-driven anchor. The
  anchor `getTailAnchorLocal` computes must track the body's _actual_ rendered position — it
  replicates PetSprite.tsx's own per-stride `bob`/`bodyBob` formula exactly (same Pet-object
  inputs, must stay byte-for-byte in sync) and ramps seated/sleeping/held/stretching offsets in
  over the pose's own elapsed time rather than snapping, matching how long the body's own eased
  crossfade takes to fade in. A mismatch here is the single most common cause of the tail visibly
  disconnecting from the body — see the M22 postmortem in DEVLOG.md before touching this again.
- `src/game/catPose.ts` — procedural leg IK + pose blend weights (sit/lie/hop).
- `src/game/gaits.ts` — gait timing/footfall engine (walk/trot/slink/gallop/strut) + body/head/tail
  posture per gait.
- `src/game/mouseBehavior.ts` / `mouseMovement.ts` — the mouse's own pure decision/movement
  functions, same `(entity, context) → entity` shape as the cat's FSM/movement, much simpler (no
  needs, no gaits).
- `src/game/genetics.ts` / `src/types/genetics.ts` — Mendelian-style allele pairs, dominance,
  mutation.
- `src/game/breedName.ts` — genetics → pedestrian breed name.
- `src/game/lifeStage.ts` — kitten/adult/senior derived from `ageMs`, not stored.
- `src/game/personality.ts` — `affection` trait → label.
- `src/game/sound.ts` — thin `HTMLAudioElement` wrapper (one-shots + named loops).
- `src/game/useGameLoop.ts` / `useSceneBounds.ts` / `useDraggable.ts` / `mousePosition.ts` — the
  RAF loop, viewport sync, generic click-vs-drag hook, mutable **cursor**-position singleton
  (unrelated to the `Mouse` creature — an unfortunate naming collision, not renamed to avoid
  churning an unrelated, working file).
- `src/components/PetSprite.tsx` — cat rendering; bespoke pointer handler (click-select /
  hold-to-pet / drag-carry — not `useDraggable`).
- `src/components/ItemSprite.tsx` / `ItemAvatar.tsx` / `CatAvatar.tsx` — item rendering/dragging,
  drag-out-of-panel widgets.
- `src/components/MouseSprite.tsx` — mouse rendering only; no pointer handler at all, it's not
  player-draggable once alive (only the pre-conversion item form is, via the generic `ItemSprite`).
- `src/components/MouseHoleSprite.tsx` — the mouse hole; fixed, non-interactive, positioned via
  `getMouseHolePosition()` — not backed by a `PlacedItem` at all (see Coordinate model above).
- `src/components/GamePanel.tsx` — unified draggable UI panel (stats/suitcase/breeding tabs).
- `src/components/Scene.tsx` — pure render: the mouse hole, then items, then pets, then mice, in
  that z-order (mice last so a held one stays visible on top of its holder).
- `src/data/itemDefinitions.ts` — item types and their `PhysicsProfile` (mass/friction/bounciness).
  Includes `'prey'` (the mouse, transient — see Store architecture), excluded from normal
  item-urgency scoring. No `'hole'` category — the mouse hole isn't an item at all.
- `src/types/pet.ts` / `item.ts` / `mouse.ts` — core interfaces.

## Testing conventions

Vitest, pure-function unit tests only (no component tests yet). Tested today: `movement.ts`,
`itemPhysics.ts`, `genetics.ts`, `behaviorFSM.ts`, `gaits.ts`, `catPose.ts`, `tailMood.ts`,
`mouseBehavior.ts`, `mouseMovement.ts`. Run `npm test` and `npm run typecheck` before every commit
(the pre-commit hook does this automatically). New pure `src/game/*` modules should get a sibling
`*.test.ts`. `petStore.ts` itself has no tests yet (`ARCHITECTURE.md` Phase 8's known gap) — the
cross-entity logic added there (stalk/pounce/catch/chuck, prey-conversion) is verified by hand in a
real browser instead, using deterministic state-forcing via the debug-hook pattern below.

## Deploy

Cloudflare Pages (free, private-repo-friendly) — see `ARCHITECTURE.md` Phase 6. **Update this
section with the live URL once deployed.**

## Working conventions

- **Real browser verification is expected** for anything visual (physics feel, rendering,
  gestures) — static code review alone isn't enough.
- **Debug-hook pattern** for verifying time-based/hard-to-reach state: temporarily append
  `;(window as unknown as { __petStore: typeof usePetStore }).__petStore = usePetStore` to the
  bottom of `petStore.ts`, then drive `window.__petStore.getState().tick(now, deltaMs)` from the
  browser console to fast-forward deterministically. **Always grep for `__petStore` / `TEMP DEBUG`
  before committing** — it must never ship.
- The `timeScale` speed control (pause/1x/4x/16x) mostly obviates fighting Chrome's RAF throttling
  in backgrounded tabs.
- Reset the game (`resetGame()`) before ending a session so `localStorage` isn't left holding
  mid-test junk for whoever opens the app next.

## Deferred / future scope

- **Floor materials** — item physics has no floor-contributed friction/bounciness yet; deferred
  until a maps/rooms feature exists (`TODO(maps)` marker in `itemPhysics.ts`).
- **Tail genetics** — tail carriage/flick-threshold is uniform across cats today; planned as
  plain numeric `Pet` fields (like `attentionSpan`/`affection`), not the formal allele-pair system.
  Scheduled in `ANIMATION_PLAN.md` Phase A4.
- **Multi-room/maps** and an **Electron desktop-overlay port** — both genuinely likely future work;
  `ARCHITECTURE.md` Phase 10 adds cheap `platform/` groundwork without building either.
- See `ANIMATION_PLAN.md` for the full gait/idle-animation/body-customization roadmap.

## Known rough edges

- Single room only — no maps/rooms system.
- `GamePanel` only guarantees its own top-left corner stays on-screen when dragged near an edge;
  can partially overflow on a bottom/right-corner drag. Low priority.
- Breed names only cover the 5×2 furColor/pattern combinations that exist today.
- Not tested on touch/mobile specifically (pointer events are used throughout, so it likely mostly
  works, just unverified).
- Mice can't be picked up/moved by the player directly once alive — only the pre-conversion emoji
  item is draggable. Not a bug, just an intentionally unbuilt interaction (nobody's asked for it).
- `tailPhysics.ts`'s `stepChain` has a latent numerical instability: if a segment ever lands almost
  exactly on its own anchor, the `dist || 0.0001` fallback's `dx/dist`/`dy/dist` normalization goes
  unstable and can diverge to `NaN`/astronomical values with no damping to recover — confirmed by
  forcing a pet's `action` directly via `setState` (bypassing the FSM), not reachable through any
  normal FSM-driven transition (idle → stretching → walking stayed stable over 200 ticks). Worth
  revisiting if a future feature ever teleports a pet or swaps its action outside the FSM (e.g. a
  save/load edge case). Related, and actually fixed (M22): a segment landing _exactly_ on its
  anchor, or a chain perfectly collinear with a perfectly still anchor, are both genuine fixed
  points of this same algorithm (not numerically unstable, just permanently stuck) —
  `initialSegments` no longer seeds either shape.
- A settled tail's resting _curl_ (as opposed to its attach point, which `getTailAnchorLocal`
  actively tracks) is inherently path-dependent — an emergent property of the chain-follow physics'
  history, not something a fixed anchor offset fully controls. An unusual rapid sequence of action
  changes can occasionally leave the curl ducked behind the seated silhouette's chest/haunch shapes
  (both drawn _after_, i.e. on top of, the tail). Confirmed this clears up starting from a fresh
  state; not chased further — see the M22 postmortem in DEVLOG.md.

## Related docs

- `DEVLOG.md` — narrative milestone history and postmortems.
- `ARCHITECTURE.md` — infrastructure roadmap (CI, save versioning, store refactor, deploy).
- `ANIMATION_PLAN.md` — cat animation roadmap (gaits, idle behaviors, body customization).
