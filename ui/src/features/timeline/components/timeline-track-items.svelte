<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import { isTimelineItemCompactAtZoom } from '@/features/timeline/utils/timeline-dom-density'

  const MAX_IMMEDIATE_SELECTED_OVERVIEW_ITEMS = 128
  const EMPTY_SELECTED_ITEM_IDS: string[] = []

  const EMPTY_ITEMS: TimelineItemType[] = []

  function isItemDetailEligible(
    item: TimelineItemType,
    detailRange: { start: number; end: number },
  ): boolean {
    return item.from + item.durationInFrames > detailRange.start && item.from < detailRange.end
  }

  function isItemCompactByWidth(
    item: TimelineItemType,
    allItemsCompact: boolean,
    noItemsCompact: boolean,
    fps: number,
    pixelsPerSecond: number,
  ): boolean {
    return (
      allItemsCompact ||
      (!noItemsCompact && isTimelineItemCompactAtZoom(item.durationInFrames, fps, pixelsPerSecond))
    )
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useSelectionStore } from '@/shared/state/selection'
  import { TimelineItem } from './timeline-item'
  import TimelineDensityOverview from './timeline-density-overview.svelte'
  import { TimelineJoinIndicatorsZoomGate } from './timeline-item/join-indicators'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { useVisibleItemDetailRange } from '../hooks/use-visible-items.svelte'
  import { useStagedTimelineDetailIds } from '../hooks/use-staged-timeline-detail.svelte'
  import {
    DENSE_TIMELINE_OVERVIEW_ITEM_THRESHOLD,
    getDemotionAwarePixelsPerSecond,
    getTimelineCompactCohortSignal,
  } from '@/features/timeline/utils/timeline-dom-density'
  import {
    getTimelineItemsForFrameRange,
    getTimelineTrackItemRangeIndex,
    type TimelineItemDurationBounds,
  } from '@/features/timeline/utils/timeline-item-range-index'

  interface TimelineTrackItemsProps {
    trackId: string
    trackItems: ReadonlyArray<TimelineItemType>
    totalTrackItemCount?: number
    trackItemDurationBounds?: TimelineItemDurationBounds
    trackLocked: boolean
    trackHidden: boolean
  }

  /**
   * Sparse tracks retain one interactive root per mounted clip. Dense tracks
   * compress compact clips into bounded DOM overview buckets, promoting native
   * TimelineItem roots for selected and detailed clips.
   */
  let {
    trackId,
    trackItems,
    totalTrackItemCount,
    trackItemDurationBounds,
    trackLocked,
    trackHidden,
  }: TimelineTrackItemsProps = $props()

  const fps = select(useTimelineSettingsStore, (state) => state.fps)
  // A derived id: the hook re-subscribes (and republishes a fresh range) when
  // its getter's dependencies change, so it must see only id changes, as React's
  // subscribe callback keyed on `trackId` did.
  const stableTrackId = $derived(trackId)
  const detailRangeSource = useVisibleItemDetailRange(() => stableTrackId)
  const detailRange = $derived(detailRangeSource.current)
  const usesDensityOverview = $derived(
    (totalTrackItemCount ?? trackItems.length) >= DENSE_TIMELINE_OVERVIEW_ITEM_THRESHOLD,
  )
  const visibleItemRangeIndex = $derived(getTimelineTrackItemRangeIndex(trackItems))
  const durationBounds = $derived(trackItemDurationBounds ?? visibleItemRangeIndex)
  // Full-track duration bounds are stable while staged culling changes the
  // visible array. The selector publishes only cohort boundaries/coarse mixed
  // buckets instead of sorting every newly mounted cohort.
  const compactCohortSignal = $derived.by(() => {
    const bounds = durationBounds
    const currentFps = fps.current
    return select(useZoomStore, (state) => {
      const pixelsPerSecond = getDemotionAwarePixelsPerSecond(
        state.contentPixelsPerSecond,
        state.pixelsPerSecond,
        state.isZoomInteracting,
      )
      return getTimelineCompactCohortSignal(
        bounds,
        currentFps,
        pixelsPerSecond,
        state.isZoomInteracting,
      )
    })
  })
  const selectedItemIds = $derived.by(() => {
    const dense = usesDensityOverview
    return select(useSelectionStore, (state) =>
      dense ? state.selectedItemIds : EMPTY_SELECTED_ITEM_IDS,
    )
  })
  // FreeCut samples the zoom store when the track re-renders, not on every
  // live zoom tick: re-sample only when one of the render inputs changes.
  const zoomState = $derived.by(() => {
    void [
      compactCohortSignal.current,
      selectedItemIds.current,
      detailRange,
      fps.current,
      trackItems,
      durationBounds,
      usesDensityOverview,
    ]
    return useZoomStore.getState()
  })
  const renderPixelsPerSecond = $derived(
    getDemotionAwarePixelsPerSecond(
      zoomState.contentPixelsPerSecond,
      zoomState.pixelsPerSecond,
      zoomState.isZoomInteracting,
    ),
  )
  const allItemsCompact = $derived(compactCohortSignal.current.endsWith(':all'))
  const noItemsCompact = $derived(compactCohortSignal.current.endsWith(':none'))
  const eligibleDetailIds = $derived.by(() => {
    if (allItemsCompact) return EMPTY_SELECTED_ITEM_IDS
    const range = detailRange
    const detailCenter = (range.start + range.end) / 2
    const candidates = getTimelineItemsForFrameRange(trackItems, range)
    return candidates
      .filter(
        (item) =>
          !isTimelineItemCompactAtZoom(item.durationInFrames, fps.current, renderPixelsPerSecond),
      )
      .sort((left, right) => {
        const leftCenter = left.from + left.durationInFrames / 2
        const rightCenter = right.from + right.durationInFrames / 2
        return Math.abs(leftCenter - detailCenter) - Math.abs(rightCenter - detailCenter)
      })
      .map((item) => item.id)
  })
  const immediateSelectedIds = $derived(
    new Set(
      selectedItemIds.current
        .filter((id) => visibleItemRangeIndex.itemById.has(id))
        .slice(0, MAX_IMMEDIATE_SELECTED_OVERVIEW_ITEMS),
    ),
  )
  const promotedDetailIds = useStagedTimelineDetailIds(
    () => eligibleDetailIds,
    () => immediateSelectedIds,
    () => zoomState.isZoomInteracting,
  )
  const renderedOverviewItemIds = $derived.by(() => {
    const ids = new Set(promotedDetailIds.current)
    for (const id of immediateSelectedIds) ids.add(id)
    return ids
  })
  const selectedItemIdSet = $derived(new Set(selectedItemIds.current))
  // The each block iterates the store's own item objects, not per-render
  // wrappers as React's map does: a new wrapper is a write to every row's
  // source, and Svelte checks each write against the whole subtree's derived
  // graph, which made scrolling a dense track spend seconds per frame.
  const densityItems = $derived.by(() => {
    if (!usesDensityOverview) return EMPTY_ITEMS
    const items: TimelineItemType[] = []
    for (const id of renderedOverviewItemIds) {
      const item = visibleItemRangeIndex.itemById.get(id)
      if (item) items.push(item)
    }
    return items
  })
  const renderedItems = $derived(usesDensityOverview ? densityItems : trackItems)
</script>

<TimelineJoinIndicatorsZoomGate>
  {#if usesDensityOverview}
    <TimelineDensityOverview
      items={trackItems}
      selectedItemIds={selectedItemIdSet}
      {trackLocked}
      {trackHidden}
    />
  {/if}
  {#each renderedItems as item (item.id)}
    {@const isDetailEligible = isItemDetailEligible(item, detailRange)}
    <TimelineItem
      {item}
      timelineDuration={30}
      {trackLocked}
      {trackHidden}
      {isDetailEligible}
      isCompactWidth={!isDetailEligible ||
        isItemCompactByWidth(
          item,
          allItemsCompact,
          noItemsCompact,
          fps.current,
          renderPixelsPerSecond,
        ) ||
        !promotedDetailIds.current.has(item.id)}
    />
  {/each}
</TimelineJoinIndicatorsZoomGate>
