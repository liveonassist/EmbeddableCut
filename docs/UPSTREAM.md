# Upstream

EmbeddableCut is a fork of [FreeCut](https://github.com/walterlow/freecut), and FreeCut's fixes and features keep coming in by merge. This page explains how the repository is shaped for that and how to do a merge.

## How paths map

FreeCut is one React app under `src/`. Here its framework-free half lives in the engine at the same paths, and its UI is ported to Svelte in `ui/`, file for file:

| Upstream | Here |
| --- | --- |
| `src/<path>` (everything without React) | `engine/src/<path>` |
| `src/<path>.tsx` (React components) | `ui/src/<path>.svelte`, or a folder `ui/src/<path>/` for a file of several components |
| `src/<path>/use-<name>.ts` (React hooks) | `ui/src/<path>/use-<name>.svelte.ts` |
| `src/<path>.ts` (UI-only helpers beside components) | `ui/src/<path>.ts` |
| `src/main.tsx`, `src/bootstrap.ts` | `ui/src/main.ts`, `ui/src/bootstrap.ts` |
| `src/index.css` | `ui/src/styles/app.css` |
| `src/routes/`, `src/routeTree.gen.ts` | `ui/src/routes/` and `ui/src/app/route-tree.ts` |
| `headless/<file>` | `render/<file>` |
| `scripts/check-*.mjs`, allowlists | `scripts/checks/` |
| `scripts/changelog-*.mjs`, `preview-sync-stress.mjs`, `CHANGELOG.md` | `ui/scripts/`, `ui/CHANGELOG.md` |
| `index.html`, `headless.html`, `public/`, `vite.config.ts` | `web/` |
| `DESIGN.md`, `PRODUCT.md` | `docs/` |

Engine paths exist only in the engine, so git's rename detection carries an upstream edit to the right file, and a file upstream adds lands where its directory lives. The React files no longer exist; their twins under `ui/src` carry the same names, so an upstream change names the file to carry it to.

A few things exist only here, in new files so upstream's edits to theirs merge cleanly: the Svelte twins of deps contracts that export components (`ui/src/**/deps/*-ui-contract.ts`), the workspace and tool configs, `docs/`, and the packages EmbeddableCut adds.

## Merging

```sh
just upstream fetch    # adds the `upstream` remote if needed; its push URL is disabled
just upstream status   # what's new upstream, and the UI files it touches with their Svelte twins
just upstream merge    # merge, file engine code left under src/, list the UI to port
just check all
```

- **"File location" conflicts** mark a file upstream added inside a directory that moved here. Git has already put it in `engine/`; check it isn't UI and `git add` it.
- **Modify/delete conflicts** are upstream edits to React files the Svelte UI replaced. Git leaves upstream's version under `src/`: `git add` it there.
- **Anything left under `src/`** after a merge goes through `just upstream place`. Engine code moves into `engine/src` (the package that already has its directory, else the engine). UI (components, hooks, React imports) stays and is listed with its twin under `ui/src`.
- **Porting a UI change.** Diff upstream's file against the merge base (`git diff <base> upstream/main -- src/<path>`), carry the change into the twin following [`ui/AGENTS.md`](../ui/AGENTS.md), then `git rm` the file under `src/`. A new React file is ported to its path under `ui/src`. Nothing is left under `src/` when the merge is committed.
- **New UI exports in a contract.** When upstream adds a component or hook to a deps contract, export the Svelte one from the contract's twin under `ui/src`.
- Merge commits keep upstream's history; never squash or rebase upstream commits.
