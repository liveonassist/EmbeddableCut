// SPDX-License-Identifier: MIT

/**
 * `select` for selectors that close over reactive values (props, deriveds).
 * React re-runs `useXStore(selector)` with the latest closure on every
 * render; `select` only re-runs its selector on store changes, so a selector
 * reading `itemId` would keep the previous item's slice. Here the selector
 * re-runs when the store changes or a value it reads changes, and readers are
 * notified only when the selected slice differs under `equal`.
 */

import { createSubscriber } from 'svelte/reactivity'

interface ReadableStore<S> {
  getState(): S
  subscribe(listener: (state: S, previous: S) => void): () => void
}

export function selectDerived<S, U>(
  store: ReadableStore<S>,
  selector: (state: S) => U,
  equal: (a: U, b: U) => boolean = Object.is,
): { readonly current: U } {
  let hasLast = false
  let last: U
  // Waking readers re-runs the selector anyway; checking here first keeps a
  // store that emits every frame from scheduling work for an unchanged slice.
  const track = createSubscriber((update) =>
    store.subscribe(() => {
      if (!hasLast || !equal(last, selector(store.getState()))) update()
    }),
  )
  const value = $derived.by(() => {
    track()
    const next = selector(store.getState())
    if (hasLast && equal(last, next)) return last
    hasLast = true
    last = next
    return next
  })
  return {
    get current() {
      // Outside an effect nothing keeps the subscription alive, so read through.
      return $effect.tracking() ? value : selector(store.getState())
    },
  }
}
