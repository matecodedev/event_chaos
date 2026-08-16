# Event Chaos: Live Production Simulator

[![CI](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml/badge.svg)](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml)

Web game (desktop + mobile) built with React + Vite.

## Art Direction (AAA Block 1)

- Art bible: `docs/ART_BIBLE.md`
- Runtime theme system: `utils/artDirection.ts`
- UI system base (buttons): `utils/uiSystem.ts` + `components/Button.tsx`

## Cinematic UI (AAA Block 2)

- HUD/menu cinematic hierarchy: `utils/uiCinematics.ts`
- Mobile overlay safety policy: `utils/mobileUiPolicy.ts`
- Regression tests: `tests/mobile-ui-policy-regressions.test.ts` + `tests/ui-cinematics-regressions.test.ts`

## Art Assets Pack

- Runtime asset mappings: `utils/artAssets.ts`
- Integrated asset bundle: `public/assets/aaa/`
- Regression tests: `tests/art-assets-regressions.test.ts`

## Local Run

Prerequisite: Node.js 20 (the version CI and the Netlify deploy both use).

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build production: `npm run build`
4. Run tests: `npm run test`

## Verification

`npm run check` runs the same four steps as CI, in the same order:
typecheck, tests, production build, bundle budget. Run it before opening a PR
and the pipeline should hold no surprises.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm run test` | Full suite (logic on node, components on jsdom) |
| `npm run test:watch` | Same suite in watch mode |
| `npm run check:budget` | Fails if `dist/` outgrows its size budget |
| `npm run check` | All of the above, as CI runs them |

### Test layout

Logic suites are plain `.test.ts` files running on the fast `node` environment.
Component suites are `.test.tsx` and opt into a DOM with a
`// @vitest-environment jsdom` docblock on the first line. Assertions use
Vitest's built-in matchers, deliberately not `jest-dom`, so the suite typechecks
without extra type augmentation.

Accessibility behaviour is covered by `tests/fader-panel-a11y.test.tsx` and
`tests/ui-accessibility-contract.test.tsx`. The faders are the core mechanic and
are fully keyboard operable: arrows step by 2, PageUp/PageDown by 10, Home and
End jump to the extremes.

## Styling

Tailwind is compiled at build time via `tailwind.config.js` and `postcss.config.js`.
Three components assemble class names at runtime with `String.replace`, which the
content scanner cannot see; those classes live in the config's `safelist` and the
comment there lists the files to keep in sync.

## Deployment

`netlify.toml` holds the build command, the SPA redirect, cache headers and the
Content-Security-Policy. Google Fonts is the only third-party origin the game
loads; everything else is served from the same origin.

## AI/API Note

The game runs fully offline-first and does not require any external AI API key to work.
If an API key exists in env vars, it is treated as optional runtime metadata only.
