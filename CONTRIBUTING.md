# Contributing

Thanks for your interest in EmbeddableCut! This page covers how changes land. For building and running from source, start with [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md); for code conventions, read the `AGENTS.md` in the root and in each directory you touch — they're written for people as much as for tools.

## Workflow

- Work in the Nix dev shell (`nix develop`). It is the only supported toolchain.
- Keep commits small and focused: `area: imperative summary` (`engine: keep linked clips together through a ripple trim`), then a body explaining **why**.
- Before opening a pull request, run the gates CI runs:

  ```sh
  just check all
  just check nix
  ```

- Architecture changes — anything that bends an invariant in [`engine/AGENTS.md`](engine/AGENTS.md) — need a discussion in the pull request description first.

## FreeCut

EmbeddableCut follows FreeCut, and most editor fixes belong there first: a fix that lands upstream reaches both projects. [`docs/UPSTREAM.md`](docs/UPSTREAM.md) explains how its changes come in. Work that only EmbeddableCut needs, such as the SDK and embedding, lands here.

When you change a file that came from FreeCut, keep the change small and don't reformat it, so the next merge stays clean.

## Licensing

EmbeddableCut is [MIT](LICENSE), as FreeCut is, and so is everything contributed to it.

- **Your own work,** including what you write with tools such as AI assistants: you're responsible for being entitled to contribute it.
- **Someone else's code only with its license.** Put it in a commit of its own, keep its copyright and license notice, and say in the pull request where it came from and what its license is. Its license must allow distribution under MIT.
- New source files carry an SPDX header: `// SPDX-License-Identifier: MIT`.
