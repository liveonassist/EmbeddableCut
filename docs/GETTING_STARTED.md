# Getting Started

Everything you need to build and run EmbeddableCut from source.

## Dev environment

The Nix flake is the only supported toolchain. It pins Node.js, `just` and the linters the task scripts use, ffmpeg for the renderer's test suites, and, on x86_64 Linux, Google Chrome for headless rendering.

```sh
nix develop      # or: direnv allow, with the committed .envrc
```

Common tasks are [`just`](https://just.systems) recipes. `just` lists them all, and `just <group>` lists one group.

The packages are one npm workspace with a single lockfile. Install everything from the root:

```sh
just web install
```

## Run the editor

```sh
just web dev
```

The editor serves at `http://localhost:5173`. Open it in a Chromium browser (Chrome, Edge, Brave or Arc): it needs WebGPU, WebCodecs and the File System Access API. The first visit asks for a workspace folder, where projects, media metadata and caches live as plain files.

For playback and export timing, use a production build instead: `npm run perf` in `web/` builds and serves one at `http://localhost:4173`.

## Render from the command line

Build the harness once, then point the renderer at a workspace:

```sh
just web build
just render video --workspace ~/Videos/FreeCutProjects --project <id>
just render serve --workspace ~/Videos/FreeCutProjects   # the HTTP API on :8787
```

`just render image` builds the container; [`render/AGENTS.md`](../render/AGENTS.md) covers the CLIs, the API and running on a GPU.

## Check your work

Run what CI runs before you push:

```sh
just check all   # task scripts, architecture ratchets, engine, editor, render suites
just check nix   # the Nix packages and flake formatting (slowest)
```

While you work, the scoped recipes are quicker: `just engine test <filter>`, `just ui test <filter>`, `just engine check`.

## Next steps

- Read [`AGENTS.md`](../AGENTS.md) and the one in each package you touch.
- [`UPSTREAM.md`](UPSTREAM.md) explains how FreeCut's changes are merged in.
