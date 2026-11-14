<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { IO_HANDLE_COLOR } from '../io-range-geometry.svelte'
  import { blockMouseDown, type PositionDataset } from './shared'

  interface HandleProps {
    side: 'in' | 'out'
    left: string
    gripWidth: number
    laneHeight: number
    hitWidth: number
    hitHeightExtra: number
    zIndex: number
    onDragStart?: (e: PointerEvent) => void
    title?: string
    testId?: string
    dataset?: PositionDataset
  }

  let {
    side,
    left,
    gripWidth,
    laneHeight,
    hitWidth,
    hitHeightExtra,
    zIndex,
    onDragStart,
    title,
    testId,
    dataset,
  }: HandleProps = $props()
</script>

<div
  class="absolute top-0"
  {title}
  {...dataset}
  style:left
  style:width="0px"
  style:height="100%"
  style:pointer-events="none"
  style:z-index={zIndex}
>
  <!-- Side grip — brighter blue pill, rounded outer corners, top sheen. Shrinks
       to half the range so the two grips meet rather than overlap when narrow. -->
  <div
    aria-hidden="true"
    data-testid={testId}
    data-motion-static-x
    class="absolute pointer-events-none"
    style:top="0px"
    style:left="{side === 'in' ? 0 : -gripWidth}px"
    style:width="{gripWidth}px"
    style:height="{laneHeight}px"
    style:border-radius={side === 'in' ? '5px 1px 1px 5px' : '1px 5px 5px 1px'}
    style:background="linear-gradient(to bottom, color-mix(in oklch, {IO_HANDLE_COLOR} 92%, white), color-mix(in oklch, {IO_HANDLE_COLOR} 78%, black))"
    style:box-shadow="inset 0 1px 0 color-mix(in oklch, white 35%, transparent), 0 0 2px color-mix(in oklch, {IO_HANDLE_COLOR} 45%, transparent)"
  ></div>

  <!-- Wide invisible hit area, centered on the point, for easy grabbing. -->
  {#if onDragStart}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      data-motion-static-x
      class="absolute pointer-events-auto"
      style:top="0px"
      style:left="{-hitWidth / 2}px"
      style:width="{hitWidth}px"
      style:height="{laneHeight + hitHeightExtra}px"
      style:cursor="col-resize"
      style:z-index="23"
      onpointerdown={onDragStart}
      onmousedown={blockMouseDown}
    ></div>
  {/if}
</div>
