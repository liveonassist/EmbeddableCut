<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Stands in for `PropertyRow` in the layout-section test. */
  let { children }: { children: Snippet } = $props()
</script>

<div>{@render children()}</div>
