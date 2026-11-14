# Rendering

EmbeddableCut renders in three places, and all three run the same engine code:

- **The preview** in the editor, which draws with the engine's canvas and WebGPU renderer over the DOM composition.
- **Export in the browser**: the editor's export dialog, or `editor.export()` in the SDK.
- **The render service** in `render/`, which drives the same engine in headless Google Chrome for CLIs, an HTTP API and containers.

An SDK export and a server render call the same functions (`renderProject` and `renderFrame` in `engine/src/headless/main.ts`), with the same codec fallbacks, fonts, effects and transitions. A server render matches the browser's export as long as both run the same build of the engine and the same extensions.

## The CLI

From the repo root, after `just web build`:

```sh
just render video --workspace ~/Projects --project <id>                  # a workspace project
node render/render.mjs --workspace ~/Projects --document doc.json        # a project document
node render/render.mjs --workspace ~/Projects --batch jobs.json          # several jobs, one browser
just render frame --workspace ~/Projects --project <id> --at 2
```

`--codec`, `--container`, `--resolution`, `--fps`, `--quality`, `--in`, `--out-sec`, `--duration` and `--audio-only` pick the output; `--strict` fails on any validation warning. `--extension a.js,b.js` installs extensions first. `nix build .#render` wraps each tool as `embeddablecut-<tool>`.

## The HTTP API

`just render serve --workspace DIR` serves on `127.0.0.1:8787` with one warm Chrome page. Requests are serialized through a queue (`--max-queue-depth`, 8 by default), with deadlines for renders and edits.

| Route | Purpose |
| --- | --- |
| `GET /health` | GPU, harness and workspace, and the extensions installed |
| `GET /v1/capabilities` | Request schemas, render options, `projectDocument: true`, and `renderer`: the SDK version, `schemaVersions` and extensions this service renders with |
| `POST /v1/render` | Render to a file: `project` (a workspace id), `projectObject` (FreeCut's project JSON) or `projectDocument` |
| `POST /frame`, `POST /layout` | One frame as an image, or the items' boxes at a frame; the same three project sources |
| `/v1/projects`, `/v1/media`, `/v1/checkpoint-operations` | FreeCut's lifecycle API over the workspace: revisions, idempotent writes, crash-safe operations |

Every response carries `apiVersion`. Errors are `{ ok: false, error: { code, message, fields } }`; a project document refused by the schema reader answers 400 with its `SchemaError` code (`SCHEMA_TOO_NEW`, `SCHEMA_INVALID`, ...), and one needing an extension the service lacks answers 422 `EXTENSION_MISSING`.

### Project documents

A project document (see [`SCHEMAS.md`](SCHEMAS.md)) is the request a stateless renderer wants: the project and every asset it uses. URL assets are read by the page straight from their URLs, through the same range cache as the browser ([`MEDIA.md`](MEDIA.md)), so a render node needs network access to them, not copies. Workspace assets are read from the service's workspace by id.

```sh
curl -X POST localhost:8787/v1/render -H 'content-type: application/json' \
  -d "{\"projectDocument\": $(cat doc.json), \"codec\": \"h264\", \"quality\": \"high\"}" -o out.mp4
```

### Extensions

A project with a custom effect or transition renders on a server only if the server has the extension. `--extension` (or `FREECUT_EXTENSIONS`, comma-separated) names ES module files; the page imports each and installs its default export, one `Extension` or an array, before taking requests. `/v1/capabilities` lists them, and a document whose `requires` names one the service lacks is refused, not rendered wrong.

Write an extension once and load the same module in the editor (`createEditor({ extensions })` or `editor.extensions.install`) and on the server. The module runs in the harness page, so it must be self-contained: no bare imports, nothing but browser APIs.

## Containers

`just render image` builds `render/Dockerfile`: Node, Google Chrome (for its H.264 and AAC encoders), Mesa's software Vulkan, and fonts.

```sh
docker run --rm -p 8787:8787 \
  -v /srv/workspace:/workspace \
  -v /srv/extensions:/extensions:ro -e FREECUT_EXTENSIONS=/extensions/looks.js \
  embeddablecut-render
```

- **GPU.** Software WebGPU (lavapipe or SwiftShader) can come out blank for GPU effects, so the service refuses GPU-effect renders there. On a Linux host with an NVIDIA GPU run with `--gpus all -e NVIDIA_DRIVER_CAPABILITIES=all`, and WebGPU uses the real GPU.
- **No authentication.** The service binds to `0.0.0.0` inside the container for its own network only. Put it behind a gateway that authenticates before exposing it.

## Scaling

One service is one Chrome page doing one render at a time, so throughput comes from running more of them:

- **Stateless jobs scale horizontally.** A `projectDocument` with URL assets needs nothing from the node it lands on, so any number of identical containers can sit behind a load balancer. Give each its own workspace volume (the service takes an exclusive writer lock on it), even an empty one.
- **Back-pressure is explicit.** A full queue answers `429`; poll `GET /v1/status` for progress and queue depth, and use `GET /health` as the readiness probe. Long jobs fit the asynchronous checkpoint operations (`202`, then poll).
- **Pin renderers to the editor.** `renderer.sdkVersion` and `renderer.schemaVersions` in `/v1/capabilities` say what a node renders with. Route a document only to nodes whose project schema is at least the document's, with the same extensions installed; the reader refuses the rest.
- **Cache close to the media.** The page's range cache lives in Chrome's profile, which is per container and per process. A shared HTTP cache (or a CDN) in front of the media servers is what saves bandwidth across nodes.
