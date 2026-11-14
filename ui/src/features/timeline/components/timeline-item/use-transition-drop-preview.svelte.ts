// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { TRANSITION_CONFIGS } from '@/types/transition'
import {
  useTransitionDragStore,
  type DraggedTransitionDescriptor,
} from '@/shared/state/transition-drag'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { getTransitionBridgeBounds } from '@/features/timeline/utils/transition-preview-geometry'
import { frameToPixelsNow } from '@/features/timeline/utils/zoom-conversions'

// Cut-drop hit zones: wide enough to stay hittable when zoomed out, bounded so
// neighbouring clips keep their own drop area.
const TRANSITION_DROP_HIT_MIN_WIDTH_PX = 72
const TRANSITION_DROP_HIT_MAX_WIDTH_PX = 240
const TRANSITION_DROP_GHOST_MIN_WIDTH_PX = 32

export interface TransitionDropPreviewState {
  readonly draggedTransition: DraggedTransitionDescriptor | null
  readonly transitionDropGhost: { left: number; width: number; cutOffset: number } | null
  readonly transitionDropHitWidth: number
}

interface UseTransitionDropPreviewParams {
  itemId: string
  previewBaseItem: TimelineItemType
}

/**
 * Transition-drag state for one clip: whether a transition is being dragged,
 * the bridge ghost this clip anchors, and the cut-drop hit width.
 */
export function useTransitionDropPreview(
  params: () => UseTransitionDropPreviewParams,
): TransitionDropPreviewState {
  const itemId = $derived(params().itemId)
  const previewFrom = $derived(params().previewBaseItem.from)
  const previewDurationInFrames = $derived(params().previewBaseItem.durationInFrames)

  const draggedTransition = select(useTransitionDragStore, (s) => s.draggedTransition)
  const transitionDragPreview = $derived.by(() => {
    const id = itemId
    return select(useTransitionDragStore, (s) => {
      if (!s.preview || s.preview.existingTransitionId) return null
      return s.preview.leftClipId === id ? s.preview : null
    })
  })
  const transitionDragPreviewRightClip = $derived.by(() => {
    const preview = transitionDragPreview.current
    return select(useItemsStore, (s) => {
      if (!preview) return null
      return s.itemById[preview.rightClipId] ?? null
    })
  })

  const transitionDropGhost = $derived.by(() => {
    const preview = transitionDragPreview.current
    const rightClip = transitionDragPreviewRightClip.current
    if (!preview || !rightClip) return null

    const bridge = getTransitionBridgeBounds(
      previewFrom,
      previewDurationInFrames,
      rightClip.from,
      preview.durationInFrames,
      preview.alignment,
    )
    const leftPx = Math.round(frameToPixelsNow(bridge.leftFrame))
    const rightPx = Math.round(frameToPixelsNow(bridge.rightFrame))
    const cutPx = Math.round(frameToPixelsNow(rightClip.from))
    const naturalWidth = rightPx - leftPx
    const minWidth = TRANSITION_DROP_GHOST_MIN_WIDTH_PX
    const left = naturalWidth >= minWidth ? leftPx : leftPx - (minWidth - naturalWidth) / 2

    return {
      left,
      width: Math.max(naturalWidth, minWidth),
      cutOffset: cutPx - left,
    }
  })

  return {
    get draggedTransition() {
      return draggedTransition.current
    },
    get transitionDropGhost() {
      return transitionDropGhost
    },
    // Read at access time, as React computed it on every render.
    get transitionDropHitWidth() {
      return Math.min(
        TRANSITION_DROP_HIT_MAX_WIDTH_PX,
        Math.max(
          TRANSITION_DROP_HIT_MIN_WIDTH_PX,
          Math.round(frameToPixelsNow(TRANSITION_CONFIGS.crossfade.defaultDuration) * 2),
        ),
      )
    },
  }
}
