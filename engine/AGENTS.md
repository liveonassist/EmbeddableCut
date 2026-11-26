# Engine

`engine/` is `@embeddablecut/engine`: everything in the editor that runs without a UI framework. Types, timeline state and editing actions, media import and resolution, persistence, effects and transitions, the canvas and WebGPU renderer, the playback clock, export, and the headless harness's page side. Hosts consume it as TypeScript source; there's no build step.

## Commands

Run inside `nix develop` from `engine/`:

```bash
npm run check        # oxlint + type-check through Vite+ — CI gate
npx vp test run      # the test suite (jsdom by default; most files opt into node)
npm run test:coverage  # with the coverage ratchet floor in vite.config.ts
```

Or from anywhere: `just engine check`, `just engine test [filter]`.

## Layout

`src/` mirrors upstream's `src/` path for path, so `@/features/timeline/stores/items-store` names the same module here as upstream. Only upstream's React UI is missing: it is ported to Svelte in `ui/src/` at the same paths.

- `src/types/` — the data model: `Project`, the `TimelineItem` union, `Transition`, keyframes, effects, `MediaMetadata`.
- `src/features/<feature>/{stores,services,utils,deps}` — feature state and logic. `timeline/stores/actions/` is the editing API; `timeline/stores/timeline-actions.ts` is its barrel.
- `src/shared/` — cross-feature state (`shared/state/*`: playback, selection, editor), project migrations (`shared/projects/migrations/`), transitions (`shared/timeline/transitions/`), typography, logging.
- `src/infrastructure/` — platform adapters: `gpu-*` (effects, transitions, compositor, masks, text, scopes), `storage/` (the workspace folder, OPFS, legacy IndexedDB), `analysis/`, `audio/`, `browser/`, `lottie/`, `upscale/`.
- `src/runtime/renderer/` — the canvas/WebGPU render engine (`client-render-engine.ts`), export (`render-pipeline.ts`, `canvas-render-orchestrator.ts`) and its workers.
- `src/runtime/player/clock/Clock.ts` — the frame clock; `runtime/composition-runtime/utils/` — scene assembly, video timing and preview audio primitives.
- `src/schema/` — EmbeddableCut's portable formats: the project document, asset records, `SCHEMA_VERSIONS`, and the JSON Schema committed in `schemas/`.
- `src/headless/` — `window.embeddablecut`, the page API the render package drives.
- `src/i18n/` — i18next and every locale. `scripts/check-locale-coverage.mjs` reports what a locale lacks (`just engine locale-coverage <code>`).

## Code Style

- Formatting is oxfmt with the root `.oxfmtrc.json`: no semicolons, single quotes, 100 columns. Lint is oxlint with the root `.oxlintrc.json`.
- Upstream files keep upstream's formatting; don't reformat what you don't change.
- New files start with `// SPDX-License-Identifier: MIT`.
- Tests sit beside their subject as `<name>.test.ts`. Start a test that needs no DOM with `// @vitest-environment node`, as most do.

## Architecture Invariants

Don't break these without an architecture discussion in the PR description.

### Boundaries

- **The engine never imports the app.** `@/` resolves only to `engine/src/` here, and `npm run check` type-checks the engine alone, so an import of anything in `ui/src/` fails. A component or hook belongs in `ui/`.
- **No UI framework, not even its types.** `engine/vite.config.ts` bans React, Svelte, Radix, Lucide, `zustand`'s React entry and `sonner`. Stores use `create` from `@/shared/state/bound-store`, notices go through `toast` from `@/shared/notifications`.
- **Cross-feature imports go through `deps/`.** A feature reaches another only inside `features/<name>/deps/*-contract.ts`; its code imports the sibling adapter (`deps/<name>.ts`). `just check architecture` enforces it, with upstream's layer rules and edge budgets.
- When a contract would re-export a component or hook, that export goes in the UI's `deps/<name>-ui-contract.ts` and `-ui` adapter instead.
- `shared/`, `infrastructure/`, `types/`, `config/` and `i18n/` never import `features/` or `runtime/`. `runtime/` reaches feature state only through `runtime/<engine>/deps/*-contract.ts`.

### State and editing

- Stores are zustand singletons, one per JavaScript realm. Two editors in one page share them.
- `create` in `shared/state/bound-store.ts` is zustand's signature over a vanilla store. Calling a store as a hook goes through the binding a React host installs with `bindStoreHook`; the Svelte UI reads stores through `select` and never calls them. Engine code uses `getState`, `setState` and `subscribe` only.
- i18next is initialized here without a UI plugin; a UI binds it itself (the Svelte UI's `$lib/i18n.svelte`).
- Edits go through the actions in `features/timeline/stores/actions/`, each wrapped in `execute(type, fn)` so undo captures a whole-timeline snapshot before it. A store's `_`-prefixed mutators are for actions only.
- **Host guards run in `execute`**: it diffs the snapshots around each command, and an edit that removes an item `EditGuards.remove` refuses is restored with no undo step, then reported to `onEditRefused` (`stores/edit-guards.ts`). Trims, splits (the left half keeps its id) and moves into compound clips aren't removals.
- A host's settings policy (`settings/stores/settings-policy.ts`) swaps the settings store's actions so locked keys refuse changes, and persists the user's own values while it holds.
- `timeline-persistence.ts` is the only bridge between the stores and a saved `Project`: `buildTimelineFromStores()` out, `hydrateTimelineStoresFromProject()` in.
- Persisted projects carry `schemaVersion`; `migrateProject()` runs every migration in `shared/projects/migrations/` on load, and throws `ProjectSchemaTooNewError` for a project from a newer editor. The project schema is upstream's: EmbeddableCut adds no project migrations of its own, only optional fields marked `EmbeddableCut:` and listed in `docs/SCHEMAS.md` (the fork).
- A change to a format EmbeddableCut owns (`src/schema/`) bumps its version, adds a migration and regenerates `schemas/` (`npx vp test run src/schema -u`); `docs/SCHEMAS.md` is the checklist.

### URL media

- `storageType: 'url'` media is read where it lives: never copied, never downloaded whole on the playback path. [`docs/MEDIA.md`](../docs/MEDIA.md) is the full picture.
- **Every mediabunny read of a URL goes through `createRemoteFetch`** (`infrastructure/remote-media/`), via `createMediabunnyInputSource`: host headers, URL renewal, and the shared block cache. Build sources with that factory, never `new UrlSource` directly.
- Workers learn how to read a URL from `ObjectUrlSourceMetadata.remote`; pass `getObjectUrlSourceMetadata(src)` with any URL sent to a worker.
- `features/media-library/services/remote-media.ts` owns which URL each asset reads now, renews through the host's resolver, and moves readers over by invalidating the asset's entry in `blobUrlManager`.
- Credentials (`headers`) live only in memory, in the remote registry; `MediaMetadata.remote` and asset records never hold them.
- Remote preview `<video>` elements are CORS (`crossOrigin`, set in `VideoSourcePool`); the export engine gives remote sources no fallback element.
- **A fetch's first URL is its asset; any other is a file the asset references** (an HLS playlist's variants and segments), cached under its path beside the asset and never rewritten to the asset's current URL. Playlists (`.m3u8`) are never block-cached.
- **Every `Input` that may read a URL passes `formatOptions: MEDIA_INPUT_FORMAT_OPTIONS`**, so HLS timestamps start at the stream rather than at Unix time.
- HLS keeps its playlist MIME type; test kinds with `isVideoMimeType` (`shared/utils/media-mime.ts`), not a `video/` prefix, where a stream must count as video.
- **Nothing reads a URL asset whole on the editing path.** `getMediaBlobUrl` hands back its URL, waveform requests cap at `REMOTE_WAVEFORM_MAX_SPAN_SEC` of its source, and lazy keyframe indexes are built only for ISOBMFF. Whole-file jobs (proxies, transcription, analysis, bundles) are the exception, and stay opt-in.

### Rendering

- `createCompositionRenderer()` takes a plain `CompositionInputProps` snapshot, so the same engine serves preview overlays, export, thumbnails and the headless harness. Sub-compositions and media still come from `useCompositionsStore` and the media library, which is why a worker export with compositions falls back to the main thread (`WORKER_REQUIRES_MAIN_THREAD:composition`).
- GPU effect and transition pipelines compile every registry entry at init (`effects-pipeline.ts`, `transition-pipeline.ts`).
- **A source shown twice at one moment is decoded once**, as a clip and its blurred copy are. `SharedVideoExtractorPool` picks an item's lane by the source time it asks for, so items at the same frame read one lane; on the DOM player, `resolveVideoTwins` finds clips that always show another's frame, and `TwinPreviewVideo` paints and registers that clip's `<video>` for them.
- Export uses WebCodecs through mediabunny; the renderer's output must match the preview frame for frame.

### Browsers

Firefox is a target beside Chromium; [`docs/BROWSERS.md`](../docs/BROWSERS.md) has the differences.

- **Decide by capability, never by user agent:** `getPlatformSupport()` (`infrastructure/browser/platform-support.ts`), or a probe of the API itself.
- **Every `copyExternalImageToTexture` that may get a `<video>` or `VideoFrame` goes through `uploadExternalImage`** (`infrastructure/gpu-media/external-image-upload.ts`): Firefox refuses frames there. Chromium's path through it is the plain copy.
- `importExternalTexture` existing doesn't mean it works (Firefox on Linux throws): check `canImportExternalFrames(device)`.
- **A handle may wrap a `File`** (`isFileBackedHandle`, Firefox's pickers and drops): copy its bytes, never link or persist it. Check permissions with `queryHandlePermission`/`requestHandlePermission` from `storage/handles-db.ts`, which hold where there's no permission API.
- **A codec only the media element decodes** (HEVC in Firefox) decodes on the main thread only: work in a worker must fall back to the main thread for it, as export (`WORKER_REQUIRES_MAIN_THREAD:video-fallback`) and filmstrips do.
