<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setCollecting } from './context'

  // Mounts closed content so its items register their labels (see context.ts); renders nothing visible.
  let { children }: { children?: Snippet } = $props()
  setCollecting()
</script>

<div hidden aria-hidden="true">{@render children?.()}</div>
