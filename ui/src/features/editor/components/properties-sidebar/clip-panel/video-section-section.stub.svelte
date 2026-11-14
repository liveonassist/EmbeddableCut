<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Stands in for `PropertySection` in tests: renders its children only. */
  let { children }: { children: Snippet } = $props()
</script>

{@render children()}
