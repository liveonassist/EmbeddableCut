# Editor App

`web/` is `@embeddablecut/web`: FreeCut's editor, a React 19 single-page app built with Vite+ into a static PWA (`index.html`) and the headless harness page (`headless.html`) the render package drives.

## Commands

Run inside `nix develop` from `web/`:

```bash
npm run dev          # http://localhost:5173, with COOP/COEP headers
npm run check        # oxlint + type-check (includes the engine sources it imports) — CI gate
npx vp test run      # the app's tests
npm run build        # writes dist/: the PWA and headless.html
npm run perf         # a production build served locally, for playback and export timing
npm run routes       # regenerate src/routeTree.gen.ts (TanStack Router)
```

`npm run dev:quiet` keeps HMR without the debug panel; `npm run dev:compare` serves dev and production side by side. `VITE_SHOW_DEBUG_PANEL=false` hides the debug panel in dev.

## Layout

`src/` mirrors FreeCut's `src/` for what is React: `app/`, `components/` (shadcn-style UI kit on Radix), `routes/`, `features/*/{components,hooks,contexts}`, `runtime/composition-runtime/components/` (the DOM preview tree), `runtime/player/` (the React player around the engine's clock).

## Conventions

- **`@/` is layered.** It resolves against `web/src/` first and then `engine/src/` (`layeredSourceAliasPlugin` in `vite.config.ts`, the two-entry `paths` in `tsconfig.json`). Import engine modules by `@/` path, never by a relative path that climbs out of `web/src/`.
- Production chunking matches on `/src/<path>` substrings in `manualChunks`, so it applies to both trees; keep a rule's path upstream's.
- Dev and preview serve COOP `same-origin` and COEP `require-corp` (Vercel uses `credentialless`): SharedArrayBuffer and cross-origin isolation depend on them.
- The changelog is `src/data/changelog.json` and `CHANGELOG.md`, appended by `scripts/changelog-append.mjs` and `scripts/changelog-rollup.mjs`.
- Tests that mock a split adapter (`deps/<name>`) also mock its `-ui` twin when the factory supplies a component or hook.
