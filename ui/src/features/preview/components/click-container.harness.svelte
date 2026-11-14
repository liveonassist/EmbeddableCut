<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Component } from 'svelte'

  // A canvas-like parent that records clicks reaching it, around any component.
  let {
    component: Inner,
    props,
    onContainerClick,
  }: {
    // oxlint-disable-next-line typescript/no-explicit-any
    component: Component<any>
    props: Record<string, unknown>
    onContainerClick: () => void
  } = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclick={onContainerClick}>
  <Inner {...props} />
</div>
