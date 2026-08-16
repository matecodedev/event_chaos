# Event Chaos

[![CI](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml/badge.svg)](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml)

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
| Game rules — pacing, economy, missions, events | `hooks/gameLogic/` |
| Player preferences and viewport | `hooks/useUserSettings.ts`, `hooks/useViewportLayout.ts` |

Gameplay is composed from focused panels — missions, achievements, shop, minigames, narrative popups, social feed, early warnings — rather than one monolithic scene.

The rules of the game are pure functions with no React in them, kept in `hooks/gameLogic/` and re-exported through `useGameLogic`, which owns the stateful half.

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React + TypeScript |
| Build | Vite |
| Styling | Tailwind, compiled at build time |
| Icons | Lucide |

## Getting started

Requires Node.js 20 — the version CI and the deploy both run.

```bash
npm install
npm run dev       # development server
npm run build     # production build
npm run preview   # serve the production build
```

The game runs fully offline-first and needs no external AI API key. If one is present in the environment it is treated as optional runtime metadata, never as a requirement.

Google Fonts is the only third-party origin the game touches at runtime. Everything else — styles, textures, portraits — is served from the same origin.

## Tests

Design rules that break silently — mobile overlay safety, UI cinematics, asset mappings — are covered by regression tests rather than left to review. So is accessibility: the faders are the core mechanic and are fully keyboard operable, and a test fails if that stops being true.

```bash
npm run test           # full suite
npm run test:watch     # same suite, watching
npm run test:playtest  # playtest scenarios
npm run typecheck
npm run check          # everything CI runs, in the same order
```

Logic suites are plain `.test.ts` files on the fast `node` environment. Component suites are `.test.tsx` and opt into a DOM with a `// @vitest-environment jsdom` docblock on the first line. Assertions use Vitest's own matchers, deliberately not `jest-dom`, whose matcher types would need augmentation to keep `tsc --noEmit` clean.

## Styling

Tailwind is compiled at build time through `tailwind.config.js` and `postcss.config.js` — never loaded from a CDN.

Three components assemble class names at runtime with `String.replace`, which the content scanner cannot see. Those classes live in the config's `safelist`, and the comment there names the files to keep in sync. Removing them silently ships uncoloured progress bars and combo indicators.

## Shipping

`netlify.toml` carries the build command, the SPA redirect, cache headers and the Content-Security-Policy. Hashed build output and versioned art are cached for a year; `index.html` never is.

`npm run check:budget` fails the build if `dist/` outgrows its size budget. The limits are loose on purpose — they exist to catch a 19 MB bundle, not to police kilobytes.

---

Built by [MateCode](https://matecode.dev) — websites and custom software.
