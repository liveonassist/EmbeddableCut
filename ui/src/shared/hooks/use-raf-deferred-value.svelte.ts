// SPDX-License-Identifier: MIT

/**
 * Keeps a high-cost consumer on its last committed value until the next frame.
 *
 * Scheduling the handoff through rAF guarantees pointerup can finish first:
 * the expensive consumer reads `current`, which only catches up with `value()`
 * a frame after it changes. (React needed a transition on a separate fiber for
 * this; Svelte only re-runs what reads `current`.)
 */
export function useRafDeferredValue<T>(value: () => T): { readonly current: T } {
  let deferredValue = $state.raw(value())

  $effect(() => {
    const next = value()
    if (Object.is(deferredValue, next)) return

    const rafId = requestAnimationFrame(() => {
      deferredValue = value()
    })

    return () => cancelAnimationFrame(rafId)
  })

  return {
    get current() {
      return deferredValue
    },
  }
}
