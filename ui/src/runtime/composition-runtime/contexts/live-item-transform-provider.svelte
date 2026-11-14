<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    setLiveItemTransformContext,
    type LiveItemTransformSource,
  } from './live-item-transform-context.svelte'

  let { source, children }: { source?: LiveItemTransformSource; children: Snippet } = $props()

  setLiveItemTransformContext({
    get current() {
      return source ?? null
    },
  })
</script>

{@render children()}
