<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { MINI_ICON_BUTTON_CLASS } from '../dopesheet-constants'
  import { DopesheetResetButton } from '../property-row-controls'
  import type { GroupResetProps } from './types'

  let {
    groupId,
    canResetGroup,
    resetGroupLabel,
    canResetEffectGroup,
    groupProperties,
    onResetToDefault,
    onClearGroup,
  }: GroupResetProps = $props()
</script>

{#if !canResetGroup}
  <span
    aria-hidden="true"
    class={MINI_ICON_BUTTON_CLASS}
    data-testid="dopesheet-group-reset-spacer-{groupId}"
  ></span>
{:else}
  <DopesheetResetButton
    label={resetGroupLabel}
    onReset={() => {
      if (canResetEffectGroup) {
        onResetToDefault?.(groupProperties)
      } else {
        onClearGroup()
      }
    }}
  />
{/if}
