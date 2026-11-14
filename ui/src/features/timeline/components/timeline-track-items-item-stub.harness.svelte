<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'

  interface Props {
    item: TimelineItem
    isCompactWidth: boolean
    isDetailEligible: boolean
  }

  let { item, isCompactWidth, isDetailEligible }: Props = $props()
</script>

<div
  data-item-id={item.id}
  data-rich-item-id={item.id}
  data-compact-width={String(isCompactWidth)}
  data-detail-eligible={String(isDetailEligible)}
></div>
