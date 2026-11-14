// SPDX-License-Identifier: MIT

/**
 * React's `useMemo` inside a `$derived`: `memo(deps, compute)` re-runs
 * `compute` only when a dependency changed (`Object.is`), and otherwise hands
 * back the previous result. A derived can re-evaluate without its inputs
 * having changed (on first reads made during component setup, for one);
 * where downstream identity matters, this keeps the result the same object,
 * as React's dependency comparison did.
 */
export function createMemo<T>(): (deps: readonly unknown[], compute: () => T) => T {
  let previousDeps: readonly unknown[] | null = null
  let previous: T
  return (deps, compute) => {
    if (
      previousDeps &&
      previousDeps.length === deps.length &&
      previousDeps.every((dep, index) => Object.is(dep, deps[index]))
    ) {
      return previous
    }
    previousDeps = deps
    previous = compute()
    return previous
  }
}
