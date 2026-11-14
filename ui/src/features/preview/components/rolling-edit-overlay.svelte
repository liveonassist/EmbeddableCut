<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useRollingEditPreviewStore } from '@/features/preview/deps/timeline-edit-preview'
  import { EditTwoUpPanels } from './edit-2up-panels'
  import { getRollingEditPanelFrames } from './rolling-edit-overlay-utils'
  import { resolveEditOverlayVisualItem } from './edit-overlay-visual-item'

  interface RollingEditOverlayProps {
    fps: number
  }

  let { fps }: RollingEditOverlayProps = $props()
  const trimmedItemId = select(useRollingEditPreviewStore, (s) => s.trimmedItemId)
  const neighborItemId = select(useRollingEditPreviewStore, (s) => s.neighborItemId)
  const handle = select(useRollingEditPreviewStore, (s) => s.handle)
  const neighborDelta = select(useRollingEditPreviewStore, (s) => s.neighborDelta)
  const items = select(useItemsStore, (s) => s.items)
  const itemsMap = $derived.by(() => new Map(items.current.map((item) => [item.id, item])))

  const trimmedOperationItem = $derived(itemsMap.get(trimmedItemId.current!))
  const neighborOperationItem = $derived(itemsMap.get(neighborItemId.current!))

  const trimmedItem = $derived(resolveEditOverlayVisualItem(items.current, trimmedOperationItem!))
  const neighborItem = $derived(resolveEditOverlayVisualItem(items.current, neighborOperationItem!))

  const { leftItem, rightItem, outInfo, inInfo } = $derived(getRollingEditPanelFrames({
    trimmedItem,
    neighborItem,
    handle: handle.current!,
    neighborDelta: neighborDelta.current,
    fps,
  }))
</script>

{#if trimmedItemId.current && neighborItemId.current && handle.current && trimmedOperationItem && neighborOperationItem}
  <EditTwoUpPanels
    leftPanel={{
      item: leftItem,
      sourceTime: outInfo.sourceTime,
      sourceFrame: outInfo.sourceFrame,
      timecode: outInfo.timecode,
      label: 'OUT',
    }}
    rightPanel={{
      item: rightItem,
      sourceTime: inInfo.sourceTime,
      sourceFrame: inInfo.sourceFrame,
      timecode: inInfo.timecode,
      label: 'IN',
    }}
   />
{/if}
