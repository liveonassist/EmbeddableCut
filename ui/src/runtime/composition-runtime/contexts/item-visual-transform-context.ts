// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { ResolvedTransform } from '@/types/transform'

type ItemVisualSize = Pick<ResolvedTransform, 'width' | 'height'>

const ITEM_VISUAL_TRANSFORM_KEY = Symbol('freecut.item-visual-transform')

/** React's `ItemVisualTransformProvider`: `current` is the size given to children. */
export function setItemVisualTransform(size: { readonly current: ItemVisualSize | null }): void {
  setContext(ITEM_VISUAL_TRANSFORM_KEY, size)
}

/** Reactive: read `.current` where the size is used. */
export function useItemVisualTransform(): { readonly current: ItemVisualSize | null } {
  return (
    getContext<{ readonly current: ItemVisualSize | null } | undefined>(
      ITEM_VISUAL_TRANSFORM_KEY,
    ) ?? { current: null }
  )
}
