<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Lane layout: the sheet fills the editor and shares the main timeline's grid,
   * with the graph pane replacing it when that mode is asked for.
   */
  import { cn } from '@/shared/ui/cn'
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'
  import type { DopesheetLanesPresentationProps } from './types'

  let {
    pickWhipRootRef,
    class: className,
    height,
    disabled,
    handleWheel,
    handleGraphPaneKeyDown,
    timelineRef,
    timelineGridDivisions,
    timelineCellBorderWidth,
    columnWidth,
    showSheetPane,
    showGraphPane,
    graphPaneElement,
    sheetBodyElement,
    skimPlayheadOverlayElement,
    playheadOverlayElement,
    expressionDockElement,
    expressionReferenceDrag,
  }: DopesheetLanesPresentationProps = $props()
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={pickWhipRootRef.current}
  data-testid="dopesheet-editor-root"
  data-motion-shared-grid-divisions={timelineGridDivisions}
  data-motion-shared-grid-border-width={timelineGridDivisions ? timelineCellBorderWidth : undefined}
  class={cn(
    'relative flex flex-col overflow-hidden',
    disabled && 'opacity-60 pointer-events-none',
    className,
  )}
  style:height="{height}px"
  style:width="100%"
  onkeydown={handleGraphPaneKeyDown}
>
  <div class="relative min-h-0 flex-1 overflow-hidden" onwheel={handleWheel}>
    <div
      bind:this={timelineRef.current}
      class="pointer-events-none absolute inset-y-0 right-0"
      style:left="{columnWidth}px"
    ></div>
    {#if showGraphPane}
      {@render graphPaneElement?.()}
    {:else}
      {@render sheetBodyElement?.()}
    {/if}
    {#if showSheetPane}
      {@render skimPlayheadOverlayElement?.()}
      {@render playheadOverlayElement?.()}
    {/if}
  </div>
  {@render expressionDockElement?.()}
  {#if expressionReferenceDrag}
    <PickWhipOverlay
      presentation={expressionReferenceDrag.presentation}
      testId="expression-reference-pick-whip"
    />
  {/if}
</div>
