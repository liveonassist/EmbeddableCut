<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    setNestedMediaResolutionMode,
    type NestedMediaResolutionMode,
  } from './nested-media-resolution-context'

  let { value, children }: { value: NestedMediaResolutionMode; children: Snippet } = $props()

  setNestedMediaResolutionMode({
    get current() {
      return value
    },
  })
</script>

{@render children()}
