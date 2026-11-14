<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { TimelineItem } from '@/types/timeline'


  interface RippleEditOverlayProps {
    fps: number
  }

  /**
   * Find the closest downstream item to the trimmed item's end.
   * Used for end-handle trims to show the IN panel.
   */
  function pickNextItem(
    trimmedItem: TimelineItem,
    downstreamItems: TimelineItem[],
  ): TimelineItem | null {
    if (downstreamItems.length === 0) return null

    const trimEnd = trimmedItem.from + trimmedItem.durationInFrames
    let best: TimelineItem | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const candidate of downstreamItems) {
      const distance = Math.abs(candidate.from - trimEnd)
      if (
        distance < bestDistance ||
        (distance === bestDistance && best && candidate.from < best.from)
      ) {
        best = candidate
        bestDistance = distance
      }
    }

    return best
  }

  /**
   * Find the clip on the same track whose end is closest to (and before)
   * the trimmed item's start. Used for start-handle trims to show the OUT panel.
   */
  function pickPrevItem(
    trimmedItem: TimelineItem,
    sameTrackItems: TimelineItem[],
  ): TimelineItem | null {
    let best: TimelineItem | null = null
    let bestEnd = -Infinity

    for (const candidate of sameTrackItems) {
      if (candidate.id === trimmedItem.id) continue
      const candidateEnd = candidate.from + candidate.durationInFrames
      if (candidateEnd <= trimmedItem.from && candidateEnd > bestEnd) {
        best = candidate
        bestEnd = candidateEnd
      }
    }

    return best
  }
</script>

<!--
  @component
  2-up frame comparison shown during ripple edits.

  Panels are edit-point-centric (matching commercial NLE conventions):
  - OUT (left): last frame before the edit point
  - IN (right): first frame after the edit point

  Which clip goes in which panel depends on the handle being trimmed:
  - End handle:   OUT = trimmed clip's new last frame, IN = next clip's first frame
  - Start handle: OUT = previous clip's last frame,    IN = trimmed clip's new first frame
-->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useRippleEditPreviewStore } from '@/features/preview/deps/timeline-edit-preview'
  import { EditTwoUpPanels } from './edit-2up-panels'
  import { getSourceFrameInfo } from './edit-overlay-utils'
  import { resolveEditOverlayVisualItem } from './edit-overlay-visual-item'
  import type { EditTwoUpPanelData } from './edit-2up-panels'
  let { fps }: RippleEditOverlayProps = $props()
  const trimmedItemId = select(useRippleEditPreviewStore, (s) => s.trimmedItemId)
  const handle = select(useRippleEditPreviewStore, (s) => s.handle)
  const trackId = select(useRippleEditPreviewStore, (s) => s.trackId)
  const downstreamItemIds = select(useRippleEditPreviewStore, (s) => s.downstreamItemIds)
  const delta = select(useRippleEditPreviewStore, (s) => s.delta)
  const trimDelta = select(useRippleEditPreviewStore, (s) => s.trimDelta)
  const items = select(useItemsStore, (s) => s.items)
  const itemsMap = $derived(new Map(items.current.map((item) => [item.id, item])))
  const trimmedItem = $derived(
    trimmedItemId.current ? (itemsMap.get(trimmedItemId.current) ?? null) : null,
  )

  const downstreamItems = $derived(
    items.current.filter((item) => downstreamItemIds.current.has(item.id)),
  )

  const nextItem = $derived(
    trimmedItem && handle.current === 'end' ? pickNextItem(trimmedItem, downstreamItems) : null,
  )

  const sameTrackItems = $derived(
    trackId.current ? items.current.filter((item) => item.trackId === trackId.current) : [],
  )

  const prevItem = $derived(
    trimmedItem && handle.current === 'start' ? pickPrevItem(trimmedItem, sameTrackItems) : null,
  )

  const panels = $derived.by((): {
    leftPanel: EditTwoUpPanelData
    rightPanel: EditTwoUpPanelData
  } | null => {
    if (!trimmedItem || !handle.current) return null

    const trimmedVisualItem = resolveEditOverlayVisualItem(items.current, trimmedItem)

    // --- End-handle trim ---
    if (handle.current === 'end') {
      const editPointFrame = trimmedItem.from + trimmedItem.durationInFrames + delta.current
      const outLocalFrame = Math.max(0, editPointFrame - trimmedItem.from - 1)
      const outInfo = getSourceFrameInfo(trimmedVisualItem, outLocalFrame, fps)

      // Check if the next clip is adjacent to the new edit point.
      // If there's a gap between them, IN should show GAP, not the distant clip.
      const newEnd = editPointFrame
      const nextStart = nextItem ? nextItem.from + delta.current : Infinity
      const hasGapAfterEdit = !nextItem || nextStart > newEnd

      if (hasGapAfterEdit) {
        return {
          leftPanel: {
            item: trimmedVisualItem,
            sourceTime: outInfo.sourceTime,
            sourceFrame: outInfo.sourceFrame,
            timecode: outInfo.timecode,
            label: 'OUT',
          },
          rightPanel: {
            item: null,
            timecode: '--:--:--:--',
            label: 'IN',
            placeholderText: 'GAP',
          },
        }
      }

      // B is not edited during a ripple trim of A's end — its content is constant
      const nextVisualItem = resolveEditOverlayVisualItem(items.current, nextItem)
      const inInfo = getSourceFrameInfo(nextVisualItem, 0, fps)

      return {
        leftPanel: {
          item: trimmedVisualItem,
          sourceTime: outInfo.sourceTime,
          sourceFrame: outInfo.sourceFrame,
          timecode: outInfo.timecode,
          label: 'OUT',
        },
        rightPanel: {
          item: nextVisualItem,
          sourceTime: inInfo.sourceTime,
          sourceFrame: inInfo.sourceFrame,
          timecode: inInfo.timecode,
          label: 'IN',
        },
      }
    }

    // --- Start-handle trim ---
    // IN = trimmed clip at its new first visible frame.
    // trimDelta frames into the original clip's range (negative when extending start).
    const inInfo = getSourceFrameInfo(trimmedVisualItem, trimDelta.current, fps)

    // Check if the previous clip is adjacent to A's start.
    // In the anchor-from ripple model, A's position doesn't change — only its
    // sourceStart/duration do — so the gap between prev and A is constant.
    const prevEnd = prevItem ? prevItem.from + prevItem.durationInFrames : -Infinity
    const hasGapBeforeEdit = !prevItem || prevEnd < trimmedItem.from

    if (hasGapBeforeEdit) {
      return {
        leftPanel: {
          item: null,
          timecode: '--:--:--:--',
          label: 'OUT',
          placeholderText: 'GAP',
        },
        rightPanel: {
          item: trimmedVisualItem,
          sourceTime: inInfo.sourceTime,
          sourceFrame: inInfo.sourceFrame,
          timecode: inInfo.timecode,
          label: 'IN',
        },
      }
    }

    // OUT = previous clip's last frame (not edited, so its content is constant)
    const outLocalFrame = Math.max(0, prevItem.durationInFrames - 1)
    const prevVisualItem = resolveEditOverlayVisualItem(items.current, prevItem)
    const outInfo = getSourceFrameInfo(prevVisualItem, outLocalFrame, fps)

    return {
      leftPanel: {
        item: prevVisualItem,
        sourceTime: outInfo.sourceTime,
        sourceFrame: outInfo.sourceFrame,
        timecode: outInfo.timecode,
        label: 'OUT',
      },
      rightPanel: {
        item: trimmedVisualItem,
        sourceTime: inInfo.sourceTime,
        sourceFrame: inInfo.sourceFrame,
        timecode: inInfo.timecode,
        label: 'IN',
      },
    }
  })
</script>

{#if panels}
  <EditTwoUpPanels leftPanel={panels.leftPanel} rightPanel={panels.rightPanel} />
{/if}
