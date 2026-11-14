# EmbeddableCut

EmbeddableCut is an embeddable video editing SDK built from [FreeCut](https://github.com/walterlow/freecut), a browser-based multi-track editor: a framework-independent engine for editing, playback and rendering, the editor that runs on it, and a headless Chrome renderer for servers.

## Read every `AGENTS.md` on your path

Each project subdirectory owns an `AGENTS.md` describing its stack, commands, and conventions. **Always read the `AGENTS.md` of every directory you work in** — including nested ones — before making changes. This root file deliberately does not duplicate those details.

- [`engine/AGENTS.md`](engine/AGENTS.md) — the engine: state, editing, media, effects, playback, rendering, architecture invariants.
- [`sdk/AGENTS.md`](sdk/AGENTS.md) — the SDK: the public API, extensions, the bridge, one editor per page.
- [`ui/AGENTS.md`](ui/AGENTS.md) — the Svelte 5 editor UI: mounting, theming, contributions, porting from React.
- [`web/AGENTS.md`](web/AGENTS.md) — the editor app.
- [`render/AGENTS.md`](render/AGENTS.md) — headless rendering: CLIs, the HTTP service, the container.

### Writing an `AGENTS.md`

[`engine/AGENTS.md`](engine/AGENTS.md) is the model.

- Bullets over prose: succinct and information-dense, one rule or fact per bullet. A heading gets a sentence or two of lead-in at most.
- Lead with the rule and name the exact symbol, file, or command. Add the reason in a clause when it isn't obvious.
- Record what the code can't tell the reader: invariants, constraints, gotchas, measured results.
- A settled decision gets a line, not its history. Keep background only where it still changes what the reader does.
- Reach for `###` subheadings, tables, and code blocks when they make a section easier to scan.

## Layout

- `engine/` — `@embeddablecut/engine`: everything that runs without a UI framework. Its `src/` mirrors FreeCut's `src/`.
- `sdk/` — `@embeddablecut/sdk`: the public API over the engine, which hosts and the editor UI use alike.
- `ui/` — `@embeddablecut/ui`: the editor in Svelte 5, mountable in any page; its `src/` mirrors `web/src/`.
- `web/` — `@embeddablecut/web`: the editor app, FreeCut's React UI, built as a static PWA plus the headless harness page. Its `src/` mirrors FreeCut's `src/` too.
- `render/` — `@embeddablecut/render`: FreeCut's headless renderer (formerly `headless/`), driving the harness in Chrome.
- `schemas/` — generated JSON Schema for the portable formats; [`docs/SCHEMAS.md`](docs/SCHEMAS.md) is the policy.
- `scripts/checks/` — FreeCut's architecture ratchets, run over both trees by `overlay.mjs`.
- `flake.nix` — the dev shell, packages, and checks.
- `justfile`, `tasks/`, `scripts/tasks/` — the command interface: one `mod` per group, with anything longer than a few lines in a script.
- `docs/` — contributor docs, linked from `README.md`.

## Upstream

- **FreeCut is upstream, and every path keeps its upstream twin.** A file at FreeCut's `src/<path>` lives at `engine/src/<path>` or `web/src/<path>`, never both, so merges follow the renames. Don't move a file within a tree without a reason that outweighs that.
- Merge upstream with `just upstream merge`; [`docs/UPSTREAM.md`](docs/UPSTREAM.md) is the procedure. Never push to the `upstream` remote; its push URL is disabled.
- Code that only EmbeddableCut has goes in new files where it can, so upstream's edits to theirs merge cleanly.
- Never reformat an upstream file wholesale: upstream isn't format-clean, and the noise would conflict with every merge. Format what you write, from inside its package (`cd engine && npx vp fmt src/...`): the repo root has no Vite config, and oxfmt there falls back to its defaults.

## Domain

- A _project_ holds media references and a root timeline; _compositions_ (pre-comps and sequences) nest timelines inside it. Items reference media by `mediaId`; `src` is a runtime URL and is never persisted for workspace media.
- **Time is in frames** at the project's fps (`from`, `durationInFrames`, `sourceStart`). Seconds appear only at the edges: media probing, export settings, the render API.
- **Persisted data is versioned and owned** ([`docs/SCHEMAS.md`](docs/SCHEMAS.md)): older versions migrate, newer ones are refused, unknown fields are errors. FreeCut owns the project schema; EmbeddableCut owns the project document around it.
- Undo is whole-timeline snapshots per editing context (`timeline-command-store.ts`), not inverse operations. Anything that edits the timeline goes through `execute(...)` in the timeline actions.
- **Local-first.** Projects and media live in a workspace folder the user picks; nothing is uploaded unless a host wires it up.

## Design language

FreeCut's design is the default and the bar. [`docs/DESIGN.md`](docs/DESIGN.md) holds its tokens and rules, [`docs/PRODUCT.md`](docs/PRODUCT.md) who it's for.

- **Precise, confident, calm.** Dense panels read at a glance by editors coming from Premiere Pro and DaVinci Resolve; keyboard first, frame accurate.
- **Chrome stays dark and neutral** so footage carries the color. One accent (`--primary`, orange), IBM Plex Sans and Mono, Lucide icons.
- **Tokens, not values.** Colors, radii and type come from the CSS variables in `web/src/index.css`. Never hard-code them.

## Conventions

- The toolchain comes from the Nix flake — enter it with `nix develop` or `direnv`. Never a system `node`. Need a tool? Add it to `flake.nix`, in the group its shell composes from.
- `just` is the entry point for common tasks: `just` lists every recipe, `just <group>` one group. A command people run more than once gets a recipe.
- npm workspaces: one `package-lock.json` at the root. Install with `just web install` (`npm install` at the root); add a dependency to the package that imports it, exact-pinned, never `^` or `~`.
- `onnxruntime-web` (a dev build) and `lucide-react` (0.468.x) are pinned deliberately: never routine-bump either.
- Shell scripts pass `shfmt --indent 2` and `shellcheck`, justfiles `just --fmt`, the flake `alejandra` (`just check tasks`).
- License is MIT, FreeCut's. New source files start with an SPDX header (`// SPDX-License-Identifier: MIT`, or the file type's comment equivalent); upstream files stay as upstream has them.
- Code from elsewhere goes in a commit of its own, keeps its notice, and names its source and license in the message.
- Comments explain **why**, not what. Keep them minimal.
- No back-compat shims for hypothetical changes. Pre-1.0, breaking changes land cleanly.
- Only write high quality tests. Do not test trivial, noisy, or common behavior; match the testing conventions of the surrounding code.
- Commit to the current branch in small, logical commits: `area: imperative summary`, then a wrapped prose body explaining why.
- Never commit `node_modules/`, `dist/`, `result*`, `.cache/`, `coverage/`, or `.env*`. Review your diff before committing.
- **Never credit yourself.** AI agents must not add `Co-Authored-By`, "Generated with", or any other AI attribution or self-reference to commits, pull requests, code, or docs.

## Quality gates

CI runs these; run them before committing (details in each subdirectory's `AGENTS.md`). `just check` has them as recipes:

```sh
just check tasks          # justfiles, task scripts, flake formatting
just check architecture   # FreeCut's boundary, seam, dead-code and edge-budget ratchets
just check engine         # lint, type-check and test the engine on its own
just check sdk            # lint, type-check and test the SDK
just check ui             # lint, svelte-check and test the editor UI
just check web            # lint, type-check, test and build the editor
just check render         # render contracts and the portable Chrome suites (after a web build)
nix flake check           # the packages and the flake's formatting
```
