<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  // Test stand-in for StableVideoSequence: renders each item through renderItem.
  let {
    items,
    renderItem,
  }: { items: Array<{ id: string }>; renderItem: Snippet<[{ id: string }]> } = $props()
</script>

<div data-testid="stable-video-sequence">
  {#each items as item (item.id)}
    <div data-video-id={item.id}>{@render renderItem(item)}</div>
  {/each}
</div>
