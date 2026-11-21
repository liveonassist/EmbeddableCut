// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import type { PropertyKeyframes } from '@/types/keyframe'
import { useEditorStore } from '@/shared/state/editor'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { selectReplaceableCaptionClipIds } from '@/features/timeline/stores/items-store-indexes'
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
import {
  type TimelineItemOverlay,
  useTimelineItemOverlayStore,
} from '@/features/timeline/stores/timeline-item-overlay-store'
import { useCaptionDialogState, type CaptionDialogState } from './use-caption-dialog-state.svelte'

/** Frozen selector fallbacks: a fresh array per read would thrash subscribers. */
const EMPTY_SEGMENT_OVERLAYS = [] as const
export const EMPTY_LINKED_ITEMS: TimelineItemType[] = []

const ITEM_COLOR_CLASSES: Partial<Record<TimelineItemType['type'], string>> = {
  video: 'bg-timeline-video border-timeline-video',
  audio: 'bg-timeline-audio border-timeline-audio',
  image: 'bg-timeline-image/30 border-timeline-image',
  text: 'bg-timeline-text/30 border-timeline-text',
  shape: 'bg-timeline-shape/30 border-timeline-shape',
  adjustment: 'bg-purple-500/30 border-purple-400',
  composition: 'bg-violet-600/40 border-violet-400',
}

export interface ItemMetadata {
  readonly isBroken: boolean
  readonly isLinked: boolean
  readonly hasGeneratedCaptions: boolean
  readonly linkedSelectionEnabled: boolean
  readonly segmentOverlays: readonly TimelineItemOverlay[]
  readonly keyframedProperties: PropertyKeyframes[]
  readonly hasKeyframes: boolean
  readonly hasMotion: boolean
  readonly caption: CaptionDialogState
  readonly reverseMenuShowsUnreverse: boolean
  readonly itemColorClasses: string | undefined
}

/**
 * Everything the clip reads about its own item: media health, link state,
 * keyframes, motion, transcription and the reverse-menu gate. Subscriptions are
 * granular per item id so a store mutation elsewhere cannot update this clip.
 */
export function useItemMetadata(item: () => TimelineItemType): ItemMetadata {
  const itemId = $derived(item().id)
  const mediaId = $derived(item().mediaId)

  // Granular selector: check if this item's media is broken (missing/permission denied)
  // or orphaned (media metadata deleted from IndexedDB)
  const isBrokenSelection = $derived.by(() => {
    const id = itemId
    const media = mediaId
    return select(useMediaLibraryStore, (s) => {
      if (!media) return false
      // Check for broken file handles
      if (s.brokenMediaIds.includes(media)) return true
      // Check for orphaned clips (deleted media metadata)
      if (s.orphanedClips.some((o) => o.itemId === id)) return true
      return false
    })
  })
  const isBroken = $derived(isBrokenSelection.current)
  // O(1) via index, including legacy linked audio/video pairs.
  const isLinked = $derived.by(() => {
    const id = itemId
    return select(useItemsStore, (s) => !!s.linkedItemsByItemId[id])
  })
  const linkedItemsSelection = $derived.by(() => {
    const id = itemId
    return select(useItemsStore, (s) => s.linkedItemsByItemId[id] ?? EMPTY_LINKED_ITEMS)
  })
  const linkedItemsForCaptionOwnership = $derived(linkedItemsSelection.current)
  // Lazy, items-keyed memo: legacy generated-caption detection rebuilds only
  // when the items array identity changes (not on every store mutation).
  const hasGeneratedCaptionsSelection = $derived.by(() => {
    const id = itemId
    const linkedItems = linkedItemsForCaptionOwnership
    return select(useItemsStore, (s) => {
      const captionClipIds = selectReplaceableCaptionClipIds(s)
      if (captionClipIds.has(id)) return true
      return linkedItems.some((linkedItem) => captionClipIds.has(linkedItem.id))
    })
  })
  const hasGeneratedCaptions = $derived(hasGeneratedCaptionsSelection.current)
  const linkedSelectionEnabled = select(useEditorStore, (s) => s.linkedSelectionEnabled)
  const segmentOverlays = $derived.by(() => {
    const id = itemId
    return select(
      useTimelineItemOverlayStore,
      (s): readonly TimelineItemOverlay[] => s.overlaysByItemId[id] ?? EMPTY_SEGMENT_OVERLAYS,
    )
  })
  // O(1) lookup via keyframesByItemId index instead of O(n) array scan
  const itemKeyframes = $derived.by(() => {
    const id = itemId
    return select(useKeyframesStore, (s) => s.keyframesByItemId[id] ?? null)
  })
  const keyframedProperties = $derived(
    itemKeyframes.current?.properties.filter((p) => p.keyframes.length > 0) ?? [],
  )
  const hasKeyframes = $derived(
    keyframedProperties.length > 0 ||
      (itemKeyframes.current?.vectorProperties?.some((property) => property.keyframes.length > 0) ??
        false),
  )
  const hasMotion = $derived.by(() => {
    const current = item()
    return (
      (current.motionModifiers?.some((modifier) => modifier.enabled) ?? false) ||
      (current.motionLayers?.some((layer) => layer.enabled) ?? false) ||
      (current.effects?.some((effect) => effect.audioPulse?.enabled) ?? false) ||
      (current.type === 'text' &&
        current.textMotion !== undefined &&
        Object.values(current.textMotion).some((effect) => effect !== undefined))
    )
  })
  const caption = useCaptionDialogState(() => ({
    item: item(),
    isBroken,
    linkedItemsForCaptionOwnership,
  }))
  const reverseMenuShowsUnreverse = $derived.by(() => {
    const current = item()
    if (current.type !== 'video' && current.type !== 'audio') {
      return false
    }

    const linkedItems =
      linkedItemsForCaptionOwnership.length > 0 ? linkedItemsForCaptionOwnership : [current]
    const reversibleItems = linkedItems.filter(
      (candidate) => candidate.type === 'video' || candidate.type === 'audio',
    )
    return (
      reversibleItems.length > 0 &&
      reversibleItems.every((candidate) => candidate.isReversed === true)
    )
  })
  // Get color based on item type
  const itemColorClasses = $derived(ITEM_COLOR_CLASSES[item().type] ?? ITEM_COLOR_CLASSES.video)

  return {
    get isBroken() {
      return isBroken
    },
    get isLinked() {
      return isLinked.current
    },
    get hasGeneratedCaptions() {
      return hasGeneratedCaptions
    },
    get linkedSelectionEnabled() {
      return linkedSelectionEnabled.current
    },
    get segmentOverlays() {
      return segmentOverlays.current
    },
    get keyframedProperties() {
      return keyframedProperties
    },
    get hasKeyframes() {
      return hasKeyframes
    },
    get hasMotion() {
      return hasMotion
    },
    caption,
    get reverseMenuShowsUnreverse() {
      return reverseMenuShowsUnreverse
    },
    get itemColorClasses() {
      return itemColorClasses
    },
  }
}
