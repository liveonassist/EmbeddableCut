<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children, value }: { children: Snippet; value: string } = $props()
</script>

<option {value}>{@render children()}</option>
