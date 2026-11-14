<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { MINI_ICON_BUTTON_CLASS } from '../dopesheet-constants'
  import DopesheetResetButton from './dopesheet-reset-button.svelte'
  import type { PropertyRowResetProps } from './types'

  let {
    classic,
    canResetRow,
    resetRowLabel,
    canResetEffectProperty,
    property,
    onResetToDefault,
    onClearProperty,
  }: PropertyRowResetProps = $props()
</script>

{#if !classic}
  {#if !canResetRow}
    <span
      aria-hidden="true"
      class={MINI_ICON_BUTTON_CLASS}
      data-testid="dopesheet-row-reset-spacer-{property}"
    ></span>
  {:else}
    <DopesheetResetButton
      label={resetRowLabel}
      onReset={() => {
        if (canResetEffectProperty) {
          onResetToDefault?.([property])
        } else {
          onClearProperty(property)
        }
      }}
    />
  {/if}
{/if}
