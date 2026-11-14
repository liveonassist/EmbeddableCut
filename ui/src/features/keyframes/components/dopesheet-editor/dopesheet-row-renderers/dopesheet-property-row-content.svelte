<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import {
    PropertyRowAutoKeyButton,
    PropertyRowAxisConstraintButton,
    PropertyRowCompoundInput,
    PropertyRowCurveButton,
    PropertyRowExpressionButton,
    PropertyRowLinkButton,
    PropertyRowLockButton,
    PropertyRowReset,
    PropertyRowValueInput,
  } from '../property-row-controls'
  import PropertyRowKeyframeNav from '../property-row-keyframe-nav.svelte'
  import {
    resolvePropertyRowExpressionError,
    resolvePropertyRowLabels,
    resolvePropertyRowLinkable,
    resolvePropertyRowPreExpressionValue,
    resolvePropertyRowResetState,
    resolvePropertyRowShellClassName,
  } from '../property-row-view-model'
  import type { DopesheetPropertyRowContentProps } from './types'

  /** One property row's controls. */
  let {
    row,
    options,
    activateProperty,
    axisConstraintByProperty,
    autoKeyEnabledByProperty,
    beginPropertyLink,
    canClearRow,
    compoundPropertyRows,
    compoundSecondaryProperties,
    itemId,
    itemFrom,
    currentFrame,
    fps,
    disabled,
    expressionEditor,
    formatPropertyValue,
    globalFrame,
    graphVisibleProperties,
    handleClearProperty,
    handleRowAutoKeyToggle,
    handleRowNavigate,
    handleRowToggleKeyframe,
    handleRowValueChange,
    handleRowValueCommit,
    handleValueScrubEnd,
    handleValueScrubCancel,
    handleValueScrubMove,
    handleValueScrubStart,
    isPropertyLocked,
    isCurrentFrameBlocked,
    onAddKeyframe,
    onNavigateToKeyframe,
    onCurveVisibilityChange,
    onDragCancel,
    onDragEnd,
    onDragStart,
    onPropertyValueCommit,
    onPropertyValuePreview,
    resolvedPropertyLinks,
    resolvedPropertyLinkSourceLabels,
    removePropertyLink,
    propertyExpressions,
    propertyLabels,
    preExpressionPropertyValues,
    resolveExpressionReference,
    onSetPropertyExpression,
    openPropertyExpressionEditor,
    onResetPropertiesToDefault,
    propertyValues,
    presentation,
    selectedProperty,
    selectedCurveVisibleExternally,
    setAllRowsLocked,
    setEditingValueProperty,
    setValueDrafts,
    showGraphPane,
    showSinglePropertyCurve,
    singleCurveMode,
    skipNextBlurCommitPropertyRef,
    spacious,
    t,
    togglePropertyCurve,
    toggleLockedProperty,
    valueDraftAtFocusRef,
    valueDrafts,
  }: DopesheetPropertyRowContentProps = $props()

  const classic = $derived(options?.classic ?? false)
  const rowLocked = $derived(isPropertyLocked(row.property))
  const axisConstraint = $derived(axisConstraintByProperty[row.property])
  const compoundRow = $derived(compoundPropertyRows[row.property])
  const labels = $derived(
    resolvePropertyRowLabels(row.property, propertyLabels, compoundRow, t),
  )
  const linkableProperty = $derived(resolvePropertyRowLinkable(row.property, compoundRow))
  const propertyLink = $derived(
    linkableProperty
      ? resolvedPropertyLinks.find((link) => link.targetProperty === linkableProperty)
      : undefined,
  )
  const propertyExpression = $derived(
    linkableProperty
      ? propertyExpressions.find((expression) => expression.targetProperty === linkableProperty)
      : undefined,
  )
  const preExpressionValue = $derived(
    resolvePropertyRowPreExpressionValue(
      row.property,
      compoundRow,
      preExpressionPropertyValues,
      propertyValues,
    ),
  )
  const expressionError = $derived(
    resolvePropertyRowExpressionError({
      linkableProperty,
      preExpressionValue,
      expressionEditor,
      propertyExpression,
      globalFrame,
      itemFrom,
      currentFrame,
      fps,
      resolveExpressionReference,
    }),
  )
  const resetState = $derived(
    resolvePropertyRowResetState({
      property: row.property,
      rowLabel: labels.rowLabel,
      hasResetToDefault: !!onResetPropertiesToDefault,
      disabled,
      rowLocked,
      canClear: canClearRow(row),
      t,
    }),
  )
  const autoKeyEnabled = $derived(autoKeyEnabledByProperty[row.property] ?? false)
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class={resolvePropertyRowShellClassName({
    isLanes: presentation === 'lanes',
    rowOptions: options,
    hasKeyframeAtCurrentFrame: row.controls.hasKeyframeAtCurrentFrame,
    showGraphPane,
    selectedProperty,
    property: row.property,
    graphProperties: graphVisibleProperties,
    rowLocked,
  })}
  data-expression-item-id={linkableProperty ? itemId : undefined}
  data-expression-property={linkableProperty ?? undefined}
  data-selected={selectedProperty === row.property ? 'true' : undefined}
  aria-current={selectedProperty === row.property ? 'true' : undefined}
  onclick={!rowLocked ? () => activateProperty(row.property) : undefined}
>
  <div class="flex items-center gap-px self-stretch">
    <PropertyRowCurveButton
      property={row.property}
      rowLabel={labels.rowLabel}
      singleCurveMode={singleCurveMode ?? false}
      {showGraphPane}
      {selectedCurveVisibleExternally}
      {selectedProperty}
      graphProperties={graphVisibleProperties}
      visible={!classic}
      {onCurveVisibilityChange}
      {showSinglePropertyCurve}
      {togglePropertyCurve}
      {t}
    />
    <PropertyRowLockButton
      {rowLocked}
      property={row.property}
      rowLabel={labels.rowLabel}
      visible={!classic}
      {setAllRowsLocked}
      {toggleLockedProperty}
      {t}
    />
    <PropertyRowAutoKeyButton
      property={row.property}
      rowLabel={labels.rowLabel}
      autoKeyEnabled={autoKeyEnabledByProperty[row.property]}
      {disabled}
      {rowLocked}
      canCommit={!!onPropertyValueCommit}
      onToggleAutoKey={handleRowAutoKeyToggle}
      {t}
    />
    <PropertyRowLinkButton
      {linkableProperty}
      rowLabel={labels.rowLabel}
      visible={!classic}
      hasPropertyLink={!!propertyLink}
      sourceLabels={resolvedPropertyLinkSourceLabels}
      linkSource={propertyLink}
      onBeginLink={beginPropertyLink}
      onRemoveLink={removePropertyLink}
      {t}
    />
    <PropertyRowExpressionButton
      {linkableProperty}
      rowLabel={labels.rowLabel}
      visible={!classic}
      canEdit={!!onSetPropertyExpression}
      {expressionError}
      {disabled}
      {rowLocked}
      {propertyExpression}
      onOpenExpression={openPropertyExpressionEditor}
    />
  </div>
  <div
    class={cn(
      'flex h-full min-w-0 items-center overflow-hidden pr-1 text-[9px] font-medium leading-none text-foreground/90',
      compoundRow ? 'w-[54px] shrink-0 pl-1' : classic ? 'flex-1 pl-1' : 'flex-1 pl-[10px]',
    )}
    title={labels.rowLabel}
  >
    <span class="min-w-0 truncate">{labels.rowDisplayLabel}</span><PropertyRowAxisConstraintButton
      {axisConstraint}
      visible={classic}
      {disabled}
      {rowLocked}
    />
  </div>
  <div class="ml-auto flex items-center gap-0">
    {#if compoundRow}
      <PropertyRowCompoundInput
        property={row.property}
        {compoundRow}
        {compoundSecondaryProperties}
        {spacious}
        {disabled}
        {rowLocked}
        hasPropertyLink={!!propertyLink}
        hasKeyframeAtCurrentFrame={row.controls.hasKeyframeAtCurrentFrame}
        {isCurrentFrameBlocked}
        {autoKeyEnabled}
        {activateProperty}
        {onDragStart}
        {onDragEnd}
        {onDragCancel}
        {onPropertyValuePreview}
      />
    {:else}
      <PropertyRowValueInput
        property={row.property}
        rowLabel={labels.rowLabel}
        {spacious}
        hasPropertyLink={!!propertyLink}
        {disabled}
        {rowLocked}
        canCommit={!!onPropertyValueCommit}
        hasKeyframeAtCurrentFrame={row.controls.hasKeyframeAtCurrentFrame}
        {isCurrentFrameBlocked}
        {autoKeyEnabled}
        {propertyValues}
        {valueDrafts}
        {valueDraftAtFocusRef}
        {skipNextBlurCommitPropertyRef}
        onValueChange={handleRowValueChange}
        onScrubStart={handleValueScrubStart}
        onScrubMove={handleValueScrubMove}
        onScrubEnd={handleValueScrubEnd}
        onScrubCancel={handleValueScrubCancel}
        onValueCommit={handleRowValueCommit}
        onFocusProperty={activateProperty}
        onEditingChange={setEditingValueProperty}
        onDraftsChange={setValueDrafts}
        formatDisplayValue={formatPropertyValue}
        {t}
      />
    {/if}
    <PropertyRowKeyframeNav
      property={row.property}
      rowLabel={labels.rowLabel}
      prevKeyframe={row.controls.prevKeyframe}
      nextKeyframe={row.controls.nextKeyframe}
      currentKeyframes={row.controls.currentKeyframes}
      hasKeyframeAtCurrentFrame={row.controls.hasKeyframeAtCurrentFrame}
      {disabled}
      {rowLocked}
      {isCurrentFrameBlocked}
      canNavigate={!!onNavigateToKeyframe}
      canAddKeyframe={!!onAddKeyframe}
      onNavigate={handleRowNavigate}
      onToggleKeyframe={handleRowToggleKeyframe}
      {t}
    />
    <PropertyRowReset
      {classic}
      canResetRow={resetState.canResetRow}
      resetRowLabel={resetState.resetRowLabel}
      canResetEffectProperty={resetState.canResetEffectProperty}
      property={row.property}
      onResetToDefault={onResetPropertiesToDefault}
      onClearProperty={handleClearProperty}
    />
  </div>
</div>
