<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ProjectMarker } from '@/types/timeline'

  interface MarkerIndicatorProps {
    marker: ProjectMarker
    markerId: string
    /** The marker's label, or its "Marker N" fallback. */
    name: string
    leftPosition: number
    isDragging: boolean
    isSelected: boolean
    onMouseDown: (e: MouseEvent, markerId: string) => void
  }

  let {
    marker,
    markerId,
    name,
    leftPosition,
    isDragging,
    isSelected,
    onMouseDown,
  }: MarkerIndicatorProps = $props()

  const handleMouseDown = (e: MouseEvent) => {
    onMouseDown(e, markerId)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="absolute pointer-events-auto"
  style:left="{leftPosition}px"
  style:top="-2px"
  style:transform="translateX(-50%)"
  style:cursor={isDragging ? 'grabbing' : 'grab'}
  style:z-index={isSelected ? 20 : 15}
  onmousedown={handleMouseDown}
  data-tooltip={name}
  data-tooltip-side="bottom"
>
  <!-- Invisible larger hit area -->
  <div
    class="absolute"
    style:top="-4px"
    style:left="50%"
    style:width="20px"
    style:height="20px"
    style:transform="translateX(-50%)"
    style:background-color="transparent"
  ></div>
  <!-- Selection outline triangle (larger, behind) -->
  {#if isSelected}
    <div
      class="absolute"
      style:top="-4px"
      style:left="50%"
      style:transform="translateX(-50%)"
      style:width="0px"
      style:height="0px"
      style:border-left="12px solid transparent"
      style:border-right="12px solid transparent"
      style:border-top="18px solid white"
    ></div>
  {/if}
  <!-- Visible triangle (CSS triangle pointing down) -->
  <div
    style:width="0px"
    style:height="0px"
    style:border-left="8px solid transparent"
    style:border-right="8px solid transparent"
    style:border-top="12px solid {marker.color}"
    style:filter="drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))"
  ></div>
</div>
