# Upstream

EmbeddableCut is a fork of [FreeCut](https://github.com/walterlow/freecut), and FreeCut's fixes and features keep coming in by merge. This page explains how the repository is shaped for that and how to do a merge.

## How paths map

FreeCut is one app under `src/`. Here that tree is split by what a file depends on, and both halves mirror FreeCut's paths:

| Upstream | Here |
| --- | --- |
| `src/<path>` (React components, hooks, routes, the UI kit) | `web/src/<path>` |
| `src/<path>` (everything else) | `engine/src/<path>` |
| `headless/<file>` | `render/<file>` |
| `scripts/check-*.mjs`, allowlists | `scripts/checks/` |
| `scripts/changelog-*.mjs`, `preview-sync-stress.mjs` | `web/scripts/` |
| `index.html`, `headless.html`, `public/`, `vite.config.ts` | `web/` |
| `DESIGN.md`, `PRODUCT.md` | `docs/` |

A path exists in only one package, so git's rename detection carries an upstream edit to the right file, and a file upstream adds lands in the package its directory lives in.

A few things exist only here, in new files so upstream's edits to theirs merge cleanly: the `-ui` halves of deps contracts that mixed engine exports with components (`web/src/**/deps/*-ui-contract.ts`), the workspace and tool configs, `docs/`, and the packages EmbeddableCut adds.

## Merging

```sh
just upstream fetch    # adds the `upstream` remote if needed; its push URL is disabled
just upstream status   # what's new upstream, and which files it touches that we've retired
just upstream merge    # merge, then file anything left under src/ into engine/ or web/
just check all
```

- **"File location" conflicts** mark a file upstream added inside a directory that moved here. Git has already put it in `engine/` or `web/`; check it's the right package and `git add` it.
- **Anything left under `src/`** after a merge is filed by `just upstream place`: into the package that already has its directory, and otherwise into `web/` for components, hooks and React imports, `engine/` for the rest. `just check engine` then fails on an engine file that imports the app.
- **Relative imports that cross packages.** An upstream React file that reaches into an engine module with `../` needs an `@/` path instead; `just check web` reports it.
- **New UI exports in a split contract.** When upstream adds a component or hook to a contract that has a `-ui` half here, move that export to the `-ui` half.
- **Retired files.** As the editor moves to Svelte, upstream's edits to React files it replaced show as modify/delete conflicts. Port the change to its Svelte counterpart, then keep the deletion.
- Merge commits keep upstream's history; never squash or rebase upstream commits.
