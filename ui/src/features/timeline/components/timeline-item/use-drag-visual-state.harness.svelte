<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { VideoItem } from '@/types/timeline'
  import { DRAG_OPACITY } from '@/features/timeline/constants'
  import { useDragVisualState } from './use-drag-visual-state.svelte'

  let {
    item,
    isDragging = false,
    initialOpacity = '0.3',
  }: { item: VideoItem; isDragging?: boolean; initialOpacity?: string } = $props()

  let transform = $state<HTMLDivElement | null>(null)
  let ghost = $state<HTMLDivElement | null>(null)

  const dragVisualState = useDragVisualState(() => ({
    item,
    gestureMode: 'none',
    isDragging,
    transform,
    ghost,
  }))
</script>

<div
  data-testid="body"
  bind:this={transform}
  style:opacity={dragVisualState.shouldDimForDrag ? String(DRAG_OPACITY) : initialOpacity}
></div>
{#if dragVisualState.isAltDrag}
  <div data-testid="ghost" bind:this={ghost}></div>
{/if}
<div data-testid="join-state">
  {String(dragVisualState.dragAffectsJoin.left)}:{String(dragVisualState.dragAffectsJoin.right)}
</div>
