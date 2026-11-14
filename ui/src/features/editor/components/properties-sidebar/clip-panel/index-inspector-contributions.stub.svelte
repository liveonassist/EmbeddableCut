<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'

  /** Stands in for `InspectorContributions` in tests: exposes the item it was given. */
  let { item }: { item: TimelineItem } = $props()
</script>

<div data-testid="inspector-contributions" data-item-id={item.id}></div>
