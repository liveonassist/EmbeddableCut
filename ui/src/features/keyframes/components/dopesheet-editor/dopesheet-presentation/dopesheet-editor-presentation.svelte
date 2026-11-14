<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Default workspace layout: toolbar, then the sheet / graph / split body with one
   * shared playhead, then the timing strip and the navigator. The toolbar, timing
   * strip and navigator are built by the editor so the shells only place them.
   */
  import { cn } from '@/shared/ui/cn'
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'
  import type { DopesheetEditorPresentationProps } from './types'

  let {
    pickWhipRootRef,
    class: className,
    height,
    width,
    disabled,
    t,
    visualizationMode,
    isSplitView,
    showSheetPane,
    showGraphPane,
    handleWheel,
    toolbarElement,
    rulerHeaderElement,
    sheetBodyElement,
    graphPaneElement,
    playheadOverlayElement,
    splitPlayheadOverlayElement,
    skimPlayheadOverlayElement,
    expressionDockElement,
    expressionReferenceDrag,
    timingStripElement,
    navigatorElement,
  }: DopesheetEditorPresentationProps = $props()
</script>

<div
  bind:this={pickWhipRootRef.current}
  data-testid="dopesheet-editor-root"
  class={cn('flex h-full flex-col gap-0.5 overflow-hidden', className)}
  style:height="{height}px"
  style:width="{width}px"
>
  {@render toolbarElement?.()}

  <div
    class={cn(
      'border border-border rounded-md flex-1 min-h-0 overflow-hidden relative',
      disabled && 'opacity-60 pointer-events-none',
      isSplitView && 'flex flex-col',
    )}
    onwheel={visualizationMode === 'dopesheet' ? handleWheel : undefined}
  >
    {#if isSplitView}
      {@render rulerHeaderElement?.()}
      <!-- Sheet on top, curve/graph below, with ONE shared playhead line
           (splitPlayheadOverlayElement) drawn over both panes so they
           stay identical in position and appearance. -->
      <div
        class="relative min-h-0 flex-1 overflow-hidden"
        role="region"
        aria-label={t('timeline.keyframeEditor.sheet')}
        onwheel={handleWheel}
      >
        {@render sheetBodyElement?.()}
      </div>
      <div
        class="min-h-0 flex-1 overflow-hidden border-t border-border/60"
        role="region"
        aria-label={t('timeline.keyframeEditor.graph')}
      >
        {@render graphPaneElement?.()}
      </div>
      {@render skimPlayheadOverlayElement?.()}
      {@render splitPlayheadOverlayElement?.()}
    {:else}
      <!-- Sheet mode only: the graph renders its own aligned playhead
           (GraphPlayhead) using the graph's coordinate space. -->
      {#if showSheetPane}
        {@render skimPlayheadOverlayElement?.()}
        {@render playheadOverlayElement?.()}
      {/if}
      {@render rulerHeaderElement?.()}
      {#if showGraphPane}
        {@render graphPaneElement?.()}
      {:else}
        {@render sheetBodyElement?.()}
      {/if}
    {/if}
  </div>
  {@render expressionDockElement?.()}
  {@render timingStripElement?.()}
  {@render navigatorElement?.()}
  {#if expressionReferenceDrag}
    <PickWhipOverlay
      presentation={expressionReferenceDrag.presentation}
      testId="expression-reference-pick-whip"
    />
  {/if}
</div>
