// SPDX-License-Identifier: MIT

/**
 * Reading the engine's zustand stores from Svelte. `select` is the port of
 * `useXStore(selector)`: `select(useItemsStore, (s) => s.items).current`
 * re-renders whatever read it when the selected slice changes.
 */

import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'
import { bindListenerScope } from '@/shared/state/bound-store'

export { shallow } from 'zustand/vanilla/shallow'

// Store listeners run inside whatever effect wrote the store; untracked, what
// they read (a selector's props, a version counter) never becomes that
// effect's dependency, so a write can't re-run its own writer.
bindListenerScope(untrack)

interface ReadableStore<S> {
  getState(): S
  subscribe(listener: (state: S, previous: S) => void): () => void
}

/** A reactive view of one slice of a store, compared with `equal` (`Object.is`; pass `shallow` for objects). */
export function select<S, U>(
  store: ReadableStore<S>,
  selector: (state: S) => U,
  equal: (a: U, b: U) => boolean = Object.is,
): { readonly current: U } {
  let last = selector(store.getState())
  const track = createSubscriber((update) => {
    last = selector(store.getState())
    return store.subscribe((state) => {
      const next = selector(state)
      if (!equal(last, next)) {
        last = next
        update()
      }
    })
  })
  return {
    get current() {
      track()
      // Outside an effect nothing keeps `last` fresh, so read through.
      return $effect.tracking() ? last : selector(store.getState())
    },
  }
}
