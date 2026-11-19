# Editor App

`web/` is `@embeddablecut/web`: the build of the editor app, a static PWA (`index.html`) and the headless harness page (`headless.html`) the render package drives. Its only sources are two one-line entries: `app.ts` imports the app from `@embeddablecut/ui/app` (the Svelte UI's `src/bootstrap.ts`) for `index.html`, `headless.ts` the harness from `@embeddablecut/sdk/harness` for `headless.html`. Vite's dev server can't resolve a package named in HTML, so the pages load these modules instead.

## Commands

Run inside `nix develop` from `web/`:

```bash
npm run dev          # http://localhost:5173, with COOP/COEP headers
npm run check        # oxlint over the entries and build config — CI gate (the app is checked in ui/)
npm run build        # writes dist/: the PWA and headless.html
npm run perf         # a production build served locally, for playback and export timing
```

`npm run dev:quiet` keeps HMR without the debug panel; `npm run dev:compare` serves dev and production side by side. `VITE_SHOW_DEBUG_PANEL=false` hides the debug panel in dev.

## Conventions

- **`@/` resolves as in the UI**: against `ui/src/` first, then `engine/src/` (`layeredSourceAliasPlugin` in `vite.config.ts`), with `$lib` and `$components` aliased into `ui/src/`. Svelte compiles with `ui/svelte.config.js`.
- Production chunking matches on `/src/<path>` substrings in `manualChunks`, so it applies to both trees; keep a rule's path upstream's, with the Svelte file's name.
- `serviceWorkerVersionPlugin` stamps `public/sw.js` with the `main` entry chunk's name, so each deploy's service worker differs and purges the old cache.
- Dev and preview serve COOP `same-origin` and COEP `require-corp` (Vercel uses `credentialless`): SharedArrayBuffer and cross-origin isolation depend on them.
