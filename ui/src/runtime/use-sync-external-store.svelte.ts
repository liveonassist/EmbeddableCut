// SPDX-License-Identifier: MIT

/**
 * React's `useSyncExternalStore`, and zustand's `useStore(selector)` built on
 * it, for selectors that read reactive values (props, other hooks' results).
 * `$lib/store.svelte`'s `select` re-runs its selector only on store changes,
 * so a selector over a prop (`(s) => s.byId[itemId]`) would go stale when the
 * prop changes; these re-evaluate on either.
 *
 * Readers re-run only when the snapshot changes (`===`), as React re-renders
 * only when `Object.is` says it did.
 */

import { untrack } from 'svelte'

interface ReadableStore<S> {
  getState(): S
  subscribe(listener: (state: S, previous: S) => void): () => void
}

/**
 * Subscribes for the component's lifetime (re-subscribing when what
 * `subscribe` reads changes) and reads `getSnapshot` on every notification.
 */
export function useSyncExternalStore<T>(
  subscribe: () => (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
): { readonly current: T } {
  let version = $state(0)
  $effect(() => {
    const unsubscribe = subscribe()(() => {
      version += 1
    })
    // A change between the first read and this subscription is caught here,
    // as React re-checks the snapshot once it has subscribed.
    untrack(() => {
      version += 1
    })
    return unsubscribe
  })
  const snapshot = $derived.by(() => {
    void version
    return getSnapshot()
  })
  return {
    get current() {
      return snapshot
    },
  }
}

/** `useXStore(selector)` with a selector that may read reactive values. */
export function useStoreSelector<S, U>(
  store: ReadableStore<S>,
  selector: (state: S) => U,
): { readonly current: U } {
  return useSyncExternalStore(
    () => (onStoreChange) => store.subscribe(onStoreChange),
    () => selector(store.getState()),
  )
}
