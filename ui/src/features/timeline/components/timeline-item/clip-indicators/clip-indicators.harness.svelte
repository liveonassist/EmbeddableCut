<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ClipIndicators from './clip-indicators.svelte'
  import type { ClipIndicatorsProps } from './types'

  type Props = ClipIndicatorsProps & {
    parentPointerDown: () => void
    parentClick: () => void
  }

  let { parentPointerDown, parentClick, ...indicatorProps }: Props = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onpointerdown={parentPointerDown} onclick={parentClick}>
  <ClipIndicators {...indicatorProps} />
</div>
