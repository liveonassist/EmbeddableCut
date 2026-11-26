<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { getKeyframePropertyLabel } from '@/features/keyframes/utils/property-i18n'
  import DopesheetParameterMenu from './dopesheet-parameter-menu.svelte'
  import DopesheetHeaderFrameInputs from './dopesheet-header-frame-inputs.svelte'
  import DopesheetInterpolationButtons from './dopesheet-interpolation-buttons.svelte'
  import DopesheetClipboardActions from './dopesheet-clipboard-actions.svelte'
  import DopesheetEditActions from './dopesheet-edit-actions.svelte'
  import DopesheetLegendPopover from './dopesheet-legend-popover.svelte'
  import DopesheetViewOptionsMenu from './dopesheet-view-options-menu.svelte'
  import type { DopesheetToolbarProps } from './dopesheet-toolbar'

  let {
    disabled,
    hasAvailableProperties,
    filterKeyframedOnly,
    onToggleKeyframedOnly,
    allPropertyGroups,
    visibleGroups,
    onToggleVisibleGroup,
    onExpandAllGroups,
    onCollapseAllGroups,
    onResetParameterView,
    hasPropertyFilters,
    showGraphPane,
    graphDisplayProperty,
    compoundPropertyRows,
    speedGraphContent,
    onGraphModeChange,
    graphMode,
    keyframeCount,
    isCurrentFrameBlocked,
    canBakeMotion,
    onBakeMotion,
    headerFrameInputsEnabled,
    totalFrames,
    globalFrame,
    localFrameInputValue,
    globalFrameInputValue,
    setLocalFrameInputValue,
    setGlobalFrameInputValue,
    skipNextHeaderFrameBlurRef,
    commitLocalFrameInput,
    commitGlobalFrameInput,
    handleHeaderFrameInputKeyDown,
    interpolationOptions,
    selectedInterpolation,
    interpolationDisabled,
    onInterpolationChange,
    hasSelection,
    hasKeyframeClipboard,
    isKeyframeClipboardCut,
    onCopyKeyframes,
    onCutKeyframes,
    onPasteKeyframes,
    removeKeyframesAvailable,
    handleRemoveKeyframes,
    horizontalZoomValue,
    horizontalZoomRatioBase,
    setHorizontalZoomValue,
    resetViewport,
    graphVerticalZoomValue,
    graphPropertyCount,
    verticalZoomRatioBase,
    setGraphVerticalZoomValue,
    graphRulerUnit,
    onChangeRulerUnit,
    showAllGraphHandles,
    onToggleGraphHandleVisibility,
    autoZoomGraphHeight,
    onToggleAutoZoomGraphHeight,
  }: DopesheetToolbarProps = $props()

  const GRAPH_MODES = ['value', 'speed'] as const
</script>

<div class="flex items-center justify-between px-2 flex-shrink-0 min-h-7">
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1">
      <span class="text-xs text-muted-foreground">
        {t('timeline.keyframeEditor.parameters')}
      </span>
      <DopesheetParameterMenu
        {disabled}
        {hasAvailableProperties}
        parameterFilter={filterKeyframedOnly ? 'keyframed' : 'all'}
        {onToggleKeyframedOnly}
        {allPropertyGroups}
        {visibleGroups}
        {onToggleVisibleGroup}
        onExpandAll={onExpandAllGroups}
        onCollapseAll={onCollapseAllGroups}
        {onResetParameterView}
      />
    </div>

    {#if hasPropertyFilters}
      <span class="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {t('timeline.keyframeEditor.filtered')}
      </span>
    {/if}

    {#if showGraphPane && graphDisplayProperty}
      <span class="text-xs text-muted-foreground">
        {t('timeline.keyframeEditor.graphLabel', {
          property:
            compoundPropertyRows[graphDisplayProperty]?.label ??
            getKeyframePropertyLabel(t as TFunction, graphDisplayProperty),
        })}
      </span>
    {/if}

    {#if showGraphPane && speedGraphContent && onGraphModeChange}
      <div
        class="flex h-6 items-center rounded border border-border/70 bg-background/80 p-0.5"
        role="group"
        aria-label={t('timeline.keyframeEditor.graphType', {
          defaultValue: 'Graph type',
        })}
      >
        {#each GRAPH_MODES as mode (mode)}
          <button
            type="button"
            class={cn(
              'h-5 rounded px-2 text-[10px] font-medium text-muted-foreground active:scale-[0.97]',
              graphMode === mode && 'bg-muted text-foreground',
            )}
            aria-pressed={graphMode === mode}
            onclick={() => onGraphModeChange(mode)}
          >
            {mode === 'value'
              ? t('timeline.keyframeEditor.valueGraph', {
                  defaultValue: 'Value',
                })
              : t('timeline.keyframeEditor.speedGraph', {
                  defaultValue: 'Speed',
                })}
          </button>
        {/each}
      </div>
    {/if}

    <span class="text-xs text-muted-foreground">
      {t('timeline.keyframeEditor.keyframes', {
        count: keyframeCount,
      })}
    </span>

    {#if isCurrentFrameBlocked}
      <span
        class="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
        title={t('timeline.keyframeEditor.transitionBlocked')}
      >
        {t('timeline.keyframeEditor.transitionBlockedPill')}
      </span>
    {/if}

    {#if canBakeMotion && onBakeMotion}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 gap-1 px-1.5 text-[11px] text-sky-300 hover:text-sky-200"
        onclick={onBakeMotion}
        title={t('timeline.keyframeEditor.bakeMotionHint')}
      >
        <Sparkles class="h-3 w-3" />
        {t('timeline.keyframeEditor.bakeMotion')}
      </Button>
    {/if}

    <DopesheetHeaderFrameInputs
      {disabled}
      inputsEnabled={headerFrameInputsEnabled}
      {totalFrames}
      {globalFrame}
      {localFrameInputValue}
      {globalFrameInputValue}
      {setLocalFrameInputValue}
      {setGlobalFrameInputValue}
      {skipNextHeaderFrameBlurRef}
      {commitLocalFrameInput}
      {commitGlobalFrameInput}
      {handleHeaderFrameInputKeyDown}
    />
  </div>

  <div class="flex items-center gap-1.5">
    <DopesheetInterpolationButtons
      options={interpolationOptions}
      selected={selectedInterpolation}
      disabled={disabled || interpolationDisabled}
      onSelect={onInterpolationChange}
    />
    <DopesheetClipboardActions
      {disabled}
      {hasSelection}
      {hasKeyframeClipboard}
      {isKeyframeClipboardCut}
      {onCopyKeyframes}
      {onCutKeyframes}
      {onPasteKeyframes}
    />
    <DopesheetEditActions
      {disabled}
      {hasSelection}
      {removeKeyframesAvailable}
      {handleRemoveKeyframes}
      {horizontalZoomValue}
      horizontalZoomDisabled={horizontalZoomRatioBase <= 1}
      {setHorizontalZoomValue}
      {resetViewport}
      visualizationMode={showGraphPane ? 'graph' : 'dopesheet'}
      {graphVerticalZoomValue}
      verticalZoomDisabled={graphPropertyCount === 0 || verticalZoomRatioBase <= 1}
      {setGraphVerticalZoomValue}
    />
    <DopesheetLegendPopover {disabled} />
    <DopesheetViewOptionsMenu
      {disabled}
      visualizationMode={showGraphPane ? 'graph' : 'dopesheet'}
      {graphRulerUnit}
      {onChangeRulerUnit}
      graphHandleVisibility={showAllGraphHandles ? 'all' : 'selected'}
      {onToggleGraphHandleVisibility}
      {autoZoomGraphHeight}
      {onToggleAutoZoomGraphHeight}
    />
  </div>
</div>
