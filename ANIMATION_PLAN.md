# Virtual Cats — Cat Animation Master Plan (Fable → Sonnet)

## Context

This is the second Fable-authored handoff plan, sibling to `ARCHITECTURE.md`. That plan covers
infrastructure (CI, save versioning, store split); this one covers making the cat animation cute,
dynamic, interactive, and customizable. Fable's job was **planning only — no code changes**. The
repo is at commit `8ab13ed` (M19) as of writing.

**Sequencing (owner-confirmed):** execute `ARCHITECTURE.md` phases 1–8 first. This plan's phases
assume the save-migration system (its Phase 7) and the store slice split (its Phase 8) have landed.
New genetics fields added here go through real migrations, not ad-hoc `?? default` patching.
**Phases A1–A3 jumped the queue** (owner request, 2026-08-18) — all three only touch pure
render/game files plus new transient (unsaved) `ActionState` values (`'stalking'`, `'grooming'`,
`'stretching'`, `'kneading'`), no persisted store fields or save schema, so it was safe to do ahead
of Phases 7–8. **A4 (genetics wiring) still waits** for those phases to land, as planned — it's the
first phase here that actually needs the migration system.

## Status

- ✅ **Phase A1 — done** (commit `eb6977f`). Gait engine (`gaits.ts`) replaces the old sinusoid leg
  cycle; the moonwalk bug is fixed (verified by a planted-foot-never-slides-forward test, plus a
  live browser check — see DEVLOG-style detail in the commit message). Walk and trot both wired.
  **Also added, ahead of schedule**: the held/scruff-dangle pose (owner request, not originally
  scoped to A1) — legs go loose and swing on drag-velocity lag, body leans like a pendulum from a
  neck pivot, tail drops and hangs limp. Lives in the same pose layer (`catPose.ts`'s `hold` blend)
  so it composes cleanly with everything A2+ adds.
- ✅ **Phase A2 — done** (commit `955bcb3`). Slink, gallop, and strut `GaitDef`s, each carrying
  stride/lift multipliers, body/head posture, and tail carriage (`bodyPoseFor` in `gaits.ts`) on
  top of the A1 pose layer — walk/trot are untouched (neutral values), so nothing regressed. New
  `stalking` action (transient, mirrors `walking` in the FSM) that `petStore.tick()` switches a
  trotting cat into within `STALK_RANGE` of a grounded toy, before the existing `POUNCE_RANGE`
  trigger — reads as one continuous stalk-then-pounce. Gallop triggers on zoomies and on a very
  hungry/exhausted cat closing in on something; a happy aimless wander struts. Verified with
  deterministic manual `tick()` stepping in a real browser (paused `timeScale`, drove `tick()`
  directly to land on exact frames) — slink, gallop's stretch-and-gather, strut's high step, and
  the full stalk→pounce→play sequence all confirmed visually.
- ✅ **Phase A3 — done** (commit `82f0a69`). Three new idle actions — grooming (flank-lick or
  paw-wash, picked per session), stretching (a new purpose-built low-slung silhouette, cross-faded
  like the seated one), kneading — rolled alongside zoomies/sitting in the existing idle-decision
  weighted roll, uninterruptible once started (unlike sitting), with grooming's odds biased up by
  low hygiene. All three reuse the seated silhouette as their base pose. Also added while in the
  area: a tail-wrap curl once seated (ramps in over ~1.2s; needed real care around the
  facing-mirror math, now pinned down by a test) and a per-ear ear-flick twitch. Verified live via
  deterministic state forcing in a real browser, including specifically checking the tail-wrap
  direction on both facings.
- ✅ **Face-shape gene — done** (M24, jumped the queue like A1–A3, owner request). Added
  `faceShape` as a 5th genetic trait (`wedge`/`triangle`/`trapezoid`/`round`/`skinny`, `wedge`
  dominant so existing cats don't shift look) following the existing allele-pair pattern in
  `genetics.ts`. Landed via the same ad-hoc `?? default` load-patch precedent as `attentionSpan`/
  `affection` (`sanitizeLoadedPet` in `petStore.ts`) rather than a real migration, since
  `ARCHITECTURE.md` Phase 7's migration system still hasn't landed — **A4's tail/leg/fur-length
  traits below should follow the same precedent** until it does. The real work was forcing
  `PetSprite.tsx`'s previously-hardcoded head/ear/eye/nose/mouth/whisker constants into a
  per-shape data lookup (`FaceShapeDef` in new `src/game/faceShapes.ts`: outline, both ear
  pivots, eye pair, nose/mouth anchor), resolved through `deriveAppearance` — this is the
  parametric face-positioning groundwork Phase A4/A5 below assumed would exist, done a bit early.
  Verified with 5 temporary test cats (one per shape, both facings, blink/petting closed-eye
  state) via the `__petStore` debug hook + screenshots; the 3 starter cats now carry distinct
  shapes (Whiskers=wedge, Mittens=triangle, Tom=round) as a live showcase.
- ⬜ A4 (remaining traits) –A7 — not started.

## Decisions made (owner-confirmed, do not re-litigate)

1. **Fix the moonwalk via a proper gait engine**, not a spot patch (root cause documented below).
2. **Gaits:** walk, slink, gallop, strut (plus the existing trot as the "purposeful" middle gait).
3. **Gait triggers:** walk = ambling/wandering; slink = a new `stalking` approach phase before
   pouncing on toys/other cats; gallop = zoomies and urgent wants (a very hungry cat heading to
   food); strut = a happy, recently-petted or well-fed cat crossing the room.
4. **Head and tail posture are outputs of the gait/pose system**, not incidental.
5. **Idle animations**: self-grooming (licking flank, paw-wash over head), stretching, kneading,
   ear flicks, tail-wrap sit.
6. **5-view rendering**: side, ¾-front, front, ¾-back, back — mirrored to cover 8 movement
   directions. The ¾ views are the hardest and riskiest part; they come **last**, with an explicit
   fallback (ship 3-view direction binning) if they don't read well.
7. **Customization**: build a per-cat `BodyPlan` parameter layer, and wire **2–3 real inheritable
   traits** through genetics end-to-end (tail length incl. bob, leg length, fur length), extending
   breed names to cover them. Full genetics expansion is later work.
8. Rendering stays **procedural SVG** (shape-built). No sprite sheets, no canvas/WebGL rewrite —
   procedural geometry is what makes genetic body variation cheap.

## The moonwalk bug — root cause (documented so nobody re-derives it)

In `src/game/catPose.ts` (`computeLegPoses`): foot x follows `cos(phase)` and lift follows
`max(0, sin(phase))`. Differentiate: while `sin(phase) > 0` (foot **lifted**), foot x-velocity is
negative — the foot sweeps _backward through the air_. While planted, it sweeps _forward along the
ground_. That is exactly inverted from a real stride (planted foot pushes backward relative to the
body; lifted foot swings forward), i.e. a moonwalk. The M19 distance-driven `stridePhase` was
correct (no aggregate skating); the phase relationship inside the cycle is backwards. The minimal
fix is lift = `max(0, -sin(phase))`, but Phase A1 replaces the sinusoid entirely (below) because
the sinusoid also cannot express duty factor, which every new gait needs.

## Target architecture

### 1. Gait engine (`src/game/gaits.ts`, pure + tested)

A `GaitDef` table, one entry per gait:

| Field                        | Meaning                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `legPhase[4]`                | per-leg phase offset, fraction of cycle (leg order matches `LEGS` in catPose)    |
| `dutyFactor`                 | fraction of cycle each foot is planted (walk ~0.65, trot ~0.55, gallop ~0.3)     |
| `strideLength`               | px per full cycle (replaces the single `STRIDE_LENGTH_PX`)                       |
| `liftAmp`                    | swing-phase foot lift height                                                     |
| `bodyHeight`                 | hip/shoulder drop or raise (slink drops the body; IK bends the legs for free)    |
| `bodyPitch` / `spineStretch` | gallop's stretch-and-gather keyed to phase; strut's chest-up                     |
| `headHeight` / `headPitch`   | slink = low and forward, strut = high                                            |
| `tailCarriage`               | target fed into `tailMood.ts`'s anchor system (strut = flagpole up, slink = low) |
| `bounceProfile`              | vertical bob amplitude/shape (gallop bounds; slink is nearly flat)               |

Foot kinematics per leg, from phase + duty factor: during **stance**, the foot is locked to the
world (in body frame it moves backward at exactly body speed); during **swing**, it lifts and
swings forward along an arc. This is what makes planted feet physically believable at every speed
— and it is unit-testable: _assert a planted foot never moves forward relative to the ground_.

Starting parameter values (tune by eye in the browser afterward):

- **Walk** — 4-beat lateral sequence: farBack 0.0, farFront 0.25, nearBack 0.5, nearFront 0.75;
  duty 0.65.
- **Trot** — current diagonal pairing (0 / 0.5), duty 0.55. Keep as the purposeful middle gait.
- **Slink** — walk sequence, duty 0.75, long slow strides, bodyHeight dropped ~6px, head low.
- **Gallop** (rotary) — hinds nearly together (0.0, 0.1), fronts (0.5, 0.6), duty 0.3, an
  airborne suspension window when all four are in swing, spineStretch keyed to phase.
- **Strut** — walk sequence, duty 0.55, high liftAmp, slow cadence, head high, tail vertical.

Gait selection is a pure function `selectGait(pet): GaitName` (from action + targets + mood), not
a stored field. The renderer eases a **blend** between the outgoing and incoming gait's parameters
(cosmetic easing lives in `PetSprite` refs, per the existing convention — the sim only knows
discrete actions).

### 2. Unified pose layer (`src/game/catPose.ts`, grown)

One pure entry point: `computeCatPose(input) → CatPose`, where `CatPose` carries leg poses (as
today), plus body (height/pitch/stretch), head (height/pitch), and tail-anchor targets.
`PetSprite` becomes a dumb renderer of a `CatPose`. Idle animations are authored keyframe loops
that produce the same `CatPose` shape, so gaits, sits, grooming, and stretches all flow through
one pipeline. Inputs include the `BodyPlan` (below) and, from Phase A5 on, the view.

### 3. BodyPlan (`src/game/bodyPlan.ts`)

Per-cat morphology derived from genetics (sibling to `deriveAppearance`): leg upper/lower bone
lengths, tail length + segment count (bob tail = short), fur length (outline thickness + a fluff
silhouette pass), ear size, body length. Everything in `catPose.ts` that is currently a constant
(the `LEGS` table's bone lengths, tail segment radii, etc.) becomes a `BodyPlan` read with today's
values as the defaults. **Renderer capability lands first (debug-tweakable), genetics wiring is a
separate phase.**

`src/game/faceShapes.ts` (M24) is a smaller-scale version of exactly this pattern, already built:
a `Record<PhenotypeValue, ShapeDef>` where each entry carries both the outline geometry _and_ the
attachment points (ear pivots, eye/nose anchors) that depend on it, looked up once per render via
the resolved phenotype rather than hardcoded. `BodyPlan` should follow the same shape — e.g. tail
length shouldn't just resize the existing anchor, it needs its own segment-count/radius table the
way each face shape has its own eye/nose coordinates, not a single scale factor applied to wedge's
numbers.

### 4. View system (Phases A5–A6)

`pickView(direction, previousView)` bins movement direction into side / front / back (later
¾-front / ¾-back), with **hysteresis** (~15° of stickiness) so a cat walking near a bin boundary
doesn't flicker between views. 8 rendered orientations come from 5 authored views via the existing
CSS mirror. Each view is its own body/leg geometry module; the gait engine's _timing_ (phases,
duty, cadence) is shared across views — only the geometry projection differs (front view: stride
becomes foot lift + slight lateral sway; near/far leg pairs become left/right pairs).

The current head is already a cartoon cheat (both eyes visible in "profile"), so the head, eyes,
gaze-tracking, and blink systems largely carry across views — the per-view work is body and legs.

**Whisker visibility as a facing signal (owner idea, M24, deliberately deferred here rather than
built now):** today's "facing" is a CSS horizontal mirror of one side-view — there's only ever one
whisker fan-pair silhouette to mirror, so there's no real front/back to differentiate. A cat only
plausibly reads as showing "one pair of whiskers visible, depending on which way it's facing"
once there's an actual front/back geometry to be _not_ side-on to — i.e. this is a natural
side-effect of Phase A5 (front/back views) landing, not a standalone hack on the current
single-view renderer. Concretely, once A5 exists: side view keeps today's near+far two-fan
treatment (M23), front view would show a single centered whisker fan (both real-world pads visible
at once, no near/far distinction), back view shows none. Worth a one-line callout in A5's own
verification pass rather than a separate phase.

### 5. Facial expressiveness (post-A4, informed by the M24 face-shape work)

Building `faceShapes.ts` surfaced a lesson worth carrying forward: once eye/nose/mouth anchors are
data (per-shape, not hardcoded), the same lookup can drive _mood_, not just _shape_. Ideas for a
later phase, roughly in order of how cheap they'd be given the current data model:

- **Ear position as mood signal** — `earFlickDeg`'s per-ear rotation already exists for the idle
  twitch; a sustained pinned-back rotation (vs. the momentary flick) is the classic "annoyed/
  startled" cat tell and reuses the same rotation-around-pivot mechanism, just driven by mood
  instead of a timer.
- **Pupil dilation** — the eye already draws a separate pupil ellipse (`eased.pupilX/Y` for
  tracking); scaling its radius with excitement/fear (playing with a toy vs. startled by a loud
  interaction) is a pure render-side addition, no new state.
- **Brow/eye-shape tilt** — `MAX_HEAD_TILT_DEG` already tilts the whole head toward a gaze target;
  a smaller-scale asymmetric tilt of just the eye ellipses (one raised, one lowered) is how
  cartoon expressiveness usually reads as "confused" or "suspicious" without new geometry.
- **Per-shape mouth/eye scaling** — right now every shape's mouth curve and eye ellipse use the
  same fixed radii regardless of head size (e.g. `round`'s bigger outline vs. `skinny`'s narrower
  one). A `BodyPlan`-driven scale factor (Phase A4) would make expressions read proportionally
  right across shapes instead of a `skinny` cat's mouth looking oversized relative to its face.

None of this is scheduled — it's what A4's `BodyPlan` scale-factor work and the `faceShapes.ts`
per-shape anchor data make newly _cheap_, worth a look once both exist.

## Phased execution plan

Each phase is one Sonnet session, in order, independently verifiable. Every phase ends with
`npm run typecheck` + `npm test` + a real-browser check (use the `__petStore` debug hook and the
timeScale speed control to fast-forward; grep for `TEMP DEBUG` before committing — see DEVLOG).

### Phase A1 — Gait engine core + moonwalk fix (side view)

Build `gaits.ts` with stance/swing foot kinematics and the walk + trot entries; replace the
sinusoid in `computeLegPoses`. Wire `selectGait` for the existing actions only (wander → walk,
targeted → trot, zoomies → run-as-trot placeholder). Tests: planted-foot-never-slides-forward,
duty-factor timing, phase continuity across gait switches.
**Verify in browser:** cats visibly _walk_ — one paw behind the other, no moonwalking, at every
speed and both facings. This is the phase the owner will notice most; get sign-off before A2.

### Phase A2 — New gaits + behavior wiring

Add slink, gallop, strut `GaitDef`s with body/head/tail posture outputs (extend `tailMood.ts` to
take carriage targets from the gait). Behavior: new `stalking` action in `behaviorFSM.ts` — the
final approach to a pounceable target drops into a slink before the existing pounce trigger;
zoomies and urgent-need travel use gallop (real suspension phase + spine stretch); strut triggers
for high-happiness cats for a while after petting/eating. New FSM states are transient (reset on
load) — no save migration needed. Tests for the new FSM transitions.
**Verify:** stalk→pounce reads as one motion; gallop has an airborne moment; strut's tail is up.

### Phase A3 — Idle animation library

Keyframe loops through the pose layer: flank-lick, paw-wash over head (the paw actually traces
over the ear), stretch (front-down, rump-up), kneading, ear flick, tail-wrap when sitting. FSM
picks them with weighted randomness from `idle`/`sitting` (hygiene-motivated grooming can bias the
weights). Per-cat desync via the existing `petHash` pattern.
**Verify:** leave 2–3 cats alone at 4x speed; idles trigger naturally, never mid-walk, and the
loops don't pop on entry/exit.

### Phase A4 — BodyPlan + real genetic traits

Introduce `BodyPlan` reads throughout the pose layer (defaults = today's constants) — see the
`faceShapes.ts` precedent in Target architecture §3 for the shape a per-shape/per-trait data table
should take. Then wire **tail length (incl. bob), leg length, fur length** as inheritable traits
following the existing allele-pair pattern in `genetics.ts` (the `faceShape` trait added in M24 is
a worked example of the whole pipeline: type → `genetics.ts` dominance/mutation → starter-cat
values → store load-patch → derived-appearance resolution → renderer lookup), with starter-cat
values, mutation, and breed-name extension ("Bobtail", "Fluffy", …). Tail length specifically is
now cheap to wire: `resolveTailChain`'s M25 rewrite (`tailPhysics.ts`) already takes segment count
and `linkLength` as plain parameters rather than baking `TAIL_SEGMENTS`/`TAIL_LINK_LENGTH` in, so a
`BodyPlan`-driven tail length is a call-site change, not another physics rewrite — a bob tail is
just a shorter `linkLength`/fewer segments fed into the same solve. **Save migration required for
real** once Phase 7 lands; until then, follow the ad-hoc `?? default` load-patch precedent
`faceShape` used in `sanitizeLoadedPet` (`petStore.ts`) rather than blocking on Phase 7 — that
patch is cheap to later fold into a real migration, and matches how every other field added since
the original save shape has been handled. Also fold in the deferred tail-carriage/flick-threshold
genetics idea (see `DEVLOG.md` "Deferred") — it's a plain numeric field and this is its natural
home.
**Verify:** breed two dissimilar cats repeatedly; kittens visibly inherit; old saves load clean.

### Phase A5 — Front + back views

Author front and back body/leg geometry; `pickView` with hysteresis binning to 3 views (side bins
cover diagonals for now). Every pose must work in every view: gaits, sit, lie, groom loops (a
front-view groom can be a simplified variant — authored, not skipped). **Top risk: the tail.** It
is physics-simulated in world 2D with a facing-aware anchor that took two attempts to get right
(see DEVLOG's post-M18 postmortem) and a full rewrite to stop it winding into a coil under
sustained sway (M25 — `resolveTailChain`'s FABRIK solve, double-pinned between the anchor and a
mood-driven tip target). Per-view anchor mapping needs the same care; a per-view tip-offset
function alongside `getTailTipOffsetLocal` is the natural extension point once views exist.
Acceptance = no tail clipping through the body on any view switch.
**Verify:** walk a cat in a circle; views switch at sane angles without flicker; back view's
raised tail and front view's cursor-tracking face both land.

### Phase A6 — ¾ views

The hardest phase. Author ¾-front and ¾-back geometry (foreshortened far side, offset leg pairs),
extend `pickView` to 5 bins. **Honest fallback, owner-approved:** if after a real attempt the ¾
geometry doesn't read as well as the neighboring views, ship the 3-view binning from A5 and leave
the ¾ modules behind a debug flag with notes on what didn't work — a clean 3-view cat beats a
mushy 5-view one. Do not let this phase eat multiple sessions silently; report back instead.
**Verify:** the circle-walk test again; diagonal travel uses ¾ views and transitions feel smooth.

### Phase A7 — Polish + integration pass

Gait-blend tuning at every transition (stalk→pounce→idle, gallop→stop), shadow behavior per gait
(gallop's suspension lifts the cat off its shadow), a final pass with all body-plan extremes
(short-leg bob-tail fluffy kitten galloping in ¾ view — the stress test), and update `CLAUDE.md`'s
map + this file's status notes.

## Do-not-do list (hard-won, from DEVLOG — respect these)

- **Never add a second RAF loop** or effect-driven physics; everything steps in `tick()`.
- Don't rotate the standing body ellipse into a sit — tried, looked wrong, purpose-built
  silhouette exists.
- If tail weirdness appears, **re-derive the facing/mirror math from scratch** (commit `8e86c23`)
  rather than assuming the existing fix has a subtle miss.
- Keep the sim discrete (actions) and easing cosmetic (renderer refs) — don't move blend state
  into the store.
- Cozy, not hectic: idle/gait tuning should make cats _calmer_ and more lifelike, not busier.

## Risks flagged for the executor

- **¾ views** (A6) carry the only real "may not work" risk — hence the explicit fallback.
- **Tail × views** (A5) is the most likely source of a confusing bug; budget time for it.
- **PetSprite growth**: it's 361 lines pre-plan and gains per-view renderers — split it (per-view
  geometry modules + the planned `usePetGesture` extraction from ARCHITECTURE.md's backlog) as
  soon as it feels crowded, ideally during A5.
- **Scope creep**: each phase is deliberately one session. If a phase spills over, finish and
  verify it before starting the next — never run two half-done animation phases at once.
