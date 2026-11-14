<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    children,
    layoutSize,
    style,
  }: {
    children?: Snippet
    layoutSize?: { width: number; height: number }
    style?: string
  } & Record<string, unknown> = $props()
</script>

<div
  data-testid="player"
  data-layout-width={layoutSize?.width}
  data-layout-height={layoutSize?.height}
  {style}
>
  {@render children?.()}
</div>
