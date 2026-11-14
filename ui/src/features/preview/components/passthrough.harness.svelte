<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  // A mocked wrapper (provider, tooltip, menu part) that only renders what it wraps.
  let {
    children,
    child,
  }: {
    children?: Snippet
    child?: Snippet<[{ props: Record<string, unknown> }]>
  } & Record<string, unknown> = $props()
</script>

{#if child}
  {@render child({ props: {} })}
{:else}
  {@render children?.()}
{/if}
