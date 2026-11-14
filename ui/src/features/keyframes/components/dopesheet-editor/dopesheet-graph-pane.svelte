<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { EmbeddedValueGraphEditor } from '../value-graph-editor'
  import { PROPERTY_COLUMN_WIDTH, RULER_HEIGHT } from './dopesheet-constants'
  import DopesheetEmptyState from './dopesheet-empty-state.svelte'
  import type { DopesheetGraphPaneProps } from './dopesheet-graph-pane'

  let {
    hasRows,
    emptyStateMessage,
    showEmptyGuidance,
    proceduralHint,
    propertyColumnElements,
    propertyColumnWidth = PROPERTY_COLUMN_WIDTH,
    graphPaneRef,
    disabled,
    graphDisplayPropertyLocked,
    focusGraphPane,
    handleGraphPaneKeyDown,
    graphPaneSize,
    graphVisiblePropertiesSize,
    viewport,
    updateViewport,
    itemId,
    keyframesByProperty,
    graphDisplayProperty,
    graphVisibleProperties,
    selectedKeyframeIds,
    currentFrame,
    itemFrom,
    totalFrames,
    fps,
    onKeyframeMove,
    timingStripPreviewFrames,
    constrainGraphFrameDelta,
    onBezierHandleMove,
    onSelectionChange,
    onPropertyChange,
    onScrub,
    onScrubStart,
    onScrubEnd,
    onDragStart,
    onDragEnd,
    onAddKeyframe,
    onRemoveKeyframes,
    onNavigateToKeyframe,
    transitionBlockedRanges,
    proceduralPreview,
    snapEnabled,
    graphHandleVisibility,
    graphRulerUnit,
    autoZoomGraphHeight,
    graphVerticalZoomValue,
    hidePlayhead,
    subtractRulerHeight = true,
    customGraphContent,
  }: DopesheetGraphPaneProps = $props()
</script>

{#if !hasRows}
  <DopesheetEmptyState
    showGuidance={showEmptyGuidance}
    fallbackMessage={emptyStateMessage}
    {proceduralHint}
  />
{:else}
  <div
    class="flex min-h-0"
    style:height={subtractRulerHeight ? `calc(100% - ${RULER_HEIGHT}px)` : '100%'}
  >
    {#if propertyColumnWidth > 0}
      <div class="flex-shrink-0 overflow-auto" style:width="{propertyColumnWidth}px">
        {@render propertyColumnElements?.()}
      </div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
    <div
      bind:this={graphPaneRef.current}
      data-testid="dopesheet-graph-pane"
      tabindex={disabled || graphDisplayPropertyLocked ? undefined : -1}
      class="min-w-0 flex-1 border-l border-border/60 outline-none"
      onmouseenter={focusGraphPane}
      onpointerdowncapture={focusGraphPane}
      onkeydown={handleGraphPaneKeyDown}
    >
      {#if customGraphContent}
        {@render customGraphContent()}
      {:else if graphPaneSize.width > 0 && graphPaneSize.height > 0 && graphVisiblePropertiesSize > 0}
        <EmbeddedValueGraphEditor
          frameViewport={viewport}
          onFrameViewportChange={updateViewport}
          {itemId}
          {keyframesByProperty}
          selectedProperty={graphDisplayProperty}
          overlayProperties={graphVisibleProperties}
          {selectedKeyframeIds}
          {currentFrame}
          {itemFrom}
          {totalFrames}
          {fps}
          width={graphPaneSize.width}
          height={graphPaneSize.height}
          {onKeyframeMove}
          previewFramesById={timingStripPreviewFrames}
          constrainFrameDelta={constrainGraphFrameDelta}
          {onBezierHandleMove}
          {onSelectionChange}
          {onPropertyChange}
          {onScrub}
          {onScrubStart}
          {onScrubEnd}
          {onDragStart}
          {onDragEnd}
          {onAddKeyframe}
          {onRemoveKeyframes}
          {onNavigateToKeyframe}
          {transitionBlockedRanges}
          {proceduralPreview}
          {snapEnabled}
          handleVisibility={graphHandleVisibility}
          rulerUnit={graphRulerUnit}
          {autoZoomGraphHeight}
          externalValueZoomLevel={graphVerticalZoomValue}
          disabled={disabled || graphDisplayPropertyLocked}
          {hidePlayhead}
        />
      {/if}
    </div>
  </div>
{/if}
