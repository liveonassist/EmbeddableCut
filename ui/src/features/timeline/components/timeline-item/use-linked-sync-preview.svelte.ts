// SPDX-License-Identifier: MIT

import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { getLinkedSyncOffsetFrames } from '@/features/timeline/utils/linked-items'
import { supportsVisualFadeControls } from './visual-fade-items'
import { shouldSuppressLinkedSyncBadge } from './linked-sync-badge'
import type { VideoFadeEditState } from './use-fade-editors.svelte'

export interface LinkedSyncPreviewInput {
  contentPreviewItem: TimelineItemType
  videoFadeEdit: VideoFadeEditState | null
  linkedItemsForSync: TimelineItemType[]
  fps: number
  linkedSelectionEnabled: boolean
  linkedEditPreviewActive: boolean
  isDragging: boolean
  isPartOfDrag: boolean
  isTrimming: boolean
  isStretching: boolean
  isSlipSlideActive: boolean
  trimHandle: 'start' | 'end' | null
  trimDelta: number
  rollingEditDelta: number
  rollingEditHandle: 'start' | 'end' | null
  rippleEditOffset: number
  rippleEdgeDelta: number
  slipEditDelta: number
  slideEditOffset: number
  slideFromOffset: number
  slideNeighborSide: 'left' | 'right' | null
  slideNeighborDelta: number
  moveDragPreviewFromDelta: number
  linkedSyncPreviewUpdatesById: Parameters<typeof getLinkedSyncOffsetFrames>[3]
}

export interface LinkedSyncPreview {
  /** The clip item to render, with any live video-fade preview applied. */
  readonly contentVisualPreviewItem: TimelineItemType
  /** Frames the clip is out of sync with its linked siblings, or null when the badge is suppressed. */
  readonly linkedSyncOffsetFrames: number | null
}

/**
 * Derives the visual preview item for a clip (folding in a live video-fade edit)
 * and the linked-sync offset used to render the out-of-sync badge.
 *
 * The badge is suppressed during gestures that move linked siblings together, so
 * a transient mid-gesture offset doesn't flash. See `shouldSuppressLinkedSyncBadge`.
 */
export function useLinkedSyncPreview(input: () => LinkedSyncPreviewInput): LinkedSyncPreview {
  const contentPreviewItem = $derived(input().contentPreviewItem)
  const videoFadeEdit = $derived(input().videoFadeEdit)
  const linkedItemsForSync = $derived(input().linkedItemsForSync)
  const fps = $derived(input().fps)
  const linkedSelectionEnabled = $derived(input().linkedSelectionEnabled)
  const linkedEditPreviewActive = $derived(input().linkedEditPreviewActive)
  const isDragging = $derived(input().isDragging)
  const isPartOfDrag = $derived(input().isPartOfDrag)
  const isTrimming = $derived(input().isTrimming)
  const isStretching = $derived(input().isStretching)
  const isSlipSlideActive = $derived(input().isSlipSlideActive)
  const trimHandle = $derived(input().trimHandle)
  const trimDelta = $derived(input().trimDelta)
  const rollingEditDelta = $derived(input().rollingEditDelta)
  const rollingEditHandle = $derived(input().rollingEditHandle)
  const rippleEditOffset = $derived(input().rippleEditOffset)
  const rippleEdgeDelta = $derived(input().rippleEdgeDelta)
  const slipEditDelta = $derived(input().slipEditDelta)
  const slideEditOffset = $derived(input().slideEditOffset)
  const slideFromOffset = $derived(input().slideFromOffset)
  const slideNeighborSide = $derived(input().slideNeighborSide)
  const slideNeighborDelta = $derived(input().slideNeighborDelta)
  const moveDragPreviewFromDelta = $derived(input().moveDragPreviewFromDelta)
  const linkedSyncPreviewUpdatesById = $derived(input().linkedSyncPreviewUpdatesById)

  const contentVisualPreviewItem = $derived.by<TimelineItemType>(() => {
    if (supportsVisualFadeControls(contentPreviewItem) && videoFadeEdit !== null) {
      return {
        ...contentPreviewItem,
        fadeIn: videoFadeEdit.previewFadeIn,
        fadeOut: videoFadeEdit.previewFadeOut,
      }
    }

    return contentPreviewItem
  })

  const linkedSyncPreviewItem = $derived.by<TimelineItemType>(() => {
    let fromOffset = slideFromOffset + rippleEditOffset + moveDragPreviewFromDelta

    if (isTrimming && trimHandle === 'start') {
      fromOffset += trimDelta
    }

    if (rollingEditDelta !== 0 && rollingEditHandle === 'end') {
      fromOffset += rollingEditDelta
    }

    if (slideNeighborSide === 'right' && slideNeighborDelta !== 0) {
      fromOffset += slideNeighborDelta
    }

    if (fromOffset === 0) {
      return contentVisualPreviewItem
    }

    return {
      ...contentVisualPreviewItem,
      from: contentVisualPreviewItem.from + fromOffset,
    }
  })

  const suppressLinkedSyncBadge = $derived(
    shouldSuppressLinkedSyncBadge({
      linkedSelectionEnabled,
      linkedEditPreviewActive,
      isDragging,
      isPartOfDrag,
      isTrimming,
      isStretching,
      isSlipSlideActive,
      rollingEditDelta,
      rippleEditOffset,
      rippleEdgeDelta,
      slipEditDelta,
      slideEditOffset,
      slideNeighborDelta,
    }),
  )

  const linkedSyncOffsetFrames = $derived(
    !suppressLinkedSyncBadge && linkedItemsForSync.length > 0
      ? getLinkedSyncOffsetFrames(
          [linkedSyncPreviewItem, ...linkedItemsForSync],
          linkedSyncPreviewItem.id,
          fps,
          linkedSyncPreviewUpdatesById,
        )
      : null,
  )

  return {
    get contentVisualPreviewItem() {
      return contentVisualPreviewItem
    },
    get linkedSyncOffsetFrames() {
      return linkedSyncOffsetFrames
    },
  }
}
