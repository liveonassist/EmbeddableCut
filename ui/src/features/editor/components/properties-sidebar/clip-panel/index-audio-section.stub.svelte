<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'

  /** Stands in for `AudioSection` in tests: exposes the items it edits. */
  let { items }: { items: TimelineItem[] } = $props()
</script>

<div data-testid="audio-body" data-item-ids={items.map((item) => item.id).join(',')}>
  Audio Body
</div>
