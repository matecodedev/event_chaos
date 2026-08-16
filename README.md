# Event Chaos

[![CI](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml/badge.svg)](https://github.com/matecodedev/event_chaos/actions/workflows/ci.yml)

A browser game about surviving a live production under pressure.

You are in the technical booth. Cues stack up, clients change their minds mid-show, equipment fails at the worst possible moment, and every decision costs you something. Event Chaos turns running live events into a management sim — the fantasy is not power, it is holding a show together while it tries to fall apart.

**[Play it →](https://event-chaos.netlify.app)** · Desktop and mobile · No install, no account

> Code is [MIT](LICENSE). The artwork is [not](ASSETS-LICENSE.md) — credit required, no commercial use.

---

## Run it locally

Requires Node.js 20 — the version CI and the deploy both run.

```bash
npm install
npm run dev
```

That is the whole setup. The game is offline-first: no API keys, no services, no backend. If an AI key happens to exist in the environment it is treated as optional metadata, never as a requirement.

| Command           | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Development server                    |
| `npm run build`   | Production build into `dist/`         |
| `npm run preview` | Serve that build locally              |
| `npm run check`   | Everything CI runs, in the same order |

Run `npm run check` before opening a pull request and the pipeline should hold no surprises.

---

## Design

The interface is treated as professional show equipment rather than a generic game HUD: faders, terminal logs, status lights, warning panels — a broadcast control room under load. Any critical state has to be legible in under 300 ms, so the visual hierarchy runs on three fixed levels: critical, operational, decorative.

The full art direction is written down in [`docs/ART_BIBLE.md`](docs/ART_BIBLE.md) and enforced at runtime through a shared theme system instead of per-component styling.

## Architecture

The rules of the game are pure functions with no React in them. They live in `hooks/gameLogic/` and are re-exported through `useGameLogic`, which owns the stateful half — so pacing, economy and event logic can be tested directly, without rendering anything.

| Area                                           | Where it lives                                           |
| ---------------------------------------------- | -------------------------------------------------------- |
| Game rules — pacing, economy, missions, events | `hooks/gameLogic/`                                       |
| Session state and the game loop                | `hooks/useGameLogic.ts`                                  |
| Art direction and theming                      | `utils/artDirection.ts`                                  |
| UI primitives                                  | `utils/uiSystem.ts`, `components/Button.tsx`             |
| HUD and menu cinematics                        | `utils/uiCinematics.ts`                                  |
| Mobile overlay safety rules                    | `utils/mobileUiPolicy.ts`                                |
| Runtime asset mapping                          | `utils/artAssets.ts`                                     |
| Player preferences and viewport                | `hooks/useUserSettings.ts`, `hooks/useViewportLayout.ts` |
| Storage that never throws                      | `utils/safeStorage.ts`                                   |

Gameplay is composed from focused panels — missions, achievements, shop, minigames, narrative popups, social feed, early warnings — rather than one monolithic scene.

| Layer   | Technology                       |
| ------- | -------------------------------- |
| UI      | React + TypeScript, `strict` on  |
| Build   | Vite                             |
| Styling | Tailwind, compiled at build time |
| Icons   | Lucide                           |
| Tests   | Vitest, node and jsdom           |

---

## Testing

Design rules that break silently — mobile overlay safety, UI cinematics, asset mappings — are covered by regression tests rather than left to review. So is accessibility.

```bash
npm run test         # full suite, about three seconds
npm run test:watch   # same suite, watching
```

Logic suites are plain `.test.ts` files on the fast `node` environment. Component suites are `.test.tsx` and opt into a DOM with a `// @vitest-environment jsdom` docblock on the first line.

Assertions use Vitest's own matchers, deliberately not `jest-dom`, whose matcher types would need extra augmentation to keep `tsc --noEmit` clean.

## Accessibility

The faders are the core mechanic, so they are a real slider widget rather than a styled `div`: focusable, following the WAI-ARIA pattern, and announcing the zone rather than a bare number — staying inside the safe zone is the actual objective.

| Key                                   | Effect                 |
| ------------------------------------- | ---------------------- |
| <kbd>↑</kbd> <kbd>↓</kbd>             | Move by 2              |
| <kbd>PageUp</kbd> <kbd>PageDown</kbd> | Move by 10             |
| <kbd>Home</kbd> <kbd>End</kbd>        | Jump to either extreme |

Overlays are labelled modal dialogs, the terminal and client messages are live regions, warnings are assertive, and decorative canvases stay out of the accessibility tree. `tests/fader-panel-a11y.test.tsx` and `tests/ui-accessibility-contract.test.tsx` fail if any of that stops being true.

---

## Before you change things

Three things in this repo break quietly. They are worth knowing before your first pull request.

**The Tailwind safelist is load-bearing.** Three components assemble class names at runtime with `String.replace`, which the content scanner cannot see. Those classes live in the `safelist` in `tailwind.config.js`, and the comment there names the files to keep in sync. Delete them and the build still passes — it just ships uncoloured progress bars and combo indicators.

**Nothing may reach a CDN at runtime.** Styles, textures and portraits are all served from the same origin. Google Fonts is the single third-party origin the Content-Security-Policy allows; anything else is blocked in production, not merely discouraged.

**Assets are sized for how they are drawn, not for how they look in a folder.** Crew portraits render into 40×40 boxes. `npm run check:budget` fails the build if `dist/` outgrows its budget, because this project has shipped a 19 MB bundle before.

## Quality gates

Every push and pull request runs the same pipeline, pinned to Node 20 so CI and the deploy never disagree about the runtime.

```
typecheck → lint → format → test → build → bundle budget
```

`eslint.config.js` keeps four React Compiler rules at warning level, with a comment explaining why: they flag real patterns in the game loop — randomness read during render, refs touched during render, state set from effects — and fixing them means restructuring how the simulation ticks. The count should only ever go down.

## Shipping

`netlify.toml` carries the build command, the SPA redirect, cache headers and the Content-Security-Policy. Hashed build output and versioned art are cached for a year; `index.html` never is.

## License

Code and art are licensed separately.

| What                 | License                              | Short version                                      |
| -------------------- | ------------------------------------ | -------------------------------------------------- |
| Source code          | [MIT](LICENSE)                       | Use it, change it, ship it                         |
| Art and audio design | [CC BY-NC-ND 4.0](ASSETS-LICENSE.md) | Credit required, no commercial use, no derivatives |

Fork it, read it, learn from it — that is what the MIT license is there for. The
artwork is the part that is not yours to reuse. Want to anyway? Ask at
[matecode.dev](https://matecode.dev).

---

Built by [MateCode](https://matecode.dev) — websites and custom software.
