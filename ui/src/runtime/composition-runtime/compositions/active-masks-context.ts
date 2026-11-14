// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { MaskInfo } from '../components/item-types'
import { EMPTY_MASK_INFOS } from '../utils/mask-info'

const ACTIVE_MASKS_KEY = Symbol('freecut.active-masks')

/** React's `ActiveMasksContext.Provider`: `current` is the composition's active masks. */
export function setActiveMasks(masks: { readonly current: MaskInfo[] }): void {
  setContext(ACTIVE_MASKS_KEY, masks)
}

/** Reactive: read `.current` where the masks are used. */
export function useActiveMasks(): { readonly current: MaskInfo[] } {
  return (
    getContext<{ readonly current: MaskInfo[] } | undefined>(ACTIVE_MASKS_KEY) ?? {
      current: EMPTY_MASK_INFOS,
    }
  )
}
