# Event Chaos

A browser game about surviving a live production under pressure.

You are in the technical booth. Cues stack up, clients change their minds mid-show, equipment fails at the worst possible moment, and every decision costs you something. Event Chaos turns running live events into a management sim — the fantasy is not power, it is holding a show together while it tries to fall apart.

Plays on desktop and mobile.

## Design

The interface is treated as professional show equipment rather than a generic game HUD: faders, terminal logs, status lights, warning panels — a broadcast control room under load. Any critical state has to be legible in under 300 ms, so the visual hierarchy runs on three fixed levels: critical, operational, decorative.

The full art direction is written down in [`docs/ART_BIBLE.md`](docs/ART_BIBLE.md) and enforced at runtime through a shared theme system instead of per-component styling.

## Systems

| Area | Where it lives |
| --- | --- |
| Art direction and theming | `utils/artDirection.ts` |
| UI primitives | `utils/uiSystem.ts`, `components/Button.tsx` |
| HUD and menu cinematics | `utils/uiCinematics.ts` |
| Mobile overlay safety rules | `utils/mobileUiPolicy.ts` |
| Runtime asset mapping | `utils/artAssets.ts` |

Gameplay is composed from focused panels — missions, achievements, shop, minigames, narrative popups, social feed, early warnings — rather than one monolithic scene.

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React + TypeScript |
| Build | Vite |
| Icons | Lucide |

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run preview   # serve the production build
```

The game runs fully offline-first and needs no external AI API key. If one is present in the environment it is treated as optional runtime metadata, never as a requirement.

## Tests

Design rules that break silently — mobile overlay safety, UI cinematics, asset mappings — are covered by regression tests rather than left to review.

```bash
npm run test           # regression suite
npm run test:playtest  # playtest scenarios
npm run typecheck
npm run check
```

---

Built by [MateCode](https://matecode.dev) — websites and custom software.
