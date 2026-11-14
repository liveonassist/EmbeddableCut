<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'

  /** Calls `reset` once `key` changes: a caught route error clears when the location moves on. */
  let { key, reset }: { key: string; reset: () => void } = $props()

  // svelte-ignore state_referenced_locally
  const initial = key

  $effect(() => {
    if (key !== initial) untrack(reset)
  })
</script>
