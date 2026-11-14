<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  // Test stand-in for VideoContent (given an item) and Sequence (given children).
  let {
    item,
    children,
  }: { item?: { id: string; crop?: { softness?: number } }; children?: Snippet } = $props()
</script>

{#if item}
  <div data-testid="shadow-video-{item.id}" data-softness={item.crop?.softness ?? ''}></div>
{/if}
{@render children?.()}
