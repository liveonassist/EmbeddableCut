// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select, shallow } from '$lib/store.svelte'
import { useEffectDropPreviewStore } from '@/features/timeline/stores/effect-drop-preview-store'

export interface EffectDropTargetState {
  readonly isEffectDropTarget: boolean
  readonly multiEffectDropTargetCount: number
}

/**
 * Effect-drop hover state for a single clip plus the global drag-end cleanup:
 * the preview clears as soon as the browser drag gesture ends anywhere.
 */
export function useEffectDropTarget(itemId: () => string): EffectDropTargetState {
  // Single shallow read replaces three subscriptions on the same store.
  const effectDropPreview = $derived.by(() => {
    const id = itemId()
    return select(
      useEffectDropPreviewStore,
      (state) => {
        const targets = state.targetItemIds
        const isTarget = targets.includes(id)
        const isSingle = targets.length === 1 && targets[0] === id
        const isMulti = isTarget && targets.length > 1
        return {
          isSingle,
          isMulti,
          hoveredMultiCount: state.hoveredItemId === id && targets.length > 1 ? targets.length : 0,
        }
      },
      shallow,
    )
  })
  const isEffectDropTarget = $derived(
    effectDropPreview.current.isSingle || effectDropPreview.current.isMulti,
  )

  $effect(() => {
    if (!isEffectDropTarget) return

    return untrack(() => {
      const clearEffectDropTarget = () => useEffectDropPreviewStore.getState().clearPreview()
      window.addEventListener('dragend', clearEffectDropTarget)
      window.addEventListener('drop', clearEffectDropTarget)

      return () => {
        window.removeEventListener('dragend', clearEffectDropTarget)
        window.removeEventListener('drop', clearEffectDropTarget)
      }
    })
  })

  return {
    get isEffectDropTarget() {
      return isEffectDropTarget
    },
    get multiEffectDropTargetCount() {
      return effectDropPreview.current.hoveredMultiCount
    },
  }
}
