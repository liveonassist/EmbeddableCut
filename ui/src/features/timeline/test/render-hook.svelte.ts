// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'

/**
 * The timeline tests' stand-in for React Testing Library's `renderHook`: runs a
 * hook that needs no component context inside an effect root. Hooks return
 * reactive getters, so `result.current` stays live.
 */
export function renderHook<T>(hook: () => T): {
  result: { current: T }
  unmount: () => void
} {
  let value: T | undefined
  const unmount = $effect.root(() => {
    value = hook()
  })
  flushSync()
  return { result: { current: value as T }, unmount }
}

/** `act()`: runs the update and flushes Svelte's pending effects. */
export function act(update: () => void): void {
  update()
  flushSync()
}

/** `await act(async () => …)`: awaits the update, then flushes. */
export async function actAsync(update: () => Promise<void> | void): Promise<void> {
  await update()
  flushSync()
}
