<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Dopesheet pane elements.
   * The editor derives the ruler, sheet, graph and header-frame state; these
   * snippets turn that state into the panes the presentation shells place, so
   * the exclusive (`dopesheet`/`graph`) modes and the `split` view compose the
   * same elements. React's builders returned elements; the editor renders these
   * snippets with its state object instead (`{@render rulerHeaderElement(paneState)}`).
   */
  import DopesheetGraphPane from './dopesheet-graph-pane.svelte'
  import DopesheetLiveRulerCanvas from './dopesheet-live-ruler-canvas.svelte'
  import DopesheetRulerHeader from './dopesheet-ruler-header.svelte'
  import DopesheetSheetBody from './dopesheet-sheet-body.svelte'
  import DopesheetPlayheadElements from './dopesheet-playhead-elements.svelte'
  import type { DopesheetPlayheadElementPart } from './dopesheet-playhead-elements'
  import {
    resolveDopesheetEmptyState,
    resolveGraphVisiblePropertyList,
    type DopesheetPaneElementsState,
  } from './dopesheet-pane-elements'

  export {
    rulerHeaderElement,
    sheetBodyElement,
    playheadOverlayElement,
    splitPlayheadOverlayElement,
    skimPlayheadOverlayElement,
    graphPaneElement,
    affectedFrameRangeOverlayElement,
  }
</script>

<!-- Hoisted so the graph pane and sheet body can be composed once and reused
     across the exclusive (`graph`/`dopesheet`) and the `split` placements. -->
{#snippet rulerHeaderElement(state: DopesheetPaneElementsState)}
  {@const scrollContainerRef = state.timelineScrollContainerRef}
  {#snippet liveRulerCanvas()}
    {#if scrollContainerRef}
      <DopesheetLiveRulerCanvas
        {scrollContainerRef}
        getLivePixelsPerSecond={state.getTimelineLivePixelsPerSecond}
        fallbackPixelsPerSecond={state.timelinePixelsPerSecond}
        fps={state.fps}
        rulerUnit={state.graphRulerUnit}
      />
    {/if}
  {/snippet}
  <DopesheetRulerHeader
    propertyGridStyle={state.propertyGridStyle}
    timelineRef={state.timelineRef}
    onRulerPointerDown={state.handleRulerPointerDown}
    onRulerPointerMove={state.handleRulerPointerMove}
    onRulerPointerUp={state.handleRulerPointerUp}
    onRulerPointerLeave={state.handleRulerPointerLeave}
    ticks={state.ticks}
    frameToX={state.frameToX}
    fps={state.fps}
    rulerUnit={state.graphRulerUnit}
    rulerLabelFrameOffset={state.timelineScrollContainerRef ? state.itemFrom : 0}
    liveRulerCanvas={state.hasLinkedTimelineAxis && scrollContainerRef ? liveRulerCanvas : undefined}
    reservedRightGutterWidth={state.reservedScrollbarGutterWidth}
    propertyFilter={state.filterKeyframedOnly ? 'keyframed' : 'all'}
    onPropertyFilterChange={state.presentation === 'classic' && state.propertyFilter === undefined
      ? (filter) => state.setShowKeyframedOnly(filter === 'keyframed')
      : undefined}
  />
{/snippet}

<!-- Standalone cells begin after their 1px border. A linked Edit axis pulls its
     cell surfaces over that border, so its playhead must begin at the shared
     main-timeline origin too. -->
{#snippet playheadElement(state: DopesheetPaneElementsState, part: DopesheetPlayheadElementPart)}
  <DopesheetPlayheadElements
    {part}
    showPlayhead={state.showPlayhead}
    skim={Boolean(state.onSkim)}
    left={state.columnWidth + (state.hasLinkedTimelineAxis ? 0 : 1)}
    playheadFrame={state.playheadFrame}
    currentFrame={state.currentFrame}
    itemFrom={state.itemFrom}
    totalFrames={state.totalFrames}
    clampToItemBounds={state.playheadClampToItemBounds}
    localScrubActiveRef={state.rulerScrubActiveRef}
    localScrubHandoffFrameRef={state.rulerScrubHandoffFrameRef}
    frameToX={state.frameToX}
    globalFrameToX={state.globalFrameToPixels}
    positionSyncTargetRef={state.timelineScrollContainerRef}
    maxLeft={state.effectiveTimelineWidth - 1}
    fps={state.fps}
    isRulerScrubbing={state.isRulerScrubbing}
  />
{/snippet}

{#snippet playheadOverlayElement(state: DopesheetPaneElementsState)}
  {@render playheadElement(state, 'sheet')}
{/snippet}

{#snippet splitPlayheadOverlayElement(state: DopesheetPaneElementsState)}
  {@render playheadElement(state, 'split')}
{/snippet}

{#snippet skimPlayheadOverlayElement(state: DopesheetPaneElementsState)}
  {@render playheadElement(state, 'skim')}
{/snippet}

{#snippet sheetBodyElement(state: DopesheetPaneElementsState)}
  {@const emptyState = resolveDopesheetEmptyState(state)}
  <DopesheetSheetBody
    scrollAreaRef={state.scrollAreaRef}
    hasRows={state.sheetRows.length > 0 ||
      (state.presentation === 'classic' && state.textMotionBands.length > 0)}
    emptyStateMessage={emptyState.emptyStateMessage}
    showEmptyGuidance={emptyState.showEmptyGuidance}
    proceduralHint={emptyState.proceduralHint}
    rowElements={state.rowElements}
    marqueeOverlayRef={state.marqueeOverlayRef}
    propertyColumnWidth={state.columnWidth}
    subtractRulerHeight={state.presentation !== 'lanes'}
    onTimelineBackgroundPointerDown={state.handleTimelineBackgroundPointerDown}
  />
{/snippet}

<!-- The graph pane, sharing the sheet's empty-state copy. -->
{#snippet graphPaneElement(state: DopesheetPaneElementsState)}
  {@const emptyState = resolveDopesheetEmptyState(state)}
  <DopesheetGraphPane
    hasRows={state.sheetRows.length > 0}
    emptyStateMessage={emptyState.emptyStateMessage}
    showEmptyGuidance={emptyState.showEmptyGuidance}
    proceduralHint={emptyState.proceduralHint}
    propertyColumnElements={state.propertyColumnElements}
    propertyColumnWidth={state.columnWidth}
    graphPaneRef={state.graphPaneRef}
    disabled={state.disabled}
    graphDisplayPropertyLocked={state.graphDisplayPropertyLocked}
    focusGraphPane={state.focusGraphPane}
    handleGraphPaneKeyDown={state.handleGraphPaneKeyDown}
    graphPaneSize={state.graphPaneSize}
    graphVisiblePropertiesSize={state.visibleGraphProperties.length}
    viewport={state.viewport}
    updateViewport={state.updateViewport}
    itemId={state.itemId}
    keyframesByProperty={state.keyframesByProperty}
    graphDisplayProperty={state.graphDisplayProperty}
    graphVisibleProperties={resolveGraphVisiblePropertyList(
      state.singleCurveMode,
      state.graphDisplayProperty,
      state.compoundSecondaryProperties,
      state.visibleGraphProperties,
    )}
    selectedKeyframeIds={state.selectedKeyframeIds}
    currentFrame={state.currentFrame}
    itemFrom={state.itemFrom}
    totalFrames={state.totalFrames}
    fps={state.fps}
    onKeyframeMove={state.onKeyframeMove}
    timingStripPreviewFrames={state.timingStripPreviewFrames}
    constrainGraphFrameDelta={state.constrainGraphFrameDelta}
    onBezierHandleMove={state.onBezierHandleMove}
    onSelectionChange={state.onSelectionChange}
    onPropertyChange={state.onPropertyChange}
    onScrub={state.onScrub}
    onScrubStart={state.onScrubStart}
    onScrubEnd={state.onScrubEnd}
    onDragStart={state.onDragStart}
    onDragEnd={state.onDragEnd}
    onAddKeyframe={state.onAddKeyframe}
    onRemoveKeyframes={state.onRemoveKeyframes}
    onNavigateToKeyframe={state.onNavigateToKeyframe}
    transitionBlockedRanges={state.transitionBlockedRanges}
    proceduralPreview={state.proceduralPreview}
    snapEnabled={state.snapEnabled}
    graphHandleVisibility={state.showAllGraphHandles ? 'all' : 'selected'}
    graphRulerUnit={state.graphRulerUnit}
    autoZoomGraphHeight={state.autoZoomGraphHeight}
    graphVerticalZoomValue={state.graphVerticalZoomValue}
    hidePlayhead={!state.showPlayhead || state.isSplitView}
    subtractRulerHeight={state.presentation !== 'lanes'}
    customGraphContent={state.graphMode === 'speed' ? state.speedGraphContent : undefined}
  />
{/snippet}

<!-- The affected-frame-range band the classic shell places over the sheet. -->
{#snippet affectedFrameRangeOverlayElement(state: DopesheetPaneElementsState)}
  {#if state.affectedFrameRange && state.affectedFrameRangeGeometry}
    <div
      data-testid="dopesheet-affected-frame-range"
      data-from-frame={state.affectedFrameRange.fromFrame}
      data-to-frame={state.affectedFrameRange.toFrame}
      data-dopesheet-from-frame={state.affectedFrameRange.fromFrame}
      data-dopesheet-to-frame={state.affectedFrameRange.toFrame}
      class="absolute inset-y-0 border-x border-foreground/[0.10] bg-foreground/[0.035]"
      style:left="{state.affectedFrameRangeGeometry.left}px"
      style:width="{state.affectedFrameRangeGeometry.width}px"
    ></div>
  {/if}
{/snippet}
