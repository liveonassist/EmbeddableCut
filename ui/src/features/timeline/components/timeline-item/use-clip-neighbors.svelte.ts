// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { getTrackItemRelations } from '@/features/timeline/stores/items-store-indexes'
import { canJoinItems } from '@/features/timeline/utils/clip-utils'

export interface ClipNeighbors {
  readonly leftNeighbor: TimelineItemType | null
  readonly rightNeighbor: TimelineItemType | null
  readonly hasJoinableLeft: boolean
  readonly hasJoinableRight: boolean
  /** Clip has empty space before it (no strictly adjacent left neighbor). */
  readonly hasGapBefore: boolean
  /** Gap width in frames immediately before the clip (0 when none). */
  readonly gapBeforeFrames: number
}

/**
 * Reactive adjacency for a clip: its strictly-adjacent left/right neighbors,
 * whether each side is join-eligible, and the gap before it.
 *
 * Recomputes when the item's own position changes OR when the adjacent neighbor
 * set changes — detected via `neighborKey` from the cached per-track relation
 * index (covers deletion, cross-track moves, and position shifts).
 */
export function useClipNeighbors(item: () => TimelineItemType): ClipNeighbors {
  const neighborKey = $derived.by(() => {
    const current = item()
    return select(
      useItemsStore,
      (s) => getTrackItemRelations(s.itemsByTrackId[current.trackId], current).neighborKey,
    )
  })

  // Recomputes when item props change OR when adjacent neighbor set changes
  const neighbors = $derived.by(() => {
    void neighborKey.current
    const current = item()
    const trackItems = useItemsStore.getState().itemsByTrackId[current.trackId] ?? []
    const relations = getTrackItemRelations(trackItems, current)
    const left = relations.leftNeighbor
    const right = relations.rightNeighbor

    return {
      leftNeighbor: left,
      rightNeighbor: right,
      hasJoinableLeft: left ? canJoinItems(left, current) : false,
      hasJoinableRight: right ? canJoinItems(current, right) : false,
    }
  })

  // Gap detection: clip has empty space before it (no strictly adjacent left neighbor)
  const hasGapBefore = $derived(item().from > 0 && !neighbors.leftNeighbor)

  // Gap width in frames - lets the track-push affordance follow zoom through CSS
  // variables without forcing the entire item shell to re-render on every wheel tick.
  const gapBeforeFrames = $derived.by(() => {
    if (!hasGapBefore) return 0
    const current = item()
    const trackItems = useItemsStore.getState().itemsByTrackId[current.trackId] ?? []
    return getTrackItemRelations(trackItems, current).gapBeforeFrames
  })

  return {
    get leftNeighbor() {
      return neighbors.leftNeighbor
    },
    get rightNeighbor() {
      return neighbors.rightNeighbor
    },
    get hasJoinableLeft() {
      return neighbors.hasJoinableLeft
    },
    get hasJoinableRight() {
      return neighbors.hasJoinableRight
    },
    get hasGapBefore() {
      return hasGapBefore
    },
    get gapBeforeFrames() {
      return gapBeforeFrames
    },
  }
}
