<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { TextItem } from '@/types/timeline'
  import type { TextMotionSlot } from '@/types/text-motion'

  interface TextMotionSlotRowsProps {
    items: TextItem[]
    query?: string
    slots?: readonly TextMotionSlot[]
    showSlotHeading?: boolean
    showEmptyState?: boolean
  }

  let props: TextMotionSlotRowsProps = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>

<div></div>
