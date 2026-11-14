<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Dopesheet workspace chrome.
   * The toolbar, the timing strip and the navigator belong to the default
   * workspace shell only; the exclusive (`lanes` and `classic`) shells never
   * render these snippets. React's builder returned the three elements; the
   * editor renders these snippets with its chrome state instead.
   */
  import CompactNavigator from './compact-navigator.svelte'
  import DopesheetToolbar from './dopesheet-toolbar.svelte'
  import KeyframeTimingStrip from './keyframe-timing-strip.svelte'
  import type { DopesheetWorkspaceChromeState } from './dopesheet-workspace-chrome'

  export { toolbarElement, timingStripElement, navigatorElement }
</script>

{#snippet toolbarElement(state: DopesheetWorkspaceChromeState)}
  {@const header = state.headerFrameInputs}
  <DopesheetToolbar
    hasAvailableProperties={state.availableProperties.length > 0}
    filterKeyframedOnly={state.filterKeyframedOnly}
    onToggleKeyframedOnly={() => state.setShowKeyframedOnly((prev) => !prev)}
    allPropertyGroups={state.allPropertyGroups}
    visibleGroups={state.visibleGroups}
    onToggleVisibleGroup={state.toggleVisibleGroup}
    onExpandAllGroups={() => state.setAllGroupsExpanded(true)}
    onCollapseAllGroups={() => state.setAllGroupsExpanded(false)}
    onResetParameterView={state.resetParameterView}
    hasPropertyFilters={state.hasPropertyFilters}
    showGraphPane={state.showGraphPane}
    graphDisplayProperty={state.graphDisplayProperty}
    compoundPropertyRows={state.compoundPropertyRows}
    speedGraphContent={state.speedGraphContent}
    onGraphModeChange={state.onGraphModeChange}
    graphMode={state.graphMode}
    keyframeCount={state.visibleKeyframes.length}
    isCurrentFrameBlocked={state.isCurrentFrameBlocked}
    canBakeMotion={state.canBakeMotion}
    onBakeMotion={state.onBakeMotion}
    headerFrameInputsEnabled={header.inputsEnabled}
    disabled={header.disabled}
    totalFrames={header.totalFrames}
    globalFrame={header.globalFrame}
    localFrameInputValue={header.localFrameInputValue}
    globalFrameInputValue={header.globalFrameInputValue}
    setLocalFrameInputValue={header.setLocalFrameInputValue}
    setGlobalFrameInputValue={header.setGlobalFrameInputValue}
    skipNextHeaderFrameBlurRef={header.skipNextHeaderFrameBlurRef}
    commitLocalFrameInput={header.commitLocalFrameInput}
    commitGlobalFrameInput={header.commitGlobalFrameInput}
    handleHeaderFrameInputKeyDown={header.handleHeaderFrameInputKeyDown}
    interpolationOptions={state.interpolationOptions}
    selectedInterpolation={state.selectedInterpolation}
    interpolationDisabled={state.interpolationDisabled}
    onInterpolationChange={state.onInterpolationChange}
    hasSelection={state.selectedRefs.length > 0}
    hasKeyframeClipboard={state.hasKeyframeClipboard}
    isKeyframeClipboardCut={state.isKeyframeClipboardCut}
    onCopyKeyframes={state.onCopyKeyframes}
    onCutKeyframes={state.onCutKeyframes}
    onPasteKeyframes={state.onPasteKeyframes}
    removeKeyframesAvailable={Boolean(state.onRemoveKeyframes)}
    handleRemoveKeyframes={state.handleRemoveKeyframes}
    horizontalZoomValue={state.horizontalZoomValue}
    horizontalZoomRatioBase={state.horizontalZoomRatioBase}
    setHorizontalZoomValue={state.setHorizontalZoomValue}
    resetViewport={state.resetViewport}
    graphVerticalZoomValue={state.graphVerticalZoomValue}
    graphPropertyCount={state.visibleGraphProperties.length}
    verticalZoomRatioBase={state.verticalZoomRatioBase}
    setGraphVerticalZoomValue={state.setGraphVerticalZoomValue}
    graphRulerUnit={state.graphRulerUnit}
    onChangeRulerUnit={state.setGraphRulerUnit}
    showAllGraphHandles={state.showAllGraphHandles}
    onToggleGraphHandleVisibility={() => state.setShowAllGraphHandles((prev) => !prev)}
    autoZoomGraphHeight={state.autoZoomGraphHeight}
    onToggleAutoZoomGraphHeight={() => state.setAutoZoomGraphHeight((prev) => !prev)}
  />
{/snippet}

{#snippet timingStripElement(state: DopesheetWorkspaceChromeState)}
  {#if state.showGraphPane}
    <div class="grid" style={state.propertyGridStyle}>
      <div class="h-4 border-t border-r border-border/60 bg-background/80"></div>
      <div data-testid="keyframe-timing-strip-viewport-column">
        <KeyframeTimingStrip
          viewport={state.viewport}
          contentFrameMax={state.contentFrameMax}
          markers={state.timingStripMarkers}
          previewFrames={state.timingStripPreviewFrames}
          disabled={state.disabled || state.timingStripMarkers.length === 0}
          onSelectionChange={state.handleTimingStripSelectionChange}
          onSlideStart={state.handleTimingStripSlideStart}
          onSlideChange={state.handleTimingStripSlideChange}
          onSlideEnd={state.handleTimingStripSlideEnd}
        />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet navigatorElement(state: DopesheetWorkspaceChromeState)}
  <div class="grid" style={state.propertyGridStyle}>
    <div
      data-testid="keyframe-navigator-property-column"
      class="h-5 border-t border-r border-border/60 bg-background/80"
    ></div>
    <div data-testid="keyframe-navigator-viewport-column">
      <CompactNavigator
        viewport={state.viewport}
        currentFrame={state.currentFrame}
        contentFrameMax={state.contentFrameMax}
        minVisibleFrames={state.minViewportFrames}
        disabled={state.disabled}
        onViewportChange={state.updateViewport}
      />
    </div>
  </div>
{/snippet}
