<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'

  interface TransitionDropZonesProps {
    itemType: TimelineItemType['type']
    trackLocked: boolean
    isCompactShell: boolean
    isTransitionDragActive: boolean
    hitWidth: number
    onCutDragOver: (edge: 'left' | 'right') => (e: DragEvent) => void
    onCutDragLeave: () => void
    onCutDrop: (edge: 'left' | 'right') => (e: DragEvent) => void
  }

  /** Cut-drop zones at both clip edges while a transition is being dragged. */
  let {
    itemType,
    trackLocked,
    isCompactShell,
    isTransitionDragActive,
    hitWidth,
    onCutDragOver,
    onCutDragLeave,
    onCutDrop,
  }: TransitionDropZonesProps = $props()

  const hidden = $derived(
    isCompactShell ||
      !isTransitionDragActive ||
      trackLocked ||
      (itemType !== 'video' && itemType !== 'image' && itemType !== 'composition'),
  )
  const halfHitWidth = $derived(hitWidth / 2)
</script>

{#if !hidden}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-y-0 z-40"
    style:left="{-halfHitWidth}px"
    style:width="{hitWidth}px"
    ondragover={onCutDragOver('left')}
    ondragleave={onCutDragLeave}
    ondrop={onCutDrop('left')}
  ></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-y-0 z-40"
    style:left="calc(100% - {halfHitWidth}px)"
    style:width="{hitWidth}px"
    ondragover={onCutDragOver('right')}
    ondragleave={onCutDragLeave}
    ondrop={onCutDrop('right')}
  ></div>
{/if}
