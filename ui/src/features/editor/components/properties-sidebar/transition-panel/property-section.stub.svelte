<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Stands in for `PropertySection` in tests: a plain section. */
  let { children }: { children: Snippet } = $props()
</script>

<section>{@render children()}</section>
