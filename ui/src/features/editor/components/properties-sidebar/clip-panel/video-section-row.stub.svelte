<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Stands in for `PropertyRow` in tests: a row findable by its label. */
  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<div data-testid={`property-row-${label}`}>{@render children()}</div>
