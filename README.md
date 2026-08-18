# Virtual Cats

A from-scratch clone of the Catz 5 / Petz virtual pet games — a cozy, low-pressure desktop pet
sim. No backend; everything runs client-side with `localStorage` persistence.

Two cats wander a single room, decide what they want (food, play, sleep, attention) through a
shared attention-scoring AI, and can be petted, dragged, bred, and put away in a suitcase panel.
Procedurally-rendered SVG cats walk, sit, sleep, pounce on toys, and play with each other and with
physics-driven items (balls, beds, litter boxes).

## Commands

```
npm run dev          # start the dev server
npm run build        # typecheck + production build
npm run lint         # oxlint
npm run typecheck    # tsc, no emit
npm test             # vitest run
```

## Docs

- **`CLAUDE.md`** — the always-current rulebook and architecture map for picking up development
  cold (single RAF loop rule, coordinate model, file map, working conventions).
- **`DEVLOG.md`** — narrative milestone history and postmortems.
- **`ARCHITECTURE.md`** — the infrastructure roadmap (CI, save versioning, store refactor).
- **`ANIMATION_PLAN.md`** — the cat animation roadmap (gaits, idle behaviors, body customization).
