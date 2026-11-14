<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import SelectableItem from './selectable-item.svelte'

  let {
    onContainerClick,
    ...props
  }: ComponentProps<typeof SelectableItem> & { onContainerClick: () => void } = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclick={onContainerClick}>
  <SelectableItem {...props} />
</div>
