# SDK

`sdk/` is `@embeddablecut/sdk`, the stable surface over the engine: `createEditor` for projects, edit operations, media, playback, rendering and export, the extension host, and the schema contracts. Hosts and the editor UI use the same API.

## Commands

Run inside `nix develop` from `sdk/`, or `just sdk check` and `just sdk test [filter]` from anywhere:

```bash
npm run check     # oxlint + type-check, engine sources included
npx vp test run   # jsdom; uses the engine's test setup
```

## Layout

- `src/editor.ts` — `Editor` and `createEditor`: projects (`createProject`, `loadDocument`, `toDocument`), the timeline (`apply`, undo, redo), playback, `renderFrame` and `export`, events, `dispose`.
- `src/extensions.ts` — `Extension`, `ExtensionHost` (transactional install over the engine's registries), `requirementsOf`.
- `src/media.ts` — `MediaApi`, `MediaProvider`, `MediaSourcePolicy`.
- `src/errors.ts` — `EditorError` and its stable codes. `SchemaError` (from the engine) covers documents.
- `src/index.ts` — the public API. Anything not exported from it is internal.

## Conventions

- **Import the engine as `@embeddablecut/engine/<path>`,** never `@/`: the alias in `vite.config.ts` and `tsconfig.json` exists only for the engine's own imports between its files.
- **The public API is `src/index.ts`.** A change to an exported name or signature is a change to the SDK's semver (`SDK_VERSION`, from `package.json`); data formats version separately (`SCHEMA_VERSIONS`, `docs/SCHEMAS.md`).
- One editor per page: the engine's stores are realm-wide singletons. `createEditor` throws `EDITOR_ACTIVE` while another is live, and `dispose()` resets every non-persisted store (`resetBoundStores`) so the next starts clean.
- Extensions register into realm-wide engine registries (`registerGpuEffect`, `registerGpuTransition`, `transitionRegistry`, `registerEditOperation`); `ExtensionHost.install` rolls back everything on a conflict.
- `renderFrame` and `export` call the headless harness's own `renderFrame` and `renderProject` (`engine/src/headless/main.ts`) with a `deliver` callback, so an SDK export and a server render run the same code.
- `apply` folds the undo entries its ops record into one (`SDK_APPLY`), captured before the first op.
- A new public class member goes on `scripts/checks/fallow-unused-class-members.allowlist.json` with its siblings: nothing in the repository calls the SDK's API the way hosts do.
- Errors a host can act on are `EditorError` or `SchemaError` with a code; never a bare `Error` from a public method's documented failure paths.
