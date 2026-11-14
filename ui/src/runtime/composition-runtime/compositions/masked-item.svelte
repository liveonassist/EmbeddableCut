<!-- SPDX-License-Identifier: MIT -->
<!-- Item wrapper that resolves shape masks per-frame inside a <Sequence> -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import Item from '../components/item.svelte'
  import { getMasksForTrackOrder } from '../utils/mask-info'
  import { useActiveMasks } from './active-masks-context'

  let {
    item,
    muted,
    visible = true,
    itemTrackOrder,
    compositionRenderMode = 'full',
  }: {
    item: TimelineItem
    muted: boolean
    visible?: boolean
    itemTrackOrder: number
    compositionRenderMode?: 'full' | 'visual-only' | 'audio-only'
  } = $props()

  const masks = useActiveMasks()
</script>

<Item
  {item}
  {muted}
  {visible}
  masks={getMasksForTrackOrder(masks.current, itemTrackOrder)}
  {compositionRenderMode}
/>
