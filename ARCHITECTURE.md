# Virtual Cats — Architecture Handoff Plan (Fable → Sonnet)

## Context

Virtual Cats has been built collaboratively across many sessions, most recently with two milestone commits tonight (ball throw physics fix, natural cat animation — M19). The project owner is not a software engineer and is switching primary development to Sonnet going forward for budget reasons. Fable's job in this session is **planning only** — no code changes. This document is that plan: an assessment of whether the current architecture is sound, a phased roadmap Sonnet can execute session-by-session, and the reasoning behind each recommendation, so nothing needs to be re-explained from scratch later.

**Nothing in this plan has been executed.** The repo is exactly as it was after the M19 commit (`8ab13ed`) at the time of writing.

## Are we on track?

**Yes.** No rewrite is warranted. The core game-logic layer is already well-factored: `src/game/behaviorFSM.ts` (pure state machine), `movement.ts`, `itemPhysics.ts`, `attention.ts`, `genetics.ts`, `tailPhysics.ts`/`tailMood.ts`, `catPose.ts` are all pure, tested, side-effect-free modules. That pattern should be preserved and extended exactly as-is — nothing below touches it.

The two real structural debts, both already correctly identified by the project owner before this plan even started:

1. **`src/store/petStore.ts` is 822 lines** doing five unrelated jobs in one file (pets, items, tail physics, panel drag, persistence triggering), built around one large `tick()` function with subtle, order-sensitive steps. This is the single biggest risk for an agent working without full session history to accidentally break something.
2. **Save data has no schema versioning** — loaded saves are patched ad hoc with `?? default` at scattered call sites. This has already needed manual updates three times as the `Pet` shape grew and will keep needing it.

Both are ordinary growing pains for a project that went from M1 to M19 in continuous development, not signs of a bad foundation.

## Repo audit (confirmed today)

- Stack: Vite 8, React 19, TypeScript ~6.0 (project-references split tsconfig), Zustand 5, nanoid, Vitest 4, oxlint. No backend, localStorage only.
- **TypeScript `strict` is not enabled** anywhere (only `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`/`erasableSyntaxOnly`).
- `package.json` has `dev`/`build`/`lint`/`preview` scripts but **no `test` script**, despite vitest being a devDependency.
- **No `.github/` directory — zero CI.** No ESLint/Prettier/Husky/`.editorconfig`. oxlint is configured and works well; keep it.
- 4 test files, 31 test blocks, covering `movement.ts`/`itemPhysics.ts`/`genetics.ts`/`behaviorFSM.ts`. **Zero tests for `petStore.ts`, `persist.ts`, or any component.**
- `DEVLOG.md` (320 lines) is a genuinely good narrative handoff doc. `README.md` is still the unmodified stock Vite template. **No `CLAUDE.md` or `AGENTS.md` exists anywhere** — meaning none of DEVLOG's guidance currently auto-loads into a fresh agent session.
- `src/store/persist.ts` (28 lines): single flat JSON blob, raw `JSON.parse` + try/catch-null, no version field, no migration mechanism.
- Repo is private, remote `github.com/Zymos94/virtual-cats`, no LICENSE file.
- Deferred-but-likely future work (per DEVLOG and confirmed by owner): a multi-room/maps system, and an Electron desktop-overlay port.

## Decisions made (owner-confirmed, do not re-litigate)

1. Add a full tooling safety net: GitHub Actions CI (typecheck + lint + format-check + test on every push/PR), Prettier, and a Husky + lint-staged pre-commit hook that blocks bad commits.
2. Refactor `petStore.ts` into cooperating Zustand slices — same behavior, split across files.
3. Add a real versioned save/migration system, replacing the ad hoc `?? default` patching.
4. Adopt Immer as a Zustand middleware to cut spread-chain boilerplate/bug-risk, done _after_ the slice split, as its own step.
5. Add a free deploy pipeline via **Cloudflare Pages** (not GitHub Pages — that requires a paid plan for private-repo Pages sites). Public URL, no login gate — owner confirmed this is fine.
6. Both multi-room/maps and an Electron port are genuinely likely future work — do cheap, small groundwork now (a thin `platform/` wrapper around the few direct browser-API calls) without building either feature.
7. Docs should stay reasonably human-readable (might show this project to others eventually), but `CLAUDE.md`'s primary audience is an AI agent picking the repo up cold.
8. No LICENSE file for now (default all-rights-reserved is fine; revisit if this ever becomes something others contribute to).
9. **Optional/lower-priority phases (11–12 below) are backlog only** — not part of Sonnet's active roadmap. Document them so they're not forgotten; don't spend budget on them until the core phases are done.

## Libraries/tools being added — all free, and why

| Addition                               | Why                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prettier**                           | Formats to match the codebase's existing style (no semicolons, single quotes) — reduces diff noise and disagreement between human/agent editing sessions.                                 |
| **Husky + lint-staged**                | Blocks a commit that fails typecheck/lint/tests, so a mistake can't land even in a rushed session.                                                                                        |
| **GitHub Actions**                     | Free CI — typecheck + lint + format-check + test on every push. Catches regressions Sonnet might not manually verify.                                                                     |
| **Cloudflare Pages**                   | Free, no bandwidth cap, deploys private repos (GitHub Pages can't on the free plan), zero config for a plain Vite SPA, auto preview URLs on branches as a bonus.                          |
| **Immer** (`zustand/middleware/immer`) | Cuts the store's `{ ...state.pets, [id]: { ...pet, field: x } }` spread-chain boilerplate — that pattern is where most subtle store bugs would come from. ~3kb, standard Zustand pairing. |

Nothing here costs money. oxlint stays (already fast and configured) — Prettier handles formatting, oxlint stays on for linting; they don't overlap.

## CLAUDE.md — the most important deliverable

No `CLAUDE.md`/`AGENTS.md` exists today, so none of the project's hard-won conventions (single RAF loop rule, debug-hook convention, "verify in a real browser" requirement, cozy-not-hectic design philosophy) currently reach a fresh agent session automatically. **Phase 5 below creates it.** `DEVLOG.md` stays as the narrative history (milestone-by-milestone, postmortems); `CLAUDE.md` becomes the terse, always-current, auto-loaded rulebook + map. Planned sections: project snapshot, design philosophy (cozy not hectic — pulled from DEVLOG, kept at the top), the single-RAF-loop rule, commands, a store architecture map (updated once the slice split lands), save schema/versioning rule, coordinate model, file map, testing conventions, deploy note, working conventions (debug-hook, browser verification), deferred/future scope, known rough edges, and — critically — a closing rule that **any change touching store structure, a new store field, or the save schema MUST update this file in the same change.**

## Phased execution plan

Each phase is independently completable and verifiable in one Sonnet session. Do them **in order**. Phases 1–6 are mechanical/zero-behavior-risk — these can likely be batched into fewer sessions since they only need `tsc`/`lint`/`test` to pass, not manual browser verification. Phases 8–10 (save versioning, then the store split, then Immer) are the real work and should each get their own session with a full manual browser check before moving to the next — **do not bundle the store slice split with anything else.**

### Phase 1 — Repo hygiene & baseline scripts

Replace the stock `README.md` with a real project one (what it is, the commands, links to `CLAUDE.md`/`DEVLOG.md`). Add `"test": "vitest run"` and `"typecheck": "tsc -b"` to `package.json` scripts. Add `.node-version` (pin to whatever Node is actually running locally) and a minimal `.editorconfig`.
**Verify:** `npm run dev`, `npm run build`, `npm test`, `npm run typecheck` all succeed.

### Phase 2 — Prettier formatting

Add `.prettierrc.json` matching existing style (`semi: false, singleQuote: true, trailingComma: "all", printWidth: 100`), `.prettierignore`, `format`/`format:check` scripts. Run the one-time reformat **as its own commit with nothing else in it** (add a `.git-blame-ignore-revs` entry for it).
**Verify:** typecheck/test results identical before and after; diff the reformat commit and confirm only whitespace/quotes/wrapping changed.

### Phase 3 — CI (GitHub Actions)

Add `.github/workflows/ci.yml`: checkout → setup-node (reads `.node-version`) → `npm ci` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. No build/deploy step here.
**Verify:** push a commit, confirm the Actions tab goes green; break something intentionally, confirm it goes red.

### Phase 4 — Pre-commit hooks (Husky + lint-staged)

`npx husky init`; `lint-staged` runs `prettier --write` + `oxlint` on staged `.ts`/`.tsx`; the pre-commit hook itself also runs `npm run typecheck` and `npm test` against the whole project (codebase is small enough this is fast).
**Verify:** stage a file with a deliberate type error, confirm `git commit` is rejected; fix it, confirm it succeeds.

### Phase 5 — Author `CLAUDE.md`

See "CLAUDE.md — the most important deliverable" above for the section list. Pull design philosophy, the RAF-loop rule, coordinate model, file map, working conventions, and deferred scope from `DEVLOG.md`; write the rest fresh. Some sections (store map, save schema) will say "current: pre-refactor, see DEVLOG" until Phases 8–10 land — that's expected, update them then.
**Verify:** read it back cold as if it's the only doc available; confirm nothing contradicts current code.

### Phase 6 — Deploy: Cloudflare Pages

Dashboard-driven, no repo changes beyond what Phase 1 already added: free Cloudflare account → Pages → connect to Git, **scoped to only this repo** → build command `npm run build`, output `dist`, root `/` → save. Every push to `main` auto-deploys; every PR/branch gets a free preview URL.
**Verify:** push to `main`, confirm the live URL loads and plays correctly on a phone, not just desktop.

### Phase 7 — Save/migration system

Add `SAVE_SCHEMA_VERSION` to `persist.ts`; new `src/store/save/migrations.ts` with one real migration (`migrateLegacyToV1`, which is today's ad hoc `?? default` fills, relocated and named — don't build a speculative generic migration-runner framework for a project with exactly one version transition so far). Keep **migration** (backfilling fields missing because a save predates them) clearly separate from **transient-state reset** (`action`→`idle`, `destination`→`null`, etc. — thrown away on every load regardless of version) — two distinctly-named functions, not one blob.
**Verify:** add `src/store/persist.test.ts` — round-trip save/load, a hand-written legacy fixture missing several fields produces sane defaults, corrupted JSON produces `null` not a throw. Manually: load with an existing real save from before this phase and confirm it still works.

### Phase 8 — Store slice split

**The highest-risk phase. Nothing else changes alongside it.** Split `petStore.ts` into `src/store/slices/{pets,items,tail,panel,sim,tick}Slice.ts` plus `src/game/needs.ts` (pure decay helpers) and `src/store/claims.ts` (claim/exclusivity bookkeeping). Slice boundaries:

| Slice        | State                                            | Actions                               |
| ------------ | ------------------------------------------------ | ------------------------------------- |
| `petsSlice`  | `pets`, `selectedPetId`                          | select/drag/pet/suitcase/breed/rename |
| `itemsSlice` | `sceneItems`                                     | place/drag item                       |
| `tailSlice`  | `tailSegments`                                   | (written only by tick)                |
| `panelSlice` | `panelPosition`, `panelVelocity`, `panelHeld`    | drag panel                            |
| `simSlice`   | `sceneBounds`, `timeScale`, `decayAccumulatorMs` | setTimeScale, setSceneBounds          |
| `tickSlice`  | —                                                | `tick`, `resetGame`                   |

`tick()` is **relocated verbatim, not rewritten** — it's the one function that legitimately reaches across every slice, and it stays that way in `tickSlice.ts` with its existing order-of-operations comment block intact. Nothing about `usePetStore`'s public shape changes, so **no component should need editing** — if one does, something went wrong.
**Verify:** existing 4 test files pass unchanged (they don't import the store). Add `src/store/petStore.test.ts` — this store has never had tests before; cover placeItem→endDragItem, suitcase round-trip, breeding, and repeated `tick()` reducing needs by the expected amount. Then a full manual browser pass: wander/eat/sleep/play/pounce, two cats playing together, suitcase, breeding, ball throw, panel drag, speed controls, reload-persists, Reset Game.

### Phase 9 — Immer adoption

**Only after Phase 8 is verified.** Wrap the composed store in `zustand/middleware/immer`. Convert each slice's spread-chain actions to draft-mutation style **one slice at a time, one commit per slice**. Leave `tick()` untouched — Immer's `produce` accepts a recipe that returns a whole new object instead of mutating, which is exactly what `tick()` already does, so it doesn't need conversion (and it's the riskiest function in the codebase — no reason to touch it twice).
**Verify:** typecheck/test after each slice's conversion, not just at the end. Repeat the full manual browser checklist from Phase 8 — Immer mistakes (e.g. reassigning a nested object instead of mutating its fields) type-check fine while being runtime-wrong, so the manual pass is the real safety net here. Once done, update `CLAUDE.md`'s store map to describe the final layout — required last step, not a separate phase.

### Phase 10 — Platform wrapper groundwork (maps/Electron prep)

Small and deliberately restrained. New `src/platform/viewport.ts` (wraps the `window.innerWidth`/`innerHeight` reads currently duplicated in `useSceneBounds.ts` and `petStore.ts`) and `src/platform/storage.ts` (wraps `localStorage` calls, used by `persist.ts`). Explicitly **do not** wrap pointer events (Electron is Chromium-based, works identically) or restructure `sceneBounds` into per-room state (single comment noting the seam is enough — a real multi-room feature isn't being built yet).
**Verify:** typecheck/test pass; manually confirm resize and save/load still work identically.

---

### Backlog only (not in Sonnet's active roadmap — revisit later if desired)

- **Incremental TypeScript `strict` adoption** — do after Phase 8 (smaller files = easier fallout to reason about). Flip sub-flags one at a time (`noImplicitAny`, then `strictNullChecks`, then the rest), not `strict: true` all at once. `strictNullChecks` will likely surface real latent null-handling bugs, not just annotation churn — worth doing eventually, not urgent.
- **`PetSprite.tsx` decomposition** — extract the bespoke 3-way pointer gesture handler into `src/game/usePetGesture.ts` (sibling to `useDraggable.ts`). Also worth fixing while in there: `resolveGazeWorld` currently calls `usePetStore.getState()` mid-render, bypassing React's subscription model — should become proper `usePetStore(state => ...)` selectors passed into a pure function instead.

## Risks/tradeoffs flagged for whoever executes this

- **Migration system**: deliberately minimal (one version tag, one migration, no generic framework) since there's exactly one real transition to handle so far. Corrupted/unparseable saves fall back to a fresh start rather than partial recovery — matches "cozy not hectic," losing a save is mildly annoying, not worth the complexity to guard against for a solo hobby project.
- **Store slice split (Phase 8)**: the real risk isn't the reorg, it's a small behavioral drift slipping in during the copy (a default left behind, `resetGame` quietly missing a field). The new `petStore.test.ts` baseline suite is the actual safety net here — `tsc` cannot catch a `resetGame` that forgot to clear `tailSegments`.
- **Immer (Phase 9)**: self-limiting risk — `produce` throws loudly on the most common mistake. Real risk is rushing all five slices in one sitting; the plan explicitly says one slice per commit.
- **Scope discipline**: it will be tempting for a future agent to keep "future-proofing" `platform/` well past actual payoff, or to fold backlog items back into the active roadmap. Resist both — the owner explicitly wants the 6 core decisions done first.

## Verification summary (how to know each phase actually worked)

Every phase: `npm run typecheck`, `npm run lint`, `npm test` must pass (and `npm run format:check` once Phase 2 lands). Phases 7–9 additionally require a full manual browser pass using the existing `window.__petStore` debug-hook convention (append temporarily, grep for `TEMP DEBUG` before every commit, per `DEVLOG.md`'s established pattern) to fast-forward and inspect state directly, exactly as used in tonight's ball-physics and animation verification.

## What happens next

This plan is saved and ready to hand to Sonnet, one phase per session, in order. Fable will not begin executing any of it unless explicitly asked to.
