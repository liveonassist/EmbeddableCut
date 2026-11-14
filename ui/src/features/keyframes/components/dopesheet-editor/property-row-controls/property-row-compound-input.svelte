<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CompoundPropertyInputs from '../compound-property-inputs.svelte'
  import type { CompoundPropertyInputConfig } from '../compound-property-inputs'
  import type { PropertyRowCompoundInputProps } from './types'

  let {
    property,
    compoundRow,
    compoundSecondaryProperties,
    spacious,
    disabled,
    rowLocked,
    hasPropertyLink,
    hasKeyframeAtCurrentFrame,
    isCurrentFrameBlocked,
    autoKeyEnabled,
    activateProperty,
    onDragStart,
    onDragEnd,
    onDragCancel,
    onPropertyValuePreview,
  }: PropertyRowCompoundInputProps = $props()

  const config = $derived<CompoundPropertyInputConfig>({
    ...compoundRow,
    disabled:
      compoundRow.disabled ||
      disabled ||
      rowLocked ||
      hasPropertyLink ||
      (!hasKeyframeAtCurrentFrame && isCurrentFrameBlocked),
    linked: hasPropertyLink,
    allowCreateOnBlur: autoKeyEnabled,
    onScrubStart: (axis) => {
      const scrubProperty =
        axis === 'y' ? (compoundSecondaryProperties[property] ?? property) : property
      activateProperty(scrubProperty)
      if (compoundRow.onScrubStart) compoundRow.onScrubStart(axis)
      else onDragStart?.()
    },
    onScrubPreview:
      compoundRow.onScrubPreview || onPropertyValuePreview
        ? (axis, value) => {
            if (compoundRow.onScrubPreview) {
              compoundRow.onScrubPreview(axis, value)
              return
            }
            const scrubProperty =
              axis === 'y' ? (compoundSecondaryProperties[property] ?? property) : property
            onPropertyValuePreview?.(scrubProperty, value)
          }
        : undefined,
    onScrubEnd: compoundRow.onScrubEnd
      ? compoundRow.onScrubEnd
      : onPropertyValuePreview
        ? () => onDragEnd?.()
        : undefined,
    onScrubCancel: compoundRow.onScrubCancel
      ? compoundRow.onScrubCancel
      : onPropertyValuePreview
        ? () => onDragCancel?.()
        : undefined,
  })
</script>

<CompoundPropertyInputs {spacious} {config} />
