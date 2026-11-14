<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { TimelineItem } from '@/types/timeline'
  import { clipPanelTestState } from './index.test-state'

  /** Stands in for `LayoutSection` in tests: counts the item updates it receives. */
  let { items }: { items: TimelineItem[] } = $props()

  $effect.pre(() => {
    const firstItem = items[0]
    untrack(() => {
      clipPanelTestState.layoutRenderCount += 1
      clipPanelTestState.latestLayoutItemId = firstItem?.id ?? null
      clipPanelTestState.latestLayoutX =
        firstItem && 'transform' in firstItem ? (firstItem.transform?.x ?? null) : null
    })
  })
</script>

<div>Layout Body</div>
