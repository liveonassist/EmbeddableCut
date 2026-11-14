<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useSlipEditPreviewStore } from '@/features/preview/deps/timeline-edit-preview'
  import { EditFourUpPanels } from './edit-4up-panels'
  import { getSourceFrameInfo } from './edit-overlay-utils'
  import { resolveEditOverlayVisualItem } from './edit-overlay-visual-item'

  interface SlipEditOverlayProps {
    fps: number
  }

  let { fps }: SlipEditOverlayProps = $props()
  const itemId = select(useSlipEditPreviewStore, (s) => s.itemId)
  const slipDelta = select(useSlipEditPreviewStore, (s) => s.slipDelta)
  const items = select(useItemsStore, (s) => s.items)

  const itemsMap = $derived.by(() => new Map(items.current.map((i) => [i.id, i])))
  const operationItem = $derived(itemId.current ? (itemsMap.get(itemId.current) ?? null) : null)

  const slippedItem = $derived(resolveEditOverlayVisualItem(items.current, operationItem!))

  const outLocalFrame = $derived(Math.max(0, slippedItem.durationInFrames - 1))

  // Baseline (pre-drag): slipped clip's currently committed IN/OUT.
  const currentInInfo = $derived(getSourceFrameInfo(slippedItem, 0, fps))
  const currentOutInfo = $derived(getSourceFrameInfo(slippedItem, outLocalFrame, fps))

  // Create a virtual item with sourceStart/sourceEnd shifted by slipDelta
  // so getSourceFrameInfo seeks to the correct slipped source time.
  const virtualItem = $derived({
    ...slippedItem,
    sourceStart: (slippedItem.sourceStart ?? 0) + slipDelta.current,
    sourceEnd: slippedItem.sourceEnd !== undefined ? slippedItem.sourceEnd + slipDelta.current : undefined,
  })

  // Center-left: new IN frame (local frame 0)
  const inInfo = $derived(getSourceFrameInfo(virtualItem, 0, fps))

  // Center-right: new OUT frame (local frame durationInFrames - 1)
  const outInfo = $derived(getSourceFrameInfo(virtualItem, outLocalFrame, fps))
</script>

{#if operationItem}
  <EditFourUpPanels
    leftPanel={{
      item: virtualItem,
      sourceTime: inInfo.sourceTime,
      sourceFrame: inInfo.sourceFrame,
      timecode: inInfo.timecode,
      label: 'IN',
    }}
    rightPanel={{
      item: virtualItem,
      sourceTime: outInfo.sourceTime,
      sourceFrame: outInfo.sourceFrame,
      timecode: outInfo.timecode,
      label: 'OUT',
    }}
    topLeftCorner={{
      item: slippedItem,
      sourceTime: currentInInfo.sourceTime,
      sourceFrame: currentInInfo.sourceFrame,
      timecode: currentInInfo.timecode,
      label: '',
    }}
    topRightCorner={{
      item: slippedItem,
      sourceTime: currentOutInfo.sourceTime,
      sourceFrame: currentOutInfo.sourceFrame,
      timecode: currentOutInfo.timecode,
      label: '',
    }}
   />
{/if}
