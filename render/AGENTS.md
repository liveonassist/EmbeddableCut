# Render

`render/` is `@embeddablecut/render`, FreeCut's headless renderer: Node drivers that open the harness page (`headless.html` from the web build) in Google Chrome through Playwright and call `window.freecut`. The engine renders exactly as it does in the editor, WebCodecs and WebGPU included.

## Commands

From the repo root, inside `nix develop`, after `just web build`:

```bash
just render video --workspace DIR --project ID   # render.mjs: a project to video
just render frame --workspace DIR --project ID --at 2
just render serve --workspace DIR                # serve.mjs: the HTTP API on 127.0.0.1:8787
just render test                                 # node --test contracts, no browser
just render test-portable                        # + Chrome, edit-operation and media suites
just render image                                # the container image (render/Dockerfile)
```

`layout.mjs`, `edit.mjs` and `agent.mjs` (the lifecycle CLI over a workspace) run the same way with `node render/<tool>.mjs`. `nix build .#render` wraps each as `embeddablecut-<tool>`.

## Layout

- `lib/contract.mjs` — every request schema (zod), `HEADLESS_API_VERSION`, the edit operation names, `CHECKPOINT_RECIPE_SCHEMA_VERSION`.
- `lib/render-core.mjs` — starts the harness server and Chrome, maps CLI options to the app's export settings.
- `lib/lifecycle-store.mjs`, `lib/checkpoint-operations.mjs`, `lib/idempotency.mjs`, `lib/operation-queue.mjs` — the service's revisions, crash-safe operations, idempotent writes and single-page queue.
- `lib/paths.mjs` — where the built harness is: `EMBEDDABLECUT_HARNESS_DIR`, else `web/dist`.
- `server.mjs` — the static harness server (COOP/COEP/CORP, Range requests for `/media/:id`).

## Conventions

- **Google Chrome, not Chromium:** export needs its H.264 and AAC encoders. Playwright uses the `chrome` channel unless `FREECUT_CHROME_PATH` names an executable; the dev shell sets it on x86_64 Linux. `FREECUT_CHROME_ARGS` adds launch flags, `FREECUT_CHROME_ARGS_REPLACE` replaces them.
- The service binds to 127.0.0.1 and has no authentication. Put it behind something that does before exposing it; the container binds 0.0.0.0 for its own network.
- One warm page serves every request, serialized through the operation queue; scale out with more processes or containers, each with its own workspace lock.
- Software WebGPU (lavapipe in the container) rejects GPU-effect renders, which can come out blank there. Real-GPU effects need a GPU host.
- Every response carries `apiVersion`; a change to a request or response shape bumps `HEADLESS_API_VERSION` in `lib/contract.mjs`.
- `render/lifecycle-e2e.mjs`'s final-render checkpoint needs Chrome's encoder to produce the fixed 1080x1920 H.264/AAC profile; on Chrome builds whose output doesn't match it reports `RENDER_PROFILE_MISMATCH`, upstream as here.
