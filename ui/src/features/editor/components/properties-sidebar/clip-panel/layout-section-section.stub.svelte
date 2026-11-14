<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { layoutTestState } from './layout-section.test-state'

  /** Stands in for `PropertySection` in the layout-section test; counts mounts. */
  let { children }: { children: Snippet } = $props()
  layoutTestState.sectionMountCount += 1
</script>

<section>{@render children()}</section>
