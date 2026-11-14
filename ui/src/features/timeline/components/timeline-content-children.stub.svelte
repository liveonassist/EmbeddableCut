<!-- SPDX-License-Identifier: MIT -->
<!-- Stands in for the track row frames: renders only the row's content. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children }: { children?: Snippet } = $props()
</script>

<div>{@render children?.()}</div>
