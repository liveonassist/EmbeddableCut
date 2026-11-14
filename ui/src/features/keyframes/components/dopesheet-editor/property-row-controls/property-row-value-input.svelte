<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Input } from '@/components/ui/input'
  import { cn } from '@/shared/ui/cn'
  import { isColorAnimatableProperty } from '@/features/keyframes/property-value-ranges'
  import { handleRowValueInputKeyDown, resolveNumericInputRange } from '../property-row-view-model'
  import type { PropertyRowValueInputProps } from './types'

  let {
    property,
    rowLabel,
    spacious,
    hasPropertyLink,
    disabled,
    rowLocked,
    canCommit,
    hasKeyframeAtCurrentFrame,
    isCurrentFrameBlocked,
    autoKeyEnabled,
    propertyValues,
    valueDrafts,
    valueDraftAtFocusRef,
    skipNextBlurCommitPropertyRef,
    onValueChange,
    onScrubStart,
    onScrubMove,
    onScrubEnd,
    onScrubCancel,
    onValueCommit,
    onFocusProperty,
    onEditingChange,
    onDraftsChange,
    formatDisplayValue,
    t,
  }: PropertyRowValueInputProps = $props()

  const isColor = $derived(isColorAnimatableProperty(property))
  const numericRange = $derived(resolveNumericInputRange(property))

  // React's onChange fires for both `input` and `change` events.
  const handleValueEvent = (event: Event & { currentTarget: HTMLInputElement }) =>
    onValueChange(property, event.currentTarget.value)
</script>

<Input
  type={isColor ? 'text' : 'number'}
  autocomplete="off"
  data-bwignore="true"
  value={valueDrafts[property] ?? ''}
  oninput={handleValueEvent}
  onchange={handleValueEvent}
  onpointerdown={(event) => onScrubStart(event, property)}
  onpointermove={(event) => onScrubMove(event, property)}
  onpointerup={(event) => onScrubEnd(event, property)}
  onpointercancel={(event) => onScrubCancel(event, property)}
  onfocus={() => {
    onFocusProperty(property)
    onEditingChange(property)
    valueDraftAtFocusRef.current[property] = valueDrafts[property] ?? ''
  }}
  onblur={() => {
    const draftChanged = valueDraftAtFocusRef.current[property] !== (valueDrafts[property] ?? '')
    delete valueDraftAtFocusRef.current[property]
    if (skipNextBlurCommitPropertyRef.current === property) {
      skipNextBlurCommitPropertyRef.current = null
    } else if (draftChanged) {
      onValueCommit(property, {
        allowCreate: autoKeyEnabled,
      })
    }
    onEditingChange((current) => (current === property ? null : current))
  }}
  onkeydown={(event) =>
    handleRowValueInputKeyDown(event, {
      property,
      propertyValues,
      skipNextBlurCommitPropertyRef,
      onValueCommit,
      onEditingChange,
      onDraftsChange,
      formatDisplayValue,
    })}
  step={numericRange.step}
  min={numericRange.min}
  max={numericRange.max}
  inputmode={isColor ? 'text' : 'decimal'}
  class={cn(
    'h-5 border-border/70 bg-background/85 px-1.5 py-0 text-right text-[10px] leading-none tabular-nums md:text-[10px]',
    '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
    isColor ? 'w-[68px]' : spacious ? 'w-[80px]' : 'w-[44px]',
    !isColor && 'cursor-ew-resize select-none',
    hasPropertyLink && 'text-orange-400',
  )}
  disabled={disabled ||
    rowLocked ||
    hasPropertyLink ||
    !canCommit ||
    (!hasKeyframeAtCurrentFrame && isCurrentFrameBlocked)}
  aria-label={t('timeline.keyframeEditor.propertyValueAtPlayhead', {
    property: rowLabel,
    defaultValue: `${rowLabel} value at playhead`,
  })}
  title={t('timeline.keyframeEditor.scrubPropertyValue', {
    property: rowLabel,
    defaultValue: `Drag horizontally to adjust ${rowLabel}. Hold Shift for fine or Alt for ultra-fine control.`,
  })}
/>
