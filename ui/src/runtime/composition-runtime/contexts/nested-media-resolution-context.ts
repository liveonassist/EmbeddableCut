// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'

export type NestedMediaResolutionMode = 'source' | 'proxy'

const NESTED_MEDIA_RESOLUTION_KEY = Symbol('embeddablecut.nested-media-resolution')

/** Provided by `NestedMediaResolutionProvider`: `current` is its `value` prop. */
export function setNestedMediaResolutionMode(mode: {
  readonly current: NestedMediaResolutionMode
}): void {
  setContext(NESTED_MEDIA_RESOLUTION_KEY, mode)
}

/** Reactive: read `.current` where the mode is used. Defaults to `source`. */
export function useNestedMediaResolutionMode(): { readonly current: NestedMediaResolutionMode } {
  return (
    getContext<{ readonly current: NestedMediaResolutionMode } | undefined>(
      NESTED_MEDIA_RESOLUTION_KEY,
    ) ?? { current: 'source' }
  )
}
