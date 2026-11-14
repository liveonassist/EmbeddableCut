<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useSlideEditPreviewStore } from '@/features/preview/deps/timeline-edit-preview'
  import { EditFourUpPanels } from './edit-4up-panels'
  import { getSourceFrameInfo } from './edit-overlay-utils'
  import { resolveEditOverlayVisualItem } from './edit-overlay-visual-item'

  interface SlideEditOverlayProps {
    fps: number
  }

  let { fps }: SlideEditOverlayProps = $props()
  const itemId = select(useSlideEditPreviewStore, (s) => s.itemId)
  const leftNeighborId = select(useSlideEditPreviewStore, (s) => s.leftNeighborId)
  const rightNeighborId = select(useSlideEditPreviewStore, (s) => s.rightNeighborId)
  const slideDelta = select(useSlideEditPreviewStore, (s) => s.slideDelta)
  const items = select(useItemsStore, (s) => s.items)

  const itemsMap = $derived.by(() => new Map(items.current.map((item) => [item.id, item])))

  const slidItem = $derived(itemsMap.get(itemId.current!))

  const leftOperationNeighbor = $derived(leftNeighborId.current ? (itemsMap.get(leftNeighborId.current) ?? null) : null)
  const rightOperationNeighbor = $derived(rightNeighborId.current ? (itemsMap.get(rightNeighborId.current) ?? null) : null)
  const leftNeighbor = $derived(leftOperationNeighbor
    ? resolveEditOverlayVisualItem(items.current, leftOperationNeighbor)
    : null)
  const rightNeighbor = $derived(rightOperationNeighbor
    ? resolveEditOverlayVisualItem(items.current, rightOperationNeighbor)
    : null)

  // --- Corner thumbnails: current baseline before drag delta ---
  const topLeftCorner = $derived(leftNeighbor
    ? (() => {
        const outLocalFrame = Math.max(0, leftNeighbor.durationInFrames - 1)
        const outInfo = getSourceFrameInfo(leftNeighbor, outLocalFrame, fps)
        return {
          item: leftNeighbor,
          sourceTime: outInfo.sourceTime,
          sourceFrame: outInfo.sourceFrame,
          timecode: outInfo.timecode,
          label: '',
        }
      })()
    : undefined)

  const topRightCorner = $derived(rightNeighbor
    ? (() => {
        const inInfo = getSourceFrameInfo(rightNeighbor, 0, fps)
        return {
          item: rightNeighbor,
          sourceTime: inInfo.sourceTime,
          sourceFrame: inInfo.sourceFrame,
          timecode: inInfo.timecode,
          label: '',
        }
      })()
    : undefined)

  // --- Center-left (OUT): left neighbor's new last frame ---
  // The left neighbor extends or shrinks by slideDelta.
  // New last frame = original duration + slideDelta - 1
  const leftPanel = $derived(leftNeighbor
    ? (() => {
        const outLocalFrame = Math.max(0, leftNeighbor.durationInFrames + slideDelta.current - 1)
        const outInfo = getSourceFrameInfo(leftNeighbor, outLocalFrame, fps)
        return {
          item: leftNeighbor,
          sourceTime: outInfo.sourceTime,
          sourceFrame: outInfo.sourceFrame,
          timecode: outInfo.timecode,
          label: 'OUT',
        }
      })()
    : {
        item: null as null,
        timecode: '--:--:--:--',
        label: 'OUT',
        placeholderText: 'GAP',
      })

  // --- Center-right (IN): right neighbor's new first frame ---
  // The right neighbor's start is trimmed by slideDelta. When positive,
  // the start shrinks (later source content). When negative, the start
  // extends (earlier source content). Local frame = slideDelta in both cases;
  // getSourceFrameInfo + VideoFrame handle sub-zero source times via clamping.
  const rightPanel = $derived(rightNeighbor
    ? (() => {
        const inLocalFrame = slideDelta.current
        const inInfo = getSourceFrameInfo(rightNeighbor, inLocalFrame, fps)
        return {
          item: rightNeighbor,
          sourceTime: inInfo.sourceTime,
          sourceFrame: inInfo.sourceFrame,
          timecode: inInfo.timecode,
          label: 'IN',
        }
      })()
    : {
        item: null as null,
        timecode: '--:--:--:--',
        label: 'IN',
        placeholderText: 'GAP',
      })
</script>

{#if itemId.current && slidItem}
  <EditFourUpPanels
    leftPanel={leftPanel}
    rightPanel={rightPanel}
    topLeftCorner={topLeftCorner}
    topRightCorner={topRightCorner}
   />
{/if}
