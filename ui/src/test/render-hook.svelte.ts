// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { onTestFinished } from 'vite-plus/test'

/**
 * The port of React Testing Library's `renderHook` for hooks that take
 * getters: `hook` runs once inside an effect root and reads `props()`, which
 * `rerender(next)` replaces. `result.current` is the hook's return value (a
 * getter object, so it reads live state). Like RTL's, it unmounts when the test
 * finishes.
 */
export function renderHook<R, P = undefined>(
  hook: (props: () => P) => R,
  options: { initialProps?: P } = {},
): {
  result: { readonly current: R }
  rerender: (props: P) => void
  unmount: () => void
} {
  let props = $state.raw(options.initialProps as P)
  let result!: R
  const destroy = $effect.root(() => {
    result = hook(() => props)
  })
  flushSync()
  let unmounted = false
  const unmount = () => {
    if (unmounted) return
    unmounted = true
    destroy()
  }
  onTestFinished(unmount)
  return {
    result: {
      get current() {
        return result
      },
    },
    rerender(next: P) {
      props = next
      flushSync()
    },
    unmount,
  }
}
