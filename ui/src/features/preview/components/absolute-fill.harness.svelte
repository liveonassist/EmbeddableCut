<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children, style }: { children?: Snippet; style?: string } = $props()
</script>

<div data-testid="absolute-fill" {style}>
  {@render children?.()}
</div>
